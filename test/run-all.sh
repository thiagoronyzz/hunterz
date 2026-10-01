#!/bin/sh
# Runs every headless test in this folder (test/*.test.js). Requires only Node — no
# browser, no GPU: the real game modules run inside a stubbed DOM + THREE sandbox.
cd "$(dirname "$0")/.." || exit 1
status=0
for t in test/*.test.js; do
  echo "---------------------------------------------------------------- $t"
  node "$t" || status=1
done
if [ "$status" -eq 0 ]; then echo "======================= all suites passed ======================="
else echo "===================== SOME SUITES FAILED ========================="; fi
exit $status
