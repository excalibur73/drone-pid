/* Portfolio photo, une galerie par journée.
 *
 * Deux dépôts distincts. Les images d'un côté, chacune sous une clé qui ne
 * sert qu'une fois — elles ne changent jamais, donc le navigateur peut les
 * garder indéfiniment. L'inventaire de l'autre, un fichier par personne :
 * quatre téléphones qui envoient en même temps n'écrasent alors pas leurs
 * listes respectives, la leçon des avis du soir.
 *
 * L'image arrive telle quelle dans le corps de la requête, pas encodée en
 * base64 : cela évite d'en gonfler le poids d'un tiers pour rien. Le
 * navigateur l'a déjà réduite avant l'envoi.
 */
import { getStore } from "@netlify/blobs";

const QUI_VALIDES = ["hilal", "layal", "sana", "papa"];
const TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const POIDS_MAX = 4 * 1024 * 1024;

const images = () => getStore({ name: "photos-athenes-2026", consistency: "strong" });
const listes = () => getStore({ name: "photos-index-2026", consistency: "strong" });

const inventaire = async () => {
  const dep = listes();
  const tout = await Promise.all(QUI_VALIDES.map(async (q) => {
    const sien = (await dep.get(q, { type: "json" })) || [];
    return sien.map((p) => ({ ...p, qui: q }));
  }));
  return tout.flat().sort((a, b) => (a.ts < b.ts ? -1 : 1));
};

export default async (req) => {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");

  if (req.method === "GET") {
    /* Une image précise : on la sert telle quelle, à garder longtemps. */
    if (id) {
      if (!/^[0-9a-z]{6,40}$/.test(id)) return new Response("Identifiant invalide", { status: 400 });
      const octets = await images().get(id, { type: "arrayBuffer" });
      if (!octets) return new Response("Introuvable", { status: 404 });
      const meta = (await inventaire()).find((p) => p.id === id);
      return new Response(octets, {
        headers: {
          "content-type": meta ? meta.type : "image/jpeg",
          "cache-control": "public, max-age=31536000, immutable"
        }
      });
    }
    return Response.json({ photos: await inventaire() }, { headers: { "cache-control": "no-store" } });
  }

  if (req.method === "POST") {
    const qui = url.searchParams.get("qui");
    const jour = String(parseInt(url.searchParams.get("jour"), 10));
    const type = req.headers.get("content-type") || "";
    if (!QUI_VALIDES.includes(qui)) return new Response("Auteur inconnu", { status: 400 });
    if (!(+jour >= 1 && +jour <= 11)) return new Response("Jour hors séjour", { status: 400 });
    if (!TYPES[type]) return new Response("Format non accepté", { status: 415 });

    const octets = await req.arrayBuffer();
    if (!octets.byteLength) return new Response("Image vide", { status: 400 });
    if (octets.byteLength > POIDS_MAX) return new Response("Image trop lourde", { status: 413 });

    /* Identifiant tiré au sort : deux envois simultanés ne se marchent pas
       dessus, et une adresse d'image ne se devine pas. */
    const id = [...crypto.getRandomValues(new Uint8Array(12))]
      .map((b) => b.toString(36).padStart(2, "0")).join("").slice(0, 20);

    await images().set(id, octets, { metadata: { type } });

    const dep = listes();
    const sien = (await dep.get(qui, { type: "json" })) || [];
    sien.push({
      id, jour, type, ts: new Date().toISOString(),
      w: +url.searchParams.get("w") || null,
      h: +url.searchParams.get("h") || null,
      legende: (url.searchParams.get("legende") || "").slice(0, 140)
    });
    await dep.setJSON(qui, sien);
    return Response.json({ ok: true, id, jour });
  }

  if (req.method === "DELETE") {
    const qui = url.searchParams.get("qui");
    if (!QUI_VALIDES.includes(qui)) return new Response("Auteur inconnu", { status: 400 });
    if (!id) return new Response("Identifiant manquant", { status: 400 });
    const dep = listes();
    const sien = (await dep.get(qui, { type: "json" })) || [];
    /* On ne retire que ses propres photos : la liste d'un autre n'est même
       pas ouverte. */
    if (!sien.some((p) => p.id === id)) return new Response("Pas la vôtre", { status: 403 });
    await dep.setJSON(qui, sien.filter((p) => p.id !== id));
    await images().delete(id);
    return Response.json({ ok: true, supprime: id });
  }

  return new Response("Méthode non permise", { status: 405 });
};

export const config = { path: "/api/photos" };
