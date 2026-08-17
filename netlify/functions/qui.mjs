/* Codes personnels du mot du soir.
 *
 * La date de naissance ne pouvait pas servir de mot de passe : toute la
 * famille la connaît, et il suffisait d'entrer sous le nom d'un autre pour
 * voir quel avis portait la mention « vous » — l'anonymat s'effondrait.
 *
 * Deux clés distinctes, donc, chacune à sa place :
 *   — la date de naissance dit de quel membre de la famille on se réclame,
 *     et écarte un inconnu qui aurait trouvé l'adresse du site ;
 *   — le code personnel, choisi une fois par son propriétaire, est le seul
 *     à protéger de son frère ou de sa sœur.
 *
 * Le serveur ne reçoit jamais le code, seulement son empreinte salée, et ne
 * la rend jamais : il répond « c'est untel » ou rien. Une place prise ne se
 * reprend pas — un code oublié se remet à zéro à la main.
 *
 * Un fichier par personne, comme pour les avis : quatre inscriptions
 * simultanées ne s'écrasent pas l'une l'autre.
 */
import { getStore } from "@netlify/blobs";

const QUI_VALIDES = ["hilal", "layal", "sana", "papa"];
const depot = () => getStore({ name: "codes-athenes-2026", consistency: "strong" });
const empreinteValide = (h) => typeof h === "string" && /^[0-9a-f]{64}$/.test(h);

const tous = async (store) =>
  Object.fromEntries(await Promise.all(QUI_VALIDES.map(async (q) =>
    [q, await store.get(q, { type: "json" })])));

export default async (req) => {
  const store = depot();

  /* Qui a déjà son code : de quoi dire à l'écran ce qu'il reste à faire.
     Aucune empreinte ne sort d'ici. */
  if (req.method === "GET") {
    const etat = await tous(store);
    return Response.json(
      { inscrits: QUI_VALIDES.filter((q) => etat[q] && etat[q].h) },
      { headers: { "cache-control": "no-store" } }
    );
  }

  if (req.method === "POST") {
    let corps;
    try { corps = await req.json(); }
    catch { return new Response("Corps illisible", { status: 400 }); }

    const { action, qui, h } = corps || {};
    if (!empreinteValide(h)) return new Response("Empreinte invalide", { status: 400 });

    if (action === "inscrire") {
      if (!QUI_VALIDES.includes(qui)) return new Response("Prénom inconnu", { status: 400 });
      const etat = await tous(store);
      if (etat[qui] && etat[qui].h)
        return Response.json({ erreur: "pris" }, { status: 409 });
      /* Deux personnes derrière le même code rendraient la connexion
         ambiguë : le second doit en choisir un autre. */
      if (QUI_VALIDES.some((q) => etat[q] && etat[q].h === h))
        return Response.json({ erreur: "doublon" }, { status: 409 });
      await store.setJSON(qui, { h, le: new Date().toISOString() });
      return Response.json({ ok: true, qui });
    }

    if (action === "entrer") {
      const etat = await tous(store);
      const trouve = QUI_VALIDES.find((q) => etat[q] && etat[q].h === h);
      return trouve
        ? Response.json({ qui: trouve })
        : Response.json({ erreur: "inconnu" }, { status: 404 });
    }

    return new Response("Action inconnue", { status: 400 });
  }

  return new Response("Méthode non permise", { status: 405 });
};

export const config = { path: "/api/qui" };
