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
