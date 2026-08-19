/* Collecte partagée des avis du soir.
 *
 * Un objet par personne — « avis/layal » — et non un seul objet commun :
 * chaque téléphone n'écrit que son propre fichier, si bien qu'aucune écriture
 * n'en écrase une autre. La première version stockait tout ensemble, et le
 * second téléphone à enregistrer effaçait le premier : le stockage est en
 * cohérence différée, la relecture précédant l'écriture était périmée.
 * Les lectures se font donc aussi en cohérence forte.
 *
 * Les pouces obéissent à la même règle, une clé par votant : « pouce/sana »
 * contient tout ce que Sana a approuvé ou désapprouvé, et personne d'autre
 * n'y écrit. Deux votes simultanés ne peuvent donc pas s'annuler.
 *
 * Le mot de la fin suit la même logique : « bilan/sana », une clé par
 * personne, écrite depuis son seul téléphone.
 */
import { getStore } from "@netlify/blobs";

const QUI_VALIDES = ["hilal", "layal", "sana", "papa"];
const depot = () => getStore({ name: "avis-athenes-2026", consistency: "strong" });
/* « 3:layal » — le pouce d'un votant sur l'avis de Layal au jour 3. */
const cleVote = (jour, auteur) => `${jour}:${auteur}`;

export default async (req) => {
  const store = depot();

  if (req.method === "GET") {
    const tout = {};
    await Promise.all(QUI_VALIDES.map(async (qui) => {
      const sien = (await store.get(qui, { type: "json" })) || {};
      Object.entries(sien).forEach(([jour, v]) => {
        /* Un avis effacé — ni note ni texte — n'a pas à réapparaître. */
        if (!v || (!v.note && !(v.txt || "").trim())) return;
        tout[jour] = tout[jour] || {};
        tout[jour][qui] = v;
      });
    }));
    /* Les pouces voyagent avec les avis : une seule requête, un seul aller.
       La clé « pouces » ne peut pas entrer en conflit avec un numéro de
       journée, qui va de « 1 » à « 11 » — les lecteurs anciens l'ignorent. */
    const pouces = {}, bilans = {};
    await Promise.all(QUI_VALIDES.map(async (votant) => {
      const sien = (await store.get(`pouce/${votant}`, { type: "json" })) || {};
      Object.entries(sien).forEach(([cle, v]) => {
        /* « true » est l'ancienne écriture du pouce levé ; on la relit. */
        const sens = v === true ? 1 : Number(v);
        if (sens !== 1 && sens !== -1) return;
        const p = (pouces[cle] = pouces[cle] || { pour: [], contre: [] });
        (sens === 1 ? p.pour : p.contre).push(votant);
      });
      const mot = await store.get(`bilan/${votant}`, { type: "json" });
      if (mot && (mot.txt || "").trim()) bilans[votant] = mot;
    }));
    Object.values(pouces).forEach((p) => { p.pour.sort(); p.contre.sort(); });
    tout.pouces = pouces;
    tout.bilans = bilans;
    return Response.json(tout, { headers: { "cache-control": "no-store" } });
  }

  if (req.method === "POST") {
    let corps;
    try { corps = await req.json(); }
    catch { return new Response("Corps illisible", { status: 400 }); }

    const { jour, qui, note, txt, auteur, pouce, bilan } = corps || {};
    if (!QUI_VALIDES.includes(qui)) return new Response("Auteur inconnu", { status: 400 });

    /* Le mot de la fin : une seule ligne par personne, sans journée. */
    if (bilan) {
      if (typeof txt === "string" && txt.length > 2000)
        return Response.json({ erreur: "trop-long", limite: 2000, recu: txt.length }, { status: 422 });
      await store.setJSON(`bilan/${qui}`, { txt: typeof txt === "string" ? txt : "", maj: new Date().toISOString() });
      return Response.json({ ok: true, qui, bilan: true });
    }

    const j = String(parseInt(jour, 10));
    if (!(+j >= 1 && +j <= 11)) return new Response("Jour hors séjour", { status: 400 });

    /* Un vote : « qui » est le votant, « auteur » celui qu'on juge.
       pouce vaut 1 pour approuver, -1 pour désapprouver, 0 pour retirer. */
    if (auteur !== undefined) {
      if (!QUI_VALIDES.includes(auteur)) return new Response("Auteur inconnu", { status: 400 });
      if (auteur === qui)
        return Response.json({ erreur: "soi-meme" }, { status: 422 });
      const sens = pouce === true ? 1 : Number(pouce) || 0;
      if (sens !== 0 && sens !== 1 && sens !== -1)
        return new Response("Vote invalide", { status: 400 });
      const sien = (await store.get(`pouce/${qui}`, { type: "json" })) || {};
      const cle = cleVote(j, auteur);
      if (sens) sien[cle] = sens; else delete sien[cle];
      await store.setJSON(`pouce/${qui}`, sien);
      return Response.json({ ok: true, jour: j, qui, auteur, pouce: sens });
    }

    const n = Number(note) || 0;
    if (n < 0 || n > 5) return new Response("Note hors barème", { status: 400 });
    /* On refuse plutôt que de tronquer : rogner cinq cents caractères sans
       le dire est pire que de refuser en l'expliquant. */
    if (typeof txt === "string" && txt.length > 2000)
      return Response.json({ erreur: "trop-long", limite: 2000, recu: txt.length }, { status: 422 });
    const t = typeof txt === "string" ? txt : "";

    /* Lecture-modification-écriture sans risque : ce fichier n'appartient
       qu'à cette personne, et une personne n'écrit que d'un téléphone. */
    const sien = (await store.get(qui, { type: "json" })) || {};
    sien[j] = { note: n, txt: t, maj: new Date().toISOString() };
    await store.setJSON(qui, sien);
    return Response.json({ ok: true, jour: j, qui });
  }

  return new Response("Méthode non permise", { status: 405 });
};

export const config = { path: "/api/avis" };
