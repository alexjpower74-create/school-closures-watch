#!/usr/bin/env bash
# Lead QA gate. Run INSIDE a QA worktree pinned by `rig qa --ref <sha>`, never in the shared tree.
#   tools/qa-run.sh            core + Worker + app (chromium + webkit, 390 + 1280) + integration
#   tools/qa-run.sh core       one stage: core | worker | app | integration
# QA ports (docs/API.md §1): app 8209, worker 8208, core fixtures 8207, worker fixtures 8206.
# Each stage's exit code is captured explicitly (no pipe can swallow a failure) and printed as STAGE=<name> EXIT=<n>.
set -u
cd "$(dirname "$0")/.."
MAIN_REPO="$(git rev-parse --path-format=absolute --git-common-dir)/.."
[ -e node_modules ] || ln -s "$MAIN_REPO/node_modules" node_modules
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
  tail -30 "$LOG/$name.log"
  echo "STAGE=$name EXIT=$rc"
  [ $rc -ne 0 ] && overall=1
  return 0
}

integration() {
  # A real local Worker on 8208 (fresh D1, ALLOW_FAKE_NOW=1 so seed.mjs --reset works), seeded by sc1's seed script
  # with each scenario in turn, and sc2's integration spec (chromium-390 + webkit-1280) comparing the app to the API.
  local persist rc=0 wpid scenario
  persist=$(mktemp -d)
  (cd worker && wrangler d1 migrations apply school-closures-watch --local --persist-to "$persist") || return 1
  (cd worker && exec setsid wrangler dev --local --ip 127.0.0.1 --port "$SC_WORKER_PORT" --persist-to "$persist" \
      --var ADMIN_TOKEN:qa-token --var ALLOW_FAKE_NOW:1) > "$LOG/integration-worker.log" 2>&1 &
  wpid=$!
  for _ in $(seq 1 90); do curl -sf "http://127.0.0.1:$SC_WORKER_PORT/api/health" >/dev/null && break; sleep 1; done
  if ! curl -sf "http://127.0.0.1:$SC_WORKER_PORT/api/health" >/dev/null; then echo "Worker did not start"; rc=1; fi
  if [ $rc -eq 0 ]; then
    for scenario in today storm stale; do
      echo "--- scenario $scenario"
      node worker/tests/seed.mjs --url "http://127.0.0.1:$SC_WORKER_PORT" --token qa-token --scenario "$scenario" --reset || { rc=1; break; }
      SC_WORKER_URL="http://127.0.0.1:$SC_WORKER_PORT" npx playwright test -c app/playwright.config.mjs integration --reporter=line
      local prc=$?
      echo "scenario $scenario playwright EXIT=$prc"
      [ $prc -ne 0 ] && rc=1
    done
  fi
  kill -TERM -- "-$wpid" 2>/dev/null || kill "$wpid" 2>/dev/null
  wait "$wpid" 2>/dev/null
  rm -rf "$persist"
  return $rc
}

want=${1:-all}
if [ "$want" = all ] || [ "$want" = core ]; then stage core npm run test:core; fi
if [ "$want" = all ] || [ "$want" = worker ]; then stage worker npm run test:worker; fi
if [ "$want" = all ] || [ "$want" = app ]; then stage app npm run test:app; fi
if [ "$want" = all ] || [ "$want" = integration ]; then stage integration integration; fi
echo "QA OVERALL EXIT=$overall at $(git rev-parse --short HEAD)"
exit $overall
