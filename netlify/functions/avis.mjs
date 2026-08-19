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
 * contient tout ce que Sana a approuvé, et personne d'autre n'y écrit. Deux
 * approbations simultanées ne peuvent donc pas s'annuler.
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
    const pouces = {};
    await Promise.all(QUI_VALIDES.map(async (votant) => {
      const sien = (await store.get(`pouce/${votant}`, { type: "json" })) || {};
      Object.entries(sien).forEach(([cle, oui]) => {
        if (!oui) return;
        (pouces[cle] = pouces[cle] || []).push(votant);
      });
    }));
    Object.values(pouces).forEach((v) => v.sort());
    tout.pouces = pouces;
    return Response.json(tout, { headers: { "cache-control": "no-store" } });
  }

  if (req.method === "POST") {
    let corps;
    try { corps = await req.json(); }
    catch { return new Response("Corps illisible", { status: 400 }); }

    const { jour, qui, note, txt, auteur, pouce } = corps || {};
    const j = String(parseInt(jour, 10));
    if (!(+j >= 1 && +j <= 11)) return new Response("Jour hors séjour", { status: 400 });
    if (!QUI_VALIDES.includes(qui)) return new Response("Auteur inconnu", { status: 400 });

    /* Un pouce : « qui » est le votant, « auteur » celui qu'on approuve. */
    if (auteur !== undefined) {
      if (!QUI_VALIDES.includes(auteur)) return new Response("Auteur inconnu", { status: 400 });
      if (auteur === qui)
        return Response.json({ erreur: "soi-meme" }, { status: 422 });
      const sien = (await store.get(`pouce/${qui}`, { type: "json" })) || {};
      const cle = cleVote(j, auteur);
      if (pouce) sien[cle] = true; else delete sien[cle];
      await store.setJSON(`pouce/${qui}`, sien);
      return Response.json({ ok: true, jour: j, qui, auteur, pouce: !!pouce });
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
