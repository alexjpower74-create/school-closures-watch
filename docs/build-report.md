# School Closures Watch — build report (lead)

Built overnight 2026-09-14 by the lead (sc-lead) and two slices: **sc1** core rules, sources, scanner, Worker + D1;
**sc2** the app, mock scenarios, Playwright. Contract `docs/API.md`, source evidence `DECISIONS.md`, slice reports
`docs/build-report-sc1.md` and `docs/build-report-sc2.md`.

## Final QA — pinned at a1a43f7 (DONE)
`rig qa --ref a1a43f7 --run "bash tools/qa-run.sh"` in `.worktrees/qa`, QA ports 8206–8209 (checked free first),
each stage's exit code captured explicitly. **OVERALL EXIT=0.**

| Stage | Passed | Failed | Skipped |
|---|---|---|---|
| Core (`node --test`, fixture server on 8207) | 90 | 0 | 0 |
| Worker phase 1 (real clock, `wrangler dev --local` on 8208) | 1 | 0 | 0 |
| Worker phase 2 (fake clock + `--test-scheduled`) | 22 | 0 | 0 |
| App (Playwright chromium-390, chromium-1280, webkit-390, webkit-1280; mock; real input; hit-tested targets) | 104 | 0 | 4 (the integration spec, run next) |
| Integration `today` (real Worker seeded by `seed.mjs`; app vs `/api/status`, `/api/today`, `/api/notices/:id`) | 2 | 0 | 2 (other projects, by design) |
| Integration `storm` | 2 | 0 | 2 |
| Integration `stale` | 2 | 0 | 2 |

## Negative controls — 25 red, all restored
- **sc1 (19):** round 1 core A exact-name-only, C staleness off, D region expansion off, E busy window +1 h, F open
  rule removed, F2 adapter always sets the open rule; pipeline H verification skipped, G 1.1 s spacing = 0; Worker A,
  B ingest verification skipped, C, D, F. Round 2 core A, OL old-list guard, R3a region check order, AMB two regions;
  Worker A, OL. Failing lines in `docs/build-report-sc1.md` §6 and Round 2.
- **sc2 (5, rerun on the round-2 tree):** C1 may-apply rendered as applied (the brief's exact-match-only bug), C2 stale
  banner removed, C3 sort broken, C4 quote guard removed, C5 tap target 30 px. Failing lines in
  `docs/build-report-sc2.md`.
- **Lead (1):** L2 `app/api.js` never sends `include_sample=1` → integration red in all three scenarios on both
  projects (`expect(received).toEqual(expected)`, card order Expected −2 / Received +2), at d8ec2ee and again at the
  final a1a43f7; restored.
- **Lead L1, aimed wrong (recorded, not counted):** breaking the `closed` label in `app/labels.js` left integration
  green, because on the real-API path the card renders the API's own `label` (`render.js`), so `app/labels.js` only
  feeds the mock. The mock specs cover that table.

## Real scan (clean start)
`npm run demo` from main with no local D1 state, 2026-09-14 15:20 NDT: migrations, Worker 8202, app 8201, one forced
live scan (≥ 1.1 s per host), then `--watch` (skipped everything as not due). `/` and `/today.html` 200.
- `nlschools-status` ok · list "Monday, September 14, 2026" · open rule found · **2 notices, both exact**: Glovertown
  Academy CLOSED ALL DAY ("School closed all day NOTE: Water Shut Off"), Eastside Elementary OTHER STATUS (bus-run note)
  · 59,928 + 3,089 bytes · 0 quotes dropped.
- `nlschools-notices` ok · 0 (65 bytes). `csfp-news` ok · 0 closure posts (75,650 bytes).
- **The demo was left running** (Worker 8202 + app 8201, scanning on the schedule) so the page shows live results in
  the morning. `data/sources.json` from this scan is committed.

## Screenshots (looked at)
`docs/shots/`, real data from the running demo: `my-schools-real-390` (+ `-webkit`) and `-1280` (Glovertown Closed,
Eastside Other notice, Anchor Academy and École Boréale Unknown with reasons, Gander Elementary "Open, no notice… as of
3:20 PM"), `today-real-390` / `-1280`, `notice-real-390`, `sources-real-1280`, `pick-real-390`. Mock scenarios
(storm, quiet, stale) are in `app/tests/shots/`. Chromium and WebKit phone shots match.

## Cross-slice defects found (every one crossed a slice boundary)
- **sc2 → sc1 (cross-review):** old lists could still set today's status; empty community gave `""` in a reason;
  unmatched count shown on CSFP schools; one unfixed stale wording. All fixed with tests in sc1 round 2.
- **Lead → sc1 (code read of f08b765):** the same old-list gap; region phrase checked after similar names (no real
  collision today: 22 region wordings against 249 schools, but fixed by order, with a test on a SAMPLE "Central High").
- **sc1 → contract:** CSFP `source_text` as title + description could never verify; an empty notes cell would drop a
  real closure. Both fixed in the contract.
- **sc1 self-found (control G):** both spacing tests compared gaps to the imported constant, so 0 still passed.
- **sc2 self-found:** its controls script's `git checkout` restore reverted uncommitted work; caught, redone, and the
  script now refuses a dirty tree.
- **Lead self-found:** comparing two branch tips (two-dot diff) listed sc1's files as "outside sc2's paths"; verified the
  merge itself touched only `app/**` (24 files, no deletions) before moving on.

## Merges
de28cd9 sc1 steps 1–7 (b76085a) · 6c221e8 sc2 round 1 (f3bf596) · 2ab80b5 sc2 round 2 (bff3486) · a1a43f7 sc1 round 2
(7cb9f09). Each merge was read first and checked to touch only the slice's paths.

## Known gaps
- **No real storm day on the list tonight.** Whole-region closures, ambiguous names and CSFP closure posts are proven
  on SAMPLE fixtures only (no real capture exists: 3 archived fragments, none region-wide). The format of a non-empty
  NLSchools important-notices box is unknown; the parser is deliberately simple and says so.
- **No posted time** exists in the source; "first seen" is our scan time. A notice first seen at 7:05 may have been
  posted at 6:40.
- **CSFP** has no online closure status: its schools are always Unknown unless a news post mentions a closure.
  Private, Indigenous and other schools are always Unknown.
- **Buses:** only what the status list says; BusPlanner delays need a login.
- **Scan cadence** is every 5 minutes at best; the source itself refreshes every 5 minutes.
- **Notice page:** the two "See the saved copy" links (status page and status table) have the same label.
- Not deployed; the 5-minute cron has only run under `--test-scheduled` and the local `--watch` loop.

## NEEDS ALEXANDER
1. **NLSchools written permission** before any public or paid version (terms: reuse "solely for non-commercial,
   personal or educational purposes provided that it is not modified"; DECISIONS §1.1).
2. The school spreadsheet page says "This is a file for your own personal use." Confirm the public-facts use
   (DECISIONS §1.5).
3. Whether to ask the CSFP if they publish closures anywhere official.
4. Deploy calls (`docs/DEPLOY.md`).
