#!/usr/bin/env bash
# Assemble le dossier « site » publié par Netlify.
#
# vacances-attique.html est un fragment : il est aussi publié comme Artifact
# Claude, qui fournit lui-même <!doctype>, <head> et le viewport. Pour un
# hébergement classique il faut donc l'envelopper, sans quoi la page tombe en
# quirks mode et s'affiche en largeur bureau sur téléphone.
set -euo pipefail

TITRE="Athènes 2026"
DESC="Programme du séjour en Attique, 17 → 27 août 2026 : Athènes puis Saronida, jour par jour."
# Apostrophes à l'intérieur du SVG : l'attribut href est en guillemets doubles.
ICONE="<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='7' fill='%230E6E6E'/><g fill='none' stroke='%23fff' stroke-width='2.4' stroke-linecap='round'><path d='M6 25h20M8 25V13m5 12V13m6 12V13m5 12V13M5 13h22L16 6 5 13Z'/></g></svg>"

# Version du cache hors connexion : empreinte du contenu réellement publié.
VERSION="$(cat vacances-attique.html index.html | sha1sum | cut -c1-12)"
VERSION_COACH="$(sha1sum coach.html | cut -c1-12)"

rm -rf site
mkdir -p site

{
  cat <<HEAD
<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<meta name="description" content="${DESC}">
<meta name="apple-mobile-web-app-title" content="Athènes">
<meta name="apple-mobile-web-app-capable" content="yes">
<title>${TITRE}</title>
<meta name="version" content="${VERSION}">
<link rel="icon" href="data:image/svg+xml,${ICONE}">
<link rel="apple-touch-icon" href="data:image/svg+xml,${ICONE}">
<link rel="manifest" href="/manifest.webmanifest">
</head>
<body>
HEAD
  cat vacances-attique.html
  printf '</body>\n</html>\n'
} > site/index.html

# Le cours de régulation PID reste en ligne, à sa propre adresse.
cp index.html site/pid-drone.html

# ── Coach : application de remise en forme, publiée sous /coach/ ─────────
# Son propre dossier, et donc son propre service worker : sans quoi celui
# du programme de vacances, enregistré à la racine, prendrait la main sur
# les deux applications à la fois.
TITRE_COACH="Coach — remise en forme"
DESC_COACH="Programme de force et de cardio sur douze semaines, calculé sur votre profil et ajusté chaque semaine d'après vos séances et vos mesures."
ICONE_COACH="<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='7' fill='%230F8F6B'/><g fill='none' stroke='%23fff' stroke-width='2.6' stroke-linecap='round'><path d='M10 10v12M22 10v12M6 13v6M26 13v6M10 16h12'/></g></svg>"

mkdir -p site/coach
{
  cat <<HEAD_COACH
<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<meta name="description" content="${DESC_COACH}">
<meta name="apple-mobile-web-app-title" content="Coach">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<title>${TITRE_COACH}</title>
<meta name="version" content="${VERSION_COACH}">
<link rel="icon" href="data:image/svg+xml,${ICONE_COACH}">
<link rel="apple-touch-icon" href="data:image/svg+xml,${ICONE_COACH}">
<link rel="manifest" href="/coach/manifest.webmanifest">
</head>
<body>
HEAD_COACH
  cat coach.html
  printf '</body>\n</html>\n'
} > site/coach/index.html

cat > site/coach/manifest.webmanifest <<MANIFEST_COACH
{
  "name": "${TITRE_COACH}",
  "short_name": "Coach",
  "description": "${DESC_COACH}",
  "start_url": "/coach/",
  "scope": "/coach/",
  "display": "standalone",
  "background_color": "#080A0E",
  "theme_color": "#0F8F6B",
  "lang": "fr",
  "orientation": "portrait",
  "icons": [
    { "src": "data:image/svg+xml,${ICONE_COACH}", "sizes": "any", "type": "image/svg+xml", "purpose": "any" }
  ]
}
MANIFEST_COACH

# Réseau d'abord, cache en secours : la salle de sport est un sous-sol, et
# une séance en cours ne doit jamais dépendre du réseau.
cat > site/coach/sw.js <<SW_COACH
const CACHE = "coach-${VERSION_COACH}";
const ASSETS = ["/coach/", "/coach/manifest.webmanifest"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k.startsWith("coach-") && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || !url.pathname.startsWith("/coach")) return;
  e.respondWith(
    fetch(req)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req).then(hit => hit || caches.match("/coach/")))
  );
});
SW_COACH

printf '%s' "${VERSION}" > site/version.txt

cat > site/manifest.webmanifest <<MANIFEST
{
  "name": "${TITRE}",
  "short_name": "Athènes",
  "description": "${DESC}",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#E9EFEF",
  "theme_color": "#0E6E6E",
  "lang": "fr",
  "icons": [
    { "src": "data:image/svg+xml,${ICONE}", "sizes": "any", "type": "image/svg+xml", "purpose": "any" }
  ]
}
MANIFEST

# Service worker : réseau d'abord (le programme reste à jour), cache en secours
# quand il n'y a pas de réseau — l'itinérance en Grèce, l'avion, le bord de mer.
cat > site/sw.js <<SW
const CACHE = "attique-${VERSION}";
const ASSETS = ["/", "/manifest.webmanifest"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  const chemin = new URL(req.url).pathname;
  if (chemin === "/version.txt") return;              // toujours au réseau
  if (chemin.startsWith("/api/")) return;             // les avis partagés ne se mettent pas en cache
  e.respondWith(
    fetch(req)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req).then(hit => hit || caches.match("/")))
  );
});
SW

echo "site/ assemblé (cache ${VERSION}) :"
ls -l site/
