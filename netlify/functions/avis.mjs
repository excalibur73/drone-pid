/* Collecte partagée des avis du soir.
   Un seul objet stocké : { "7": { "layal": {note, txt, maj} }, … }
   Chaque personne n'écrit que sous sa propre clé, donc deux téléphones qui
   enregistrent en même temps ne s'écrasent pas — sauf collision à la seconde,
   auquel cas la dernière écriture gagne. Assumé pour quatre personnes. */
import { getStore } from "@netlify/blobs";

const CLE = "tout";
const QUI_VALIDES = ["hilal", "layal", "sana", "papa"];

export default async (req) => {
  const store = getStore("avis-athenes-2026");

  if (req.method === "GET") {
    const data = (await store.get(CLE, { type: "json" })) || {};
    return Response.json(data, {
      headers: { "cache-control": "no-store" }
    });
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

    const data = (await store.get(CLE, { type: "json" })) || {};
    data[j] = data[j] || {};
    data[j][qui] = { note: n, txt: t, maj: new Date().toISOString() };
    await store.setJSON(CLE, data);
    return Response.json({ ok: true, jour: j, qui });
  }

  return new Response("Méthode non permise", { status: 405 });
};

export const config = { path: "/api/avis" };
