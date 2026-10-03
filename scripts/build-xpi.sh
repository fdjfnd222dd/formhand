#!/usr/bin/env bash
# Build the add-on package from an explicit ALLOW-LIST of runtime files.
#
# Why an allow-list: web-ext's default build packs everything not in ignoreFiles, so every new doc, store asset or
# internal note would silently end up inside the XPI that is uploaded to addons.mozilla.org. Here only the files
# the extension actually loads can get in, and the script prints the contents so you can read them before uploading.
#
# Usage: scripts/build-xpi.sh [output-dir]      (default: web-ext-artifacts)
# Needs: web-ext (npm i -g web-ext, no root), bash and python3 (only to print the zip listing).
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
out="${1:-$root/web-ext-artifacts}"
stage="$(mktemp -d)"
trap 'rm -rf "$stage"' EXIT

# Everything manifest.json, background.js, popup/ and options/ load. Keep in sync with background.js FILES.
runtime=(manifest.json background.js core adapters popup options icons/icon-16.png icons/icon-32.png
         icons/icon-48.png icons/icon-96.png icons/icon-128.png)

for item in "${runtime[@]}"; do
  [ -e "$root/$item" ] || { echo "missing runtime file: $item " >&2; exit 1; }
  mkdir -p "$stage/$(dirname "$item")"
  cp -r "$root/$item" "$stage/$item"
done
# A license text inside the package is good practice and tiny.
cp "$root/LICENSE" "$stage/LICENSE"

mkdir -p "$out"
( cd "$stage" && web-ext lint --warnings-as-errors >/dev/null && echo "lint: ok" )
( cd "$stage" && web-ext build --overwrite-dest --artifacts-dir "$out" )

zip_file="$(ls -t "$out"/*.zip | head -1)"
echo "---- package contents (read this before uploading) ----"
python3 -c 'import sys,zipfile; [print(f"{i.file_size:>8}  {i.filename}") for i in zipfile.ZipFile(sys.argv[1]).infolist() if not i.is_dir()]' "$zip_file"
echo "---- $zip_file ----"
