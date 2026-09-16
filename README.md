# School Closures Watch

Is my kid's school open, delayed or closed, and is the bus running? Pick your schools once and see each one's status
from the official NLSchools list, in the source's own words, with "No notice on the NLSchools list as of 6:42 AM" when
there isn't one.

**Live:** [https://school-closures-watch-app.alexjpower74.workers.dev](https://school-closures-watch-app.alexjpower74.workers.dev) (app) · API [https://school-closures-watch.alexjpower74.workers.dev/api/health](https://school-closures-watch.alexjpower74.workers.dev/api/health). Deployed 2026-09-15 on Cloudflare Workers + D1; the
Worker scans the real NLSchools sources on its own schedule (every 5 minutes on weekday mornings, hourly otherwise).
Real data on the live page; the SAMPLE scenarios are at `?mock=1&scenario=storm` (also `today`, `quiet`, `stale`, `csfp`).

## Run it locally

```bash
cd ~/Projects/"School Closures Watch"
npm install                 # only @playwright/test; wrangler 4.131 is already on PATH
npm run demo                # migrates local D1, starts the Worker (8202) and the app (8201), scans the real sources once, then on the schedule
```

Open **http://127.0.0.1:8201/** → "Pick your schools" → type a school or community → Done.
Ctrl-C stops everything. The demo refuses to start if 8201 or 8202 is already in use.

Other commands:

| What | Command |
|---|---|
| One live scan into a running Worker | `npm run scan -- --force` |
| Look without a Worker (SAMPLE mock) | `node app/serve.mjs --port 8201`, open `http://127.0.0.1:8201/?mock=1&scenario=storm` (also `today`, `quiet`, `stale`, `csfp`) |
| Seed a local Worker with a scenario | `node worker/tests/seed.mjs --scenario storm --reset` (Worker with `ALLOW_FAKE_NOW=1`), open the app with `?sample=1` |
| Rebuild the school list | `npm run schools` (from the saved spreadsheet in `data/samples/govnl/`) |
| Tests | `npm run test:core`, `npm run test:worker`, `npm run test:app` |
| Lead QA gate (in a pinned worktree) | `rig qa --ref <sha> --run "bash tools/qa-run.sh"` |

## What's real and what's SAMPLE

- **Real:** the NLSchools School Status Report (`nlschools.ca/schools/statusreport.jsp` and the table it loads), the
  NLSchools important-notices box, the CSFP news feed, and the 269 schools in `data/schools.json` (Department of
  Education spreadsheet + directory pages). Every quote on screen is checked as an exact substring of the saved source.
- **Real saved files** in `data/samples/`: today's list (Glovertown Academy closed all day, Eastside Elementary other
  notice) and three archived days (January 10, 2024 storm, January 17, 2024 PD day, July 31, 2025 early closing).
- **SAMPLE:** whole-region closures, ambiguous names and the CSFP closure post exist only in tests and the `?mock=1`
  scenarios, labelled SAMPLE, because no real capture of them exists. The screen says "Test data" whenever samples
  are shown.
- **Not covered:** CSFP schools (no online closures source: Unknown, the school tells families directly),
  private / Indigenous / other schools (Unknown, call the school), bus delays outside the status list (BusPlanner
  needs a login: link only).
- **No posted times:** NLSchools doesn't show when a notice was posted. The app shows when we first saw it and says so.

## Tests

Final QA from a worktree pinned to **a1a43f7** (`rig qa --ref a1a43f7 --run "bash tools/qa-run.sh"`, QA ports
8206–8209, OVERALL EXIT=0):

| Stage | What | Result |
|---|---|---|
| Core | `node --test`: text, time, schedule, labels, matching, verification, status, adapters on the real saved files, pipeline against a fixture server | **90 passed, 0 failed** |
| Worker | `node --test` against `wrangler dev --local` (real clock phase + fake clock and `--test-scheduled` phase) | **1/1 + 22/22** |
| App | Playwright, chromium + webkit, phone 390 + desktop 1280, real taps/clicks/typing, tap targets hit-tested, mock scenarios | **104 passed, 0 failed, 4 skipped** (the integration spec, run in the next stage) |
| Integration | A real local Worker seeded with `today`, `storm` and `stale`; the app compared with `/api/status`, `/api/today` and `/api/notices/:id` on chromium-390 + webkit-1280 | **each scenario 2 passed** (2 skipped: other projects, by design) |

**Negative controls: 25 went red and were restored.** sc1 19 (core, pipeline and Worker: exact-name-only matching,
verification skipped, staleness off, region expansion off, busy window shifted, open rule removed, 1.1 s spacing,
old-list guard, region check order, two regions), sc2 5 (may-apply shown as applied, stale banner removed, sort broken,
quote guard removed, 30 px tap target), lead 1 (the app stops asking for samples → integration red in all three
scenarios). One lead control was aimed at code the real-API path doesn't use and is recorded as such in
`docs/build-report.md`.

**Real scan** (clean start, `npm run demo`, 2026-09-14 15:20 NDT): NLSchools list for Monday, September 14, 2026 with
2 notices, both matched exactly: Glovertown Academy "CLOSED ALL DAY" ("School closed all day NOTE: Water Shut Off")
and Eastside Elementary "OTHER STATUS" (a bus-run note). NLSchools important notices: none. CSFP news: no closure post.
0 quotes dropped. On a normal night the list is often empty, and the app says so.

## Deploying

Deployed 2026-09-15: Worker `school-closures-watch` (D1 + cron) and static-assets Worker `school-closures-watch-app`
(`scripts/deploy-app.sh` builds `deploy/dist` from `app/` with the production `<meta name="api-base">`). Full
checklist, ids and the open questions (NLSchools terms, school spreadsheet terms, a custom domain): `docs/DEPLOY.md`.

## Where to pick this up

- `PLAN.md` (the build contract), `docs/API.md` (data + HTTP contract), `DECISIONS.md` (source evidence),
  `docs/build-report.md` (final numbers, negative controls, known gaps), slice reports `docs/build-report-sc1.md`,
  `docs/build-report-sc2.md`.
- Built overnight 2026-09-14 by a lead + two slices (sc1 core/Worker, sc2 app). Public repo
  `alexjpower74-create/school-closures-watch`; `check-no-personal-data .` runs before every push.
