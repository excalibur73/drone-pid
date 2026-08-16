#!/usr/bin/env bash
# Assemble le dossier « site » publié par Netlify.
#
# vacances-attique.html est un fragment : il est aussi publié comme Artifact
# Claude, qui fournit lui-même <!doctype>, <head> et le viewport. Pour un
# hébergement classique il faut donc l'envelopper, sans quoi la page tombe en
# quirks mode et s'affiche en largeur bureau sur téléphone.
set -euo pipefail

TITRE="Onze jours en Attique"
DESC="Programme du séjour en Attique, 17 → 27 août 2026 : Athènes puis Saronida, jour par jour."
# Apostrophes à l'intérieur du SVG : l'attribut href est en guillemets doubles.
ICONE="<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='7' fill='%230E6E6E'/><g fill='none' stroke='%23fff' stroke-width='2.4' stroke-linecap='round'><path d='M6 25h20M8 25V13m5 12V13m6 12V13m5 12V13M5 13h22L16 6 5 13Z'/></g></svg>"

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
<meta name="apple-mobile-web-app-title" content="Attique">
<meta name="apple-mobile-web-app-capable" content="yes">
<title>${TITRE}</title>
<link rel="icon" href="data:image/svg+xml,${ICONE}">
<link rel="apple-touch-icon" href="data:image/svg+xml,${ICONE}">
</head>
<body>
HEAD
  cat vacances-attique.html
  printf '</body>\n</html>\n'
} > site/index.html

# Le cours de régulation PID reste en ligne, à sa propre adresse.
cp index.html site/pid-drone.html

echo "site/ assemblé :"
ls -l site/
