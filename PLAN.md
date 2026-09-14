# School Closures Watch — build contract

One plan file. It is the contract, at the repo root, and every agent reads the same copy.
Read `AGENTS.md` (rules), `docs/API.md` (the data + HTTP contract between slices) and `DECISIONS.md` (source verdicts
with evidence) first.

## The brief (Onyx for Alexander, 2026-09-14)
On a stormy Newfoundland morning parents need one answer fast: **is my kid's school open, delayed or closed, and is
the bus running?** Pick your schools once; the page shows each school's status from the official source with the
source's own words, and "No notice on the NLSchools list as of 6:42 AM" when there isn't one. Scan every 5 minutes
05:00–09:00 and 11:00–13:00 (early dismissals), hourly otherwise (`npm run scan` + Worker `scheduled()`). A notice
naming a whole region applies to its schools and says so. **An ambiguous match is shown as "This notice may apply to
your school" with the quote, never silently applied.** Stale source → banner. Screens: pick schools, my schools
(worst first, big type), notice detail, today's full list by region, sources + health. 390 + 1280.

**What the research found (lead, DECISIONS.md):**
- NLSchools (English schools) publishes a School Status Report. The real rows are in the fragment
  `https://www.nlschools.ca/schools/generated/schoolstatus.html` (table: school + community, status class + text,
  description + note, family, region); the page `statusreport.jsp` gives the date the list is for and the sentence
  "If your school is not listed below, the status is normal and open as usual." **No posted time exists**: we show
  when we first saw a notice and say NLSchools gives no posted time.
- Real saved rows: today (Glovertown Academy CLOSED ALL DAY; Eastside Elementary OTHER STATUS with a bus-run note) and
  three archived days (2024-01-10 storm: morning closure + two delayed openings; 2024-01-17 PD day; 2025-07-31 closing
  early). All match the provincial school list exactly. Whole-region and ambiguous cases have no real capture: SAMPLE
  fixtures only.
- CSFP has **no online closures source** (principals tell families directly). CSFP schools are never "Open": Unknown,
  plus any recent CSFP news post with a closure word shown as "may apply".
- Buses: BusPlanner is login-only for delays → link only. Bus information comes from the status list itself, verbatim.
- `data/schools.json` (lead-built, 269 schools): 249 NLSchools, 6 CSFP (from the 2025-26 public schools spreadsheet),
  8 private, 3 Indigenous, 3 other (directory pages, names only, Unknown status).

**Design.** API.md §9: the approved portfolio look (dark navy, glass, aurora 0.2, colour on data), status label in
very large type, always words + colour + icon. Plain English for Newfoundland parents. No emoji.

**Stack.** `core/` pure ESM, zero deps (runs in Node and workerd) · `worker/` Cloudflare Worker + D1, local only ·
`app/` static HTML/CSS/JS, no build, served by `node app/serve.mjs` · root `package.json` (lead) scripts `scan`,
`demo`, `test:core`, `test:worker`, `test:app`, `dev:worker`, `dev:app`, `schools`.
Ports: app 8201 (sc2) · worker 8202 (sc1) · core fixture server 8203 · worker fixture server 8204 ·
QA: app 8209, worker 8208, fixtures 8207/8206. **Ignore any port rig prints; these are the ports.**
The root `node_modules` (only `@playwright/test` 1.63.0) is symlinked into each worktree by the lead. `wrangler` 4.131
is on PATH. Node 26. Playwright browsers are installed.

## Rules
- You own the files under your id and nothing else; `rig guard` enforces it. Commit only your own paths
  (`git commit -- <paths>`). Verify → commit → report in `docs/build-report-<id>.md` (committed). Commit at every
  green step: a usage-limit pause can land mid-task.
- If the contract (`docs/API.md`) is wrong or missing something, write it at the top of your report under
  **Contract questions** and carry on with the most sensible reading. The lead reads reports and updates the contract.
- Never grade the shared tree. No visible Chrome. Playwright only; `pwshot` for screenshots.
- A check that cannot fail measured nothing: for each important check, say what would make it red, make it red once,
  restore, and record it in your report (what you broke, the failing output line, restored, green again).
- **No invented notices.** Invented rows only in tests/mock: `sample: true`, invented text starts `SAMPLE `, school
  names and regions are the real ones. Real rows only from the real sources or verbatim replays of `data/samples/`.
  `data/samples/` and `data/schools.json` are lead-owned and read-only for slices: read them in place or copy what you
  need into your own fixtures folder.
- Scraping politeness (in core): ≥ 1.1 s between requests to one host, 20 s timeout, the UA from AGENTS.md, never
  fetch a Link only or Not used source. Live requests only in the one live check sc1 is asked to run; every test uses
  fixture servers.
- **Forbidden:** any deploy, `wrangler secret put`, `wrangler d1 create`, anything `--remote`; sending anything;
  touching other projects' folders (reading `~/Projects/Road Watch` for reference is fine); creating herdr
  workspaces/tabs; helper agents. Keep scratch files inside your worktree. If auto mode denies something, don't work
  around it: note it in your report and carry on.
- AI: none.

## Agents

### sc1 — Core rules, sources, scanner, Worker API + D1
Owns:
- core/**
- scripts/**
- worker/**
- data/sources.json

Report: docs/build-report-sc1.md

Task:
Build `docs/API.md` §0–§7. Work in this order and commit at each green step.

1. **Foundations** with `node --test` tests in `core/tests/`:
   `core/text.js` (normText, decodeEntities, extractText, fnv1a8), `core/verify.js` (§0 rules; returns the cleaned
   notice or `null` with a reason), `core/time.js` (Newfoundland time, tested across both DST switches),
   `core/schedule.js` (§6 with the worked examples as tests), `core/labels.js` (§4.1 table, §4.3 phrase tables, §4.4
   region phrases), `core/match.js` (§4.2), `core/schools.js` + `scripts/gen-schools.mjs` → `core/schools-data.js`
   (test: equals `data/schools.json`), `core/status.js` (§4.5, including every Unknown reason).
   **Commit and write "foundations ready" in your build report** (record shapes + a sample `SchoolStatus`): the lead
   has sc2 cross-review your shapes at that point.
2. **Adapters** (`core/sources/registry.js`, `nlschools-status.js`, `nlschools-notices.js`, `csfp-news.js`), each
   tested against the REAL saved files in `data/samples/` with every expectation in §3 (both real 2026-09-14 rows, the
   three wayback days, empty notices, the CSFP feed → 0), plus SAMPLE fixtures for: a whole-Central-region row and a
   text notice; an ambiguous row ("SAMPLE Glovertown" / "Gander, NL" → may_apply to Glovertown Academy, reason
   `name_similar`); a same-name-different-community row; an unmatched row; a fragment without the table →
   `format_changed`; a page without the date line; a page without the open rule; a class not in §4.1 → `other` +
   `unmapped_classes`; a SAMPLE CSFP post naming École Boréale.
   Also verify `NLS_OPEN_RULE` and `CSFP_RULE` (API.md §2) are exact substrings of their saved files.
3. **Pipeline** `core/pipeline.js` (`runScan({ now, only, force, fetchImpl, originMap, onRaw, health, schools })`:
   due sources only unless `force`, per-host 1.1 s spacing, UA, timeouts, verification, results per source) +
   `scripts/scan.mjs` (flags in API.md §1; POSTs one ingest per source; writes `data/sources.json` = registry + last
   results, committed) + core scan tests against a fixture server on `SC_FIXTURE_PORT` (8203) that serves
   `data/samples/` files at the real paths. Test the 1.1 s spacing with a fake clock or measured timestamps, and that
   link-only sources are never requested.
4. **Worker** `worker/`: `wrangler.toml` name `school-closures-watch`, `main = "src/index.js"`, a current
   `compatibility_date`, D1 binding `DB` (`database_name = "school-closures-watch"`, `database_id =
   "LOCAL-ONLY-set-at-deploy"`, `migrations_dir = "migrations"`), `[triggers] crons = ["*/5 * * * *"]`, `[vars]
   SOURCE_ORIGIN_MAP = ""`, `ALLOW_FAKE_NOW = "0"`; `worker/.dev.vars.example`; `package.json` scripts `dev`
   (`wrangler dev --local --port 8202`), `migrate:local`, `test`. Every endpoint in §7, `scheduled()`, ingest
   re-verification and the notice lifecycle (first/last seen, removed).
5. **Worker tests** `worker/tests/run.mjs` (`npm test`): migrate a fresh local persist dir, start `wrangler dev
   --local --port ${SC_WORKER_PORT:-8202}` (never reuse a server already on the port: fail instead), a fixture server
   on `${SC_WORKER_FIXTURE_PORT:-8204}` with switchable scenarios, then `node --test worker/tests/*.test.mjs`, then
   stop both. Tests (each named in the report): today ingest → Glovertown `closed` exact, Eastside `other`, another
   NLSchools school `open` with `as_of`; École Boréale `unknown` `csfp_no_online_status`; a private school `unknown`;
   SAMPLE whole-Central closure → all 77 Central NLSchools schools `closed` with `how: "region"`, no Western or CSFP
   school affected; SAMPLE ambiguous → Glovertown `may_apply` (NOT closed); stale (fixture 503) → `stale: true` +
   `stale_text`, open schools become `unknown` `stale`, Glovertown stays `closed` with `stale: true`; a second ok scan
   without a row → `removed_at` set and it appears in `/api/today` `earlier`; old list date → `unknown`
   `list_date_old`; open rule missing → `unknown`; tampered quote at ingest → dropped; 401 without token; `now` ignored
   unless `ALLOW_FAKE_NOW=1`; `/api/raw/…` returns the body; unknown notice → 404; SAMPLE rows hidden without
   `include_sample=1`; `/api/admin/scan` (the `scheduled()` code path) against the fixture origin.
   Also `worker/tests/seed.mjs --url <worker> --token <t> --scenario today|storm|quiet|stale` (ingests fixture payloads)
   so the lead and sc2 can run the app against a real Worker.
6. **Negative controls** (each: break, see red, restore, record): matching made exact-name-only → the may_apply tests
   go red (core and Worker); ingest verification skipped → tamper test red; staleness disabled → stale test red; region
   expansion off → region test red; busy window shifted by one hour → schedule test red; open rule check removed →
   open-rule test red.
7. `scripts/demo.mjs` (`npm run demo`, API.md §1). Then **one live check**, politely: `node scripts/scan.mjs --dry
   --force` against the real sources; record in your report what each source returned (result, list date, notice
   count, bytes). Don't loop it.

### sc2 — The app: screens, mock, Playwright
Owns:
- app/**

Report: docs/build-report-sc2.md

Task:
Build `docs/API.md` §8–§9. Commit at each green step.

1. `app/serve.mjs` (zero-dep static server for `app/` only; copy the approach of `~/Projects/Road Watch/app/serve.mjs`),
   `app/app.css`, `app/api.js`, `app/api.mock.js` + `app/mock/` (a subset of real rows copied from
   `data/schools.json`, including all six schools in the real rows, at least 10 Central schools, 3 Western, all 6 CSFP
   schools and 2 private schools; the five scenarios in §8.4 with a small mock-only engine for region expansion and
   ranks, clearly commented as mock-only). The five screens in §8.1 with every hook in §8.2, the stale banner §8.3,
   the design §9. Start against the mock; the real API shapes are §5.
2. When the lead prompts you, **cross-review sc1's foundations commit** (record shapes vs §5 and what your screens
   need) and write findings under "Cross-review of sc1" in your report. Tell the lead what doesn't match.
3. `app/playwright.config.mjs`: projects chromium-390, chromium-1280, webkit-390, webkit-1280 (phone: `hasTouch`,
   390×844), `webServer` = `node app/serve.mjs --port ${SC_APP_PORT:-8201}`, `reuseExistingServer: false`, output in
   `test-results/app`. Tests in `app/tests/*.spec.mjs` against `?mock=1`, with **real input** only (tap on phone
   projects, click on desktop, type with the keyboard; never set state through `evaluate`, except reading
   `elementFromPoint` / localStorage to assert):
   - pick: type "glover" → tap Glovertown Academy → `aria-pressed="true"` → Done → My schools shows its card; reload
     keeps it; Remove works; type "boreale" finds École Boréale (accent-insensitive).
   - storm: worst first (Bay d'Espoir Academy `closed_part` before Bishop White School `delayed`); label text and the
     verbatim quote; a Central school not in any row shows `closed` with the region-wide line "names the whole
     Central region"; Glovertown Academy shows the may-apply card with its reason and is NOT labelled Closed by that
     notice; a Western school is not affected; unmatched count shows for a Western pick.
   - today (real rows): Glovertown `Closed`, "School closed all day NOTE: Water Shut Off", "NLSchools doesn't show a
     posted time"; Eastside `Other notice, read it`.
   - quiet: Today shows `today-empty` with the open rule quote; a picked NLSchools school shows `Open, no notice` and
     "As of".
   - stale: `stale-banner` on all five screens; an unlisted NLSchools school shows `Unknown` with the stale reason.
   - csfp: École Boréale shows the may-apply card; another CSFP school shows `Unknown` with the CSFP reason; a private
     school shows `Unknown` "call the school".
   - notice detail: fields, "No longer on the list since" for a removed notice, applies-to and may-apply-to lists.
   - sources: every registry entry, link-only in words, terms quotes.
   - layout: no horizontal scroll at 390; every button/link/result on each screen ≥ 44×44 and hit-tested with
     `document.elementFromPoint` at its centre (the element or a descendant is on top).
   - quote guard: a mock notice whose quote isn't in its source_text is not rendered.
4. **Negative controls** (break, red, restore, record): render may_apply notices as applied (the exact-match-only
   bug from the brief) → storm may-apply spec red; remove the stale banner → stale spec red; break the sort → order
   spec red; remove the quote guard → guard spec red; shrink a tap target below 44 px → hit-test spec red.
5. `app/tests/integration.spec.mjs`: skipped unless `SC_WORKER_URL` is set; runs My schools, Today and a notice
   against a real local Worker seeded with sc1's `worker/tests/seed.mjs` (`?api=${SC_WORKER_URL}`), chromium-390 and
   webkit-1280 only. The lead runs it in QA.
6. Screenshots with `pwshot` (390 and 1280) of My schools (storm, quiet, stale), Pick, Today (storm, quiet), a notice
   and Sources into `app/tests/shots/`. Look at them and fix what looks wrong before reporting.

## Lead (sc-lead, not a slice)
Owns `PLAN.md`, `AGENTS.md`, `DECISIONS.md`, `docs/API.md`, `docs/DEPLOY.md`, `docs/build-report.md`, `README.md`,
`data/schools.json`, `data/samples/**`, `tools/**`, `package.json`, `package-lock.json`, `.gitignore`,
`.rig/config.json`, `docs/shots/**`. Reads reports, updates the contract, merges each slice after reading its diff,
runs cross-review, final QA from a pinned worktree (core, Worker, app, integration), the real scan, README, private
repo, status file.
