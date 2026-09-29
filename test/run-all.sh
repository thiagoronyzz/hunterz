#!/bin/sh
# Runs every headless test in this folder. Requires only Node (no browser needed).
cd "$(dirname "$0")/.." || exit 1
status=0
for t in test/quality-registry.test.js test/species.test.js test/quality-selection.test.js test/hud-strings.test.js test/textures.test.js; do
  echo "---------------------------------------------------------------- $t"
  node "$t" || status=1
done
exit $status
