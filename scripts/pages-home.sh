#!/usr/bin/env bash
# Copy the static landing page (docs/) into site/home/ for GitHub Pages.
# Used by pages.yml (deploy) and ci.yml (PR check) so breakage shows up before main.
set -euo pipefail
home=site/home
mkdir -p "$home"
cp docs/index.html "$home"/
cp -R docs/assets "$home"/assets
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
  mkdir -p "$home/$(dirname "$img")"
  cp "docs/$img" "$home/$img"
done <<< "$imgs"
find "$home" -type f | sort
