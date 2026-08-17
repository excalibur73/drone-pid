/* Collecte partagée des avis du soir.
 *
 * Un objet par personne — « avis/layal » — et non un seul objet commun :
 * chaque téléphone n'écrit que son propre fichier, si bien qu'aucune écriture
 * n'en écrase une autre. La première version stockait tout ensemble, et le
 * second téléphone à enregistrer effaçait le premier : le stockage est en
 * cohérence différée, la relecture précédant l'écriture était périmée.
 * Les lectures se font donc aussi en cohérence forte.
 */
import { getStore } from "@netlify/blobs";

const QUI_VALIDES = ["hilal", "layal", "sana", "papa"];
const depot = () => getStore({ name: "avis-athenes-2026", consistency: "strong" });

export default async (req) => {
  const store = depot();

  if (req.method === "GET") {
    const tout = {};
    await Promise.all(QUI_VALIDES.map(async (qui) => {
      const sien = (await store.get(qui, { type: "json" })) || {};
      Object.entries(sien).forEach(([jour, v]) => {
        tout[jour] = tout[jour] || {};
        tout[jour][qui] = v;
      });
    }));
    return Response.json(tout, { headers: { "cache-control": "no-store" } });
  }

  if (req.method === "POST") {
    let corps;
    try { corps = await req.json(); }
    catch { return new Response("Corps illisible", { status: 400 }); }

    const { jour, qui, note, txt } = corps || {};
    const j = String(parseInt(jour, 10));
    if (!(+j >= 1 && +j <= 11)) return new Response("Jour hors séjour", { status: 400 });
    if (!QUI_VALIDES.includes(qui)) return new Response("Auteur inconnu", { status: 400 });

    const n = Number(note) || 0;
    if (n < 0 || n > 5) return new Response("Note hors barème", { status: 400 });
    const t = typeof txt === "string" ? txt.slice(0, 2000) : "";

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
