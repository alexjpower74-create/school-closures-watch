# School Closures Watch

Is my kid's school open, delayed or closed, and is the bus running? Pick your schools once and see each one's status
from the official NLSchools list, in the source's own words, with "No notice on the NLSchools list as of 6:42 AM" when
there isn't one.

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

_Filled in from the final pinned QA run._

## What deploying needs

Nothing has been deployed. Full checklist: `docs/DEPLOY.md`.
- **Decide first:** NLSchools' terms only allow non-commercial, unmodified reuse without written permission; the
  school spreadsheet page says "for your own personal use". Both need Alexander's call (DECISIONS.md §1).
- D1 `school-closures-watch` (`wrangler d1 create`, then the id in `worker/wrangler.toml`, then
  `wrangler d1 migrations apply school-closures-watch --remote`).
- Secret `ADMIN_TOKEN`. Vars `SOURCE_ORIGIN_MAP=""`, `ALLOW_FAKE_NOW="0"`.
- Cron `*/5 * * * *` (already in `wrangler.toml`; `core/schedule.js` decides what's due).
- Worker `school-closures-watch` + the static `app/` (Pages or Workers static assets) with `<meta name="api-base">`
  pointing at the Worker. A domain such as `schools.apcosoftwaretools.ca`.

## Where to pick this up

- `PLAN.md` (the build contract), `docs/API.md` (data + HTTP contract), `DECISIONS.md` (source evidence),
  `docs/build-report.md` (final numbers, negative controls, known gaps), slice reports `docs/build-report-sc1.md`,
  `docs/build-report-sc2.md`.
- Built overnight 2026-09-14 by a lead + two slices (sc1 core/Worker, sc2 app). Private repo
  `alexjpower74-create/school-closures-watch`.
