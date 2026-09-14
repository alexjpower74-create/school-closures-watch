#!/usr/bin/env bash
# Lead QA gate. Run INSIDE a QA worktree pinned by `rig qa --ref <sha>`, never in the shared tree.
#   tools/qa-run.sh            core + Worker + app (chromium + webkit, 390 + 1280) + integration
#   tools/qa-run.sh core       one stage: core | worker | app | integration
# QA ports (docs/API.md §1): app 8209, worker 8208, core fixtures 8207, worker fixtures 8206.
# Each stage's exit code is captured explicitly (no pipe can swallow a failure) and printed as STAGE=<name> EXIT=<n>.
set -u
cd "$(dirname "$0")/.."
export SC_APP_PORT=8209 SC_WORKER_PORT=8208 SC_FIXTURE_PORT=8207 SC_WORKER_FIXTURE_PORT=8206
LOG=test-results/qa
mkdir -p "$LOG"
echo "QA at $(git rev-parse --short HEAD) in $(pwd)"

busy=$(ss -ltn 2>/dev/null | grep -E ':(8206|8207|8208|8209)\b' || true)
if [ -n "$busy" ]; then echo "QA ports already in use, refusing to measure someone else's server:"; echo "$busy"; exit 2; fi

overall=0
stage() {
  local name=$1; shift
  echo "=== $name: $*"
  "$@" > "$LOG/$name.log" 2>&1
  local rc=$?
  tail -25 "$LOG/$name.log"
  echo "STAGE=$name EXIT=$rc"
  [ $rc -ne 0 ] && overall=1
  return 0
}

want=${1:-all}
[ "$want" = all ] || [ "$want" = core ] && stage core npm run test:core
[ "$want" = all ] || [ "$want" = worker ] && stage worker npm run test:worker
[ "$want" = all ] || [ "$want" = app ] && stage app npm run test:app
if [ "$want" = all ] || [ "$want" = integration ]; then
  # Real local Worker seeded by sc1's seed script, then the app's integration spec against it.
  stage integration bash -c '
    set -u
    PERSIST=$(mktemp -d)
    (cd worker && npx --no-install wrangler d1 migrations apply school-closures-watch --local --persist-to "$PERSIST" >/dev/null 2>&1 || wrangler d1 migrations apply school-closures-watch --local --persist-to "$PERSIST" >/dev/null)
    (cd worker && exec wrangler dev --local --port $SC_WORKER_PORT --persist-to "$PERSIST" --var ADMIN_TOKEN:qa-token --var ALLOW_FAKE_NOW:1 >/tmp/scw-qa-worker.$$.log 2>&1) &
    WPID=$!
    for i in $(seq 1 60); do curl -sf http://127.0.0.1:$SC_WORKER_PORT/api/health >/dev/null && break; sleep 1; done
    node worker/tests/seed.mjs --url http://127.0.0.1:$SC_WORKER_PORT --token qa-token --scenario storm
    rc=$?
    if [ $rc -eq 0 ]; then SC_WORKER_URL=http://127.0.0.1:$SC_WORKER_PORT npx playwright test -c app/playwright.config.mjs app/tests/integration.spec.mjs; rc=$?; fi
    pkill -P $WPID 2>/dev/null; kill $WPID 2>/dev/null; wait $WPID 2>/dev/null
    rm -rf "$PERSIST"
    exit $rc'
fi
echo "QA OVERALL EXIT=$overall at $(git rev-parse --short HEAD)"
exit $overall
