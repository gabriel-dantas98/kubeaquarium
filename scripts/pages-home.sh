#!/usr/bin/env bash
# Assemble the GitHub Pages artifact: landing page (docs/) at site/ root, demo at site/demo/.
# Run after `npm run build:demo` (which writes site/demo/).
# Used by pages.yml (deploy) and ci.yml (PR check) so breakage shows up before main.
set -euo pipefail
site=site
if [ ! -f "$site/demo/index.html" ]; then
  echo "::error::$site/demo/index.html not found; run 'npm run build:demo' in web/ first"
  exit 1
fi
# the landing page owns the site root; nothing from docs/ may land in demo/
if [ -e docs/demo ]; then
  echo "::error file=docs/demo::docs/demo would collide with the demo at $site/demo/"
  exit 1
fi
cp docs/index.html "$site"/
rm -rf "$site/assets"
cp -R docs/assets "$site"/assets
# copy only the screenshots referenced by the landing page, keeping relative paths
imgs=$(grep -oE 'screenshots/[^"]+' docs/index.html | sort -u || true)
if [ -z "$imgs" ]; then
  echo "::warning file=docs/index.html::no screenshots/ references found; publishing landing page without card images"
fi
while read -r img; do
  [ -n "$img" ] || continue
  if [ ! -f "docs/$img" ]; then
    echo "::error file=docs/index.html::referenced image docs/$img not found"
    exit 1
  fi
  mkdir -p "$site/$(dirname "$img")"
  cp "docs/$img" "$site/$img"
done <<< "$imgs"
find "$site" -type f -not -path "$site/demo/*" | sort
echo "demo: $(find "$site/demo" -type f | wc -l) files under $site/demo/"
