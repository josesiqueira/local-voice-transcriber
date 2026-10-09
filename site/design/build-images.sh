#!/usr/bin/env bash
# Renders the site's social preview image and the extension icons from the SVG sources.
# Usage: ./build-images.sh            (from site/design/)
# The text-to-outline step needs the "IBM Plex Sans OG" font to be visible to fontconfig;
# without it, the existing og.svg (text already converted to outlines) is rendered as is.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
ASSETS=../src/assets
ICONS=../../extension/icons

if fc-list : family | grep "IBM Plex Sans OG" > /dev/null; then
  inkscape og-source.svg --export-text-to-path --export-plain-svg --export-filename=og.svg
fi
inkscape og.svg -w 1200 -h 630 --export-filename=../public/og.png

cp "$ASSETS/logo-16.svg" ../public/favicon.svg
inkscape touch-icon.svg -w 180 -h 180 --export-filename=../public/apple-touch-icon.png

mkdir -p "$ICONS"
inkscape "$ASSETS/logo-16.svg" -w 16 -h 16 --export-filename="$ICONS/icon16.png"
inkscape "$ASSETS/logo-16.svg" -w 32 -h 32 --export-filename="$ICONS/icon32.png"
inkscape "$ASSETS/logo.svg" -w 48 -h 48 --export-filename="$ICONS/icon48.png"
inkscape "$ASSETS/logo.svg" -w 128 -h 128 --export-filename="$ICONS/icon128.png"
echo "Rendered og.png, favicon.svg, apple-touch-icon.png and the extension icons."
