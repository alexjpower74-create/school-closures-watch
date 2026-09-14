# School Closures Watch — rulebook

**What it is.** On a stormy Newfoundland morning a parent picks their schools once and sees, in big type, whether
each one is open, delayed or closed and whether the buses are affected, straight from the official source: the
source's own words, when we first saw the notice, and "No notice on the NLSchools list as of 6:42 AM" when there
isn't one. Nothing is rewritten into new claims.

**Stack.**
- `core/`: pure ESM with zero dependencies. Text extraction, quote verification, Newfoundland time, the scan
  schedule, source adapters (NLSchools status list, NLSchools important notices, CSFP news feed), school matching,
  status rules, `runScan`. Runs in Node (`npm run scan`) and inside the Worker (`scheduled()`).
- `worker/`: Cloudflare Worker + D1 (`school-closures-watch`, binding `DB`). Local only: `wrangler dev --local`.
- `app/`: static HTML/CSS/JS, no build step, served by `node app/serve.mjs`.
- `scripts/scan.mjs` runs a live scan into the local Worker; `scripts/demo.mjs` starts Worker + app and scans on
  the schedule.
- `tools/build-schools.mjs` (lead) builds `data/schools.json` from the saved provincial school spreadsheet and
  directory pages in `data/samples/govnl/`.
- Contract `docs/API.md` · build plan `PLAN.md` · decisions and source evidence `DECISIONS.md` · real saved source
  files `data/samples/` (read-only for slices).

**Ports.** app 8201 · worker 8202 · core fixture server 8203 · worker fixture server 8204 ·
QA: app 8209, worker 8208, fixtures 8207 / 8206.

## Standing rules
- `AGENTS.md` is the rulebook; `CLAUDE.md` is a symlink to it. `PLAN.md` is the build contract; read it first.
- Own your slice's paths only. Commit with `git commit -- <paths>`. Verify → commit → report. Commit at every green
  step: a usage-limit pause can land mid-task.
- Numbers come from a QA worktree pinned to a sha (`rig qa --ref <sha>`), never from the shared tree.
- A check that cannot fail measured nothing. Every important check has a negative control (break it, watch it go
  red, restore), recorded in the build report.
- Browser tests use Playwright on chromium + webkit, at phone 390 and desktop 1280, with real input
  (click/tap/type). Tap targets are hit-tested with `document.elementFromPoint`. Screenshots with `pwshot` go
  into `docs/shots/` (lead) or `app/tests/shots/` (slice).
- **Real notices come only from the official sources.** Invented rows exist only in tests and the app's `?mock=1`
  mode, with `sample: true`, and their invented text starts with `SAMPLE `. Replays of the real saved files in
  `data/samples/` are `sample: true` but keep their verbatim text.
- Every notice shows its source, when we first saw it (the NLSchools list gives no posted time, so we never
  invent one), and a verbatim quote verified as an exact substring of the saved raw copy (API.md §0). Status
  labels come only from the fixed tables in API.md §4.
- **Never silently apply an ambiguous match.** Anything short of an exact name + community match, or a notice that
  names a whole region, is shown as "This notice may apply to your school" with the quote.
- **Never say "open" without a healthy source.** Only NLSchools schools can be "Open, no notice", and only while
  the NLSchools list was checked successfully and recently. Everything else is Unknown, with the reason.
- Scrapers: public pages only. Respect robots.txt and terms. Wait ≥ 1.1 s between requests to the same host.
  User-Agent `APCO-Software-Tools-research/1.0 (+https://apcosoftwaretools.ca)`. No logins. Never fetch a Link
  only or Not used source. Keep raw copies.
- AI: none.
- **No deploys** of any kind (no `wrangler deploy`, `secret put`, `d1 create`, nothing `--remote`). Nothing is sent.
  Private repo only.
- Plain English for Newfoundland parents, readable at a glance at 6:30 AM. No emoji as icons. No devils or demons
  imagery.
