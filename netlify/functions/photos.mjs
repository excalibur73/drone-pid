/* Portfolio photo, une galerie par journée.
 *
 * Rien n'est jamais réécrit ici. Une première version tenait un inventaire
 * par personne — un tableau lu, modifié, réécrit à chaque dépôt. Entre
 * personnes le risque était nul, chacune n'écrivant que son fichier ; mais
 * la même personne depuis deux appareils, ou un envoi rejoué après une
 * coupure, pouvait faire disparaître une ligne, et deux dépôts simultanés
 * franchir le quota en lisant tous deux « quatre ».
 *
 * Chaque photo possède donc sa propre clé, qu'aucune autre écriture ne
 * touche. Tout ce qu'on doit savoir d'elle tient dans le nom de cette clé :
 *
 *     idx/<qui>/<jour>/<horodatage>/<largeur>x<hauteur>/<format>/<id>
 *
 * L'inventaire se lit alors d'un seul parcours de noms, sans ouvrir un
 * fichier. Une écriture ne peut pas en écraser une autre, puisque deux
 * photos n'ont jamais la même clé — l'identifiant est tiré au sort.
 *
 * Les octets de l'image vivent à part, sous cet identifiant seul. Ils ne
 * changent jamais : le navigateur peut les garder indéfiniment.
 */
import { getStore } from "@netlify/blobs";

const QUI_VALIDES = ["hilal", "layal", "sana", "papa"];
const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const TYPE = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };
const POIDS_MAX = 4 * 1024 * 1024;
/* Une vraie photo fait au moins quelques centaines de pixels. En deçà, c'est
   une icône, une image d'essai ou un fichier abîmé : refusé plutôt que rangé
   dans l'album, où l'on ne verrait qu'un rectangle de couleur. */
const COTE_MIN = 200;
/* Cinq photos par personne et par journée — cinquante-cinq au plus sur les
   onze jours. Tenu ici et pas seulement à l'écran : une limite qu'on
   contourne en rechargeant la page n'en est pas une. */
const QUOTA = 5;

const images = () => getStore({ name: "photos-athenes-2026", consistency: "strong" });
const index  = () => getStore({ name: "photos-index-2026", consistency: "strong" });

/* « idx/sana/3/2026-08-19T18:04:11.002Z/1600x1200/jpg/4f2a… » se relit sans
   rien ouvrir. Aucun champ ne contient de barre oblique. */
const lireCle = (cle) => {
  const p = cle.split("/");
  if (p.length !== 7 || p[0] !== "idx") return null;
  const [, qui, jour, ts, taille, ext, id] = p;
  const [w, h] = taille.split("x").map(Number);
  return { id, qui, jour, ts, w: w || null, h: h || null, type: TYPE[ext] || "image/jpeg", cle };
};

async function inventaire(prefix = "idx/"){
  const { blobs } = await index().list({ prefix });
  return blobs.map((b) => lireCle(b.key)).filter(Boolean)
    .sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
}

export default async (req) => {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");

  if (req.method === "GET") {
    if (id) {
      if (!/^[0-9a-z]{6,40}$/.test(id)) return new Response("Identifiant invalide", { status: 400 });
      const res = await images().getWithMetadata(id, { type: "arrayBuffer" });
      if (!res || !res.data) return new Response("Introuvable", { status: 404 });
      return new Response(res.data, {
        headers: {
          "content-type": (res.metadata && res.metadata.type) || "image/jpeg",
          "cache-control": "public, max-age=31536000, immutable"
        }
      });
    }
    const photos = (await inventaire()).map(({ cle, ...p }) => p);
    return Response.json({ photos, quota: QUOTA }, { headers: { "cache-control": "no-store" } });
  }

  if (req.method === "POST") {
    const qui = url.searchParams.get("qui");
    const jour = String(parseInt(url.searchParams.get("jour"), 10));
    const type = req.headers.get("content-type") || "";
    if (!QUI_VALIDES.includes(qui)) return new Response("Auteur inconnu", { status: 400 });
    if (!(+jour >= 1 && +jour <= 11)) return new Response("Jour hors séjour", { status: 400 });
    if (!EXT[type]) return new Response("Format non accepté", { status: 415 });

    /* La date de prise de vue ne barre plus la route. Elle servait à ranger
       chaque cliché sous sa journée ; en pratique elle refusait des photos
       parfaitement légitimes — une capture d'écran, une image reçue d'un
       autre téléphone, un appareil à l'heure fausse. On la conserve, pour
       l'afficher et pour signaler doucement un décalage, mais c'est celui
       qui dépose qui décide. */
    const pris = url.searchParams.get("pris");
    const prise = pris && /^\d{4}-\d{2}-\d{2}$/.test(pris) ? pris : "";

    const deja = await inventaire(`idx/${qui}/${jour}/`);
    if (deja.length >= QUOTA)
      return Response.json({ erreur: "quota", quota: QUOTA, jour, deposees: deja.length }, { status: 409 });

    const octets = await req.arrayBuffer();
    if (!octets.byteLength) return new Response("Image vide", { status: 400 });
    if (octets.byteLength > POIDS_MAX) return new Response("Image trop lourde", { status: 413 });

    /* Identifiant tiré au sort : deux dépôts au même instant ne peuvent pas
       se retrouver sous la même clé, et une adresse d'image ne se devine pas. */
    const id2 = [...crypto.getRandomValues(new Uint8Array(12))]
      .map((b) => b.toString(36).padStart(2, "0")).join("").slice(0, 20);
    const w = Math.max(0, parseInt(url.searchParams.get("w"), 10) || 0);
    const h = Math.max(0, parseInt(url.searchParams.get("h"), 10) || 0);
    if (Math.max(w, h) < COTE_MIN)
      return Response.json({ erreur: "trop-petite", minimum: COTE_MIN, recu: `${w}x${h}` }, { status: 422 });

    await images().set(id2, octets, { metadata: prise ? { type, prise } : { type } });
    const cle = `idx/${qui}/${jour}/${new Date().toISOString()}/${w}x${h}/${EXT[type]}/${id2}`;
    await index().set(cle, "");

    /* Deux envois partis ensemble ont pu passer le contrôle du quota tous
       les deux. On recompte après coup : le dernier arrivé se retire. */
    const apres = await inventaire(`idx/${qui}/${jour}/`);
    if (apres.length > QUOTA && apres[apres.length - 1].id === id2){
      await index().delete(cle);
      await images().delete(id2);
      return Response.json({ erreur: "quota", quota: QUOTA, jour, deposees: QUOTA }, { status: 409 });
    }
    return Response.json({ ok: true, id: id2, jour });
  }

  if (req.method === "DELETE") {
    const qui = url.searchParams.get("qui");
    if (!QUI_VALIDES.includes(qui)) return new Response("Auteur inconnu", { status: 400 });
    if (!id) return new Response("Identifiant manquant", { status: 400 });
    /* On ne cherche que dans ses propres clés : celles des autres ne sont
       même pas parcourues, donc pas davantage supprimables. */
    const sienne = (await inventaire(`idx/${qui}/`)).find((p) => p.id === id);
    if (!sienne) return new Response("Pas la vôtre", { status: 403 });
    await index().delete(sienne.cle);
    await images().delete(id);
    return Response.json({ ok: true, supprime: id });
  }

  return new Response("Méthode non permise", { status: 405 });
};

export const config = { path: "/api/photos" };
