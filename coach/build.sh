#!/usr/bin/env bash
# Assemble le dossier « site » publié par Netlify pour l'application Coach.
#
# coach.html est un fragment : il est aussi publié comme Artifact Claude,
# qui fournit lui-même <!doctype>, <head> et le viewport. Pour un
# hébergement classique il faut donc l'envelopper, sans quoi la page tombe
# en quirks mode et s'affiche en largeur bureau sur téléphone.
set -euo pipefail

TITRE="Coach de poche"
DESC="Programme de force et de cardio sur douze semaines, calculé sur votre profil et réajusté chaque semaine d'après vos séances, vos pesées et votre forme du jour."
# Apostrophes à l'intérieur du SVG : l'attribut href est en guillemets doubles.
ICONE="<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='7' fill='%230F8F6B'/><g fill='none' stroke='%23fff' stroke-width='2.6' stroke-linecap='round'><path d='M10 10v12M22 10v12M6 13v6M26 13v6M10 16h12'/></g></svg>"

# Version du cache hors connexion : empreinte du contenu réellement publié.
VERSION="$(sha1sum coach.html | cut -c1-12)"

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
<meta name="apple-mobile-web-app-title" content="Coach">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<title>${TITRE}</title>
<meta name="version" content="${VERSION}">
<link rel="icon" href="data:image/svg+xml,${ICONE}">
<link rel="apple-touch-icon" href="data:image/svg+xml,${ICONE}">
<link rel="manifest" href="/manifest.webmanifest">
</head>
<body>
HEAD
  cat coach.html
  printf '</body>\n</html>\n'
} > site/index.html

printf '%s' "${VERSION}" > site/version.txt

cat > site/manifest.webmanifest <<MANIFEST
{
  "name": "${TITRE}",
  "short_name": "Coach",
  "description": "${DESC}",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "background_color": "#080A0E",
  "theme_color": "#0F8F6B",
  "lang": "fr",
  "orientation": "portrait",
  "icons": [
    { "src": "data:image/svg+xml,${ICONE}", "sizes": "any", "type": "image/svg+xml", "purpose": "any" }
  ]
}
MANIFEST

# Réseau d'abord, cache en secours : les corrections arrivent tout de suite,
# et la salle de sport reste un sous-sol — une séance en cours ne doit jamais
# dépendre du réseau.
cat > site/sw.js <<SW
const CACHE = "coach-${VERSION}";
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
  if (new URL(req.url).pathname === "/version.txt") return;   // toujours au réseau
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
