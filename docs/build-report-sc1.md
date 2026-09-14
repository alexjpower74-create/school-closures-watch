# Build report — sc1 · Core rules, sources, scanner, Worker API + D1

Status: steps 1–7 DONE. Commits: f08b765 foundations · d168c7a adapters · da4d4f9 pipeline + scan.mjs · 50fe6a5 Worker +
Worker tests + seed + demo · 8c0cd3a spacing tests fixed (control G) + live data/sources.json · (last) `/api/today` `unplaced` + this report.

**Final runs on the last commit:** core **85/85** · Worker phase 1 **1/1**, phase 2 **19/19**.

## Contract questions
1. **`rig-harness` / `check()` isn't installed** on this machine (no binary or module anywhere). I ran the negative
   controls by hand, each in a throwaway `git archive HEAD` copy under `test-results/` (break, run, restore the file,
   run again). They're written up in section 6.
2. **§4.1 "from STATUS text (only when class unknown)"**: I read "class unknown" as *missing or not in the table*. A
   class in the table decides. Otherwise the STATUS-text rules apply, and failing those, `other`. A class that isn't in
   the table always goes into `unmapped_classes`, even when the STATUS text supplied a status.
3. **§4.4 more than one region named** ("all Central schools and all Western schools"): the contract has one
   `scope_region`. I use the earliest phrase, and `findRegionPhrase` returns `ambiguous: true`, which nothing uses yet.
   **Lead to decide**: first region only, one notice per region, or `district`.
4. **§4.2 region check for status rows** runs on `school_text` only, not on the note. An unmatched row whose note
   says "like all schools in the Central region" must not close 77 schools.
5. **§3.2 text notices**: status and scope come from `quote`, not `source_text`, so a region phrase from a
   *different* notice in the same box can't leak in.
6. **`CSFP_SHORT` and French elision**: `normName("École l'ENVOL")` is `ecole lenvol`, so `envol` never matches as a
   whole word. I allow a single `l`/`d` in front of a short name.
7. **Stale reason text when NLSchools was never checked** has no `{time}` to fill. I use "We haven't been able to
   check NLSchools yet. Check nlschools.ca or call the school."
8. **`stale_text`** isn't fixed by the contract. Mine (`core/schedule.js` `staleText`):
   - `last_attempt_failed`: "We couldn't reach the NLSchools list at 6:45 AM. Statuses below are from 6:40 AM."
     ("couldn't read" when the result was `format_changed`)
   - `overdue`: "We haven't been able to check the NLSchools list since 6:40 AM."
   - `never_checked`: "We haven't checked the NLSchools list yet."
9. **Ingest re-derives everything that isn't verbatim.** After re-verification the Worker re-runs `classifyNotice`
   (status, scope, matches) on the verified fields with its own school list, so a payload can't bring
   `matches: exact` with it. This is tested.
10. A nulled `list_date_text` also nulls the notice's `list_date`; the id doesn't change. At ingest the page-level
    `list_date` is re-read from the verified `list_date_text`, and `open_rule_quote` must equal `NLS_OPEN_RULE` *and*
    verify.
11. **CSFP schools**: `stale` comes from `csfp-news` health. `unmatched_in_region` counts unmatched
    `nlschools-status` rows for any school that has a region.
12. **§3.3 CSFP `source_text` can't be `extractText(title + " " + description)`.** In the raw feed the link, creator,
    pubDate, category and guid sit between title and description, so that string is never a substring of the raw
    text and every CSFP notice would be dropped. I use the whole `<item>` as text (clipped at 6000): one contiguous,
    verbatim place that contains the title.
13. **Empty DESCRIPTION/NOTES cell**: `quote` would be empty and the notice dropped, silently losing a real closure.
    The STATUS cell text (also verbatim, one place) is quoted instead.
14. **Ingest times are the Worker's `now`** (`?now=` only with `ALLOW_FAKE_NOW=1`), never the payload's
    `finished_at`. `first_seen_at`, `last_seen_at`, `removed_at` and health times all use it.
15. **`POST /api/admin/reset`** (Bearer) wipes the local D1. It exists only while `ALLOW_FAKE_NOW=1`: it's for
    tests and for `seed.mjs --reset`, and a 404 otherwise (tested).
16. **`sample`**: `runScan` marks notices `sample: true` whenever `SOURCE_ORIGIN_MAP` is non-empty, since those are
    replays. So a cron scan against fixtures produces hidden sample rows.
17. **`nlschools-notices` has no list date**, so its ids use `localDate(first scan)`. A notice still posted after
    midnight gets a new id and a new `first_seen_at`.
18. **Registry**:
    - Extra fields: `other_urls` (the Facebook link), `fetch_names` (raw_ref names), `coverage_quote`
      (`NLS_OPEN_RULE` on nlschools-status, `CSFP_RULE` on csfp-transport).
    - `nlschools-notices` `human_url` = `https://www.nlschools.ca/` (not given in §2).
    - `csfp-news` `human_url` = `https://csfp.nl.ca/`, with `reason` "No terms of use found on csfp.nl.ca".
19. **`/api/today` regions**: a notice is placed by `region_text` (`CENTRAL` → central), else by its matched school's
    region. See section 8 for the one gap.

## 1. Foundations — DONE ("foundations ready", f08b765)

Files: `core/text.js`, `core/time.js`, `core/schedule.js`, `core/labels.js`, `core/match.js`, `core/notice.js`
(derived fields and the §5.1 id, shared by adapters and Worker ingest), `core/verify.js`, `core/schools.js`,
`core/schools-data.js` (generated by `scripts/gen-schools.mjs`), `core/status.js`.

### Record shapes (for sc2's cross-review)

**Notice** (§5.1): a real row from the 2026-09-14 fragment. `first_seen_at`, `last_seen_at` and `removed_at` are
set by the Worker.
```json
{
 "id": "nlschools-status-2026-09-14-468-f3c04f26",
 "source_id": "nlschools-status", "sample": false, "kind": "school_row",
 "list_date": "2026-09-14", "list_date_text": "Monday, September 14, 2026", "row_id": "468",
 "school_text": "Glovertown Academy", "community_text": "Glovertown, NL", "family_text": "FOS 05", "region_text": "CENTRAL",
 "status_class": "closedAllDay", "status_text": "CLOSED ALL DAY",
 "status": "closed", "status_basis": "class", "status_evidence": "closedAllDay",
 "title": null, "quote": "School closed all day NOTE: Water Shut Off",
 "source_text": "Glovertown Academy Glovertown, NL CLOSED ALL DAY School closed all day NOTE: Water Shut Off FOS 05 CENTRAL",
 "posted_at": null, "posted_text": null,
 "first_seen_at": "2026-09-14T16:40:05.000Z", "last_seen_at": "2026-09-14T16:40:05.000Z", "removed_at": null,
 "scope": "school", "scope_region": null, "scope_evidence": null, "unmatched_reason": null,
 "matches": [{ "school_id": "nls-300422", "how": "exact", "reason": null }],
 "link": "https://www.nlschools.ca/schools/statusreport.jsp",
 "raw_refs": ["nlschools-status/2026-09-14T16-40-05-000Z-statusreport.html", "nlschools-status/2026-09-14T16-40-05-000Z-schoolstatus.html"]
}
```
- Region-wide notices have `matches: []`. The API expands them: `applies` gets `how: "region"` (or `"province"`) in
  `/api/status`, and `applies_to` lists all 77 schools in `/api/notices/:id`.
- Feed posts: `status "may_apply"`, `scope "board"`, and every `matches` entry has `how: "may_apply"`.

**SchoolStatus** (§5.4), from `schoolStatus(school, indexNotices(notices), health, now)`:
```json
{
 "school": { "id": "nls-300422", "name": "Glovertown Academy", "community": "Glovertown", "region": "central",
   "region_name": "Central", "board": "NLSchools", "coverage": "nlschools", "type_code": "K-12", "grades_text": "K–12",
   "phone": "533-2443", "source_id": "govnl-public-schools",
   "source_url": "https://www.gov.nl.ca/education/files/PublicEnrollment_FINAL2025-10-31.xlsx" },
 "status": "closed", "label": "Closed", "rank": 1,
 "source_status_text": "CLOSED ALL DAY",
 "headline_notice_id": "nlschools-status-2026-09-14-468-f3c04f26",
 "applies": [{ "notice_id": "nlschools-status-2026-09-14-468-f3c04f26", "how": "exact" }],
 "may_apply": [],
 "reason": null, "reason_text": null,
 "as_of": "2026-09-14T16:40:05.000Z", "stale": false,
 "list_date_text": "Monday, September 14, 2026",
 "unmatched_in_region": 0
}
```
- **May apply**: `status "may_apply"`, `applies: []`,
  `may_apply: [{ notice_id, reason: "name_similar", reason_text: "The notice names a similar school: \"SAMPLE Glovertown\"." }]`.
- **Stale**: an applying notice keeps its status and gets `stale: true`. With no applying notice the school is
  `unknown` / `stale`, and the `may_apply` list is still filled.
- `school` is the §5.3 shape (no `urban_rural` or `source_row`; `operator` only when set).

**SourceHealth** (§5.2) is built in the Worker exactly as in the contract. `last_result` is `never` before the first
ingest, and link-only / not-used entries are never stale.

## 2. Adapters — DONE (d168c7a)
`core/sources/registry.js` (+ `NLS_OPEN_RULE`, `CSFP_RULE`), `nlschools-status.js`, `nlschools-notices.js`,
`csfp-news.js`. `core/tests/adapters.test.mjs` (14 tests) reads the real files in place, with SAMPLE fixtures in
`core/tests/fixtures/`. Every notice any adapter returns must pass `verifyNotice` against its own raws with nothing
nulled.
- **Real files**:
  - 2026-09-14: 2 rows. Glovertown exact / `closed` / "School closed all day NOTE: Water Shut Off" / FOS 05 /
    CENTRAL. Eastside exact / `other` (never `buses_delayed`); its quote starts "Other NOTE: Due to a water main
    break at the bottom of Massey Dr".
  - `list_date` 2026-09-14, `open_rule_quote` set.
  - Wayback 2024-01-10 → Bay d'Espoir `closed_part`, Bishop White and St. Mark's `delayed`, all exact. 2024-01-17 →
    Eastside `closed`. 2025-07-31 → Upper Gullies `early_dismissal`.
  - The three empty notice boxes → 0. The CSFP feed at 18:00Z → 0.
- **SAMPLE fixtures**:
  - Whole-Central row (`region`/`central`, evidence "All Central Region Schools").
  - Text notice naming the Central region, and link notices (absolute hrefs).
  - "SAMPLE Glovertown" / "Gander, NL" → `name_similar`.
  - "Glovertown Academy" / "Gander, NL" → `name_same_community_differs`.
  - Unmatched row → `no_school`. Class `snowDay` → `other` + `unmapped_classes`. A 2-cell row → `rows_skipped: 1`.
  - Fragment without the table → `format_changed`.
  - Page without the date line → `list_date` null. Page without the open rule → null.
  - CSFP SAMPLE post naming École Boréale → 1 notice, may_apply to Boréale only. The old post and the post without
    a closure word are excluded, and the 36 h / 1 h window edges are tested.
- `NLS_OPEN_RULE`, `CSFP_RULE` and the NLSchools terms quote are exact substrings of their saved files.

## 3. Pipeline — DONE (da4d4f9)
- **`core/pipeline.js` `runScan`**:
  - Scans due sources only unless `force`; `only` must name a used source (link-only / not-used throw "never
    fetched").
  - One queue per real host, each request starting ≥ 1.1 s after the previous one to that host *finished*. Same-host
    sources run in registry order (status page, fragment, then notices); csfp.nl.ca runs alongside.
  - Research UA, 20 s timeout. Failures come back as "HTTP 503" / "timeout" / "network error".
  - Raw refs follow §0. Notices are verified, then re-classified. Page-level `list_date_text` and `open_rule_quote`
    are verified too.
- **`scripts/scan.mjs`**:
  - Flags `--dry --only --force --watch --now`. Env `SC_WORKER_URL`, `SC_ADMIN_TOKEN` (else `worker/.dev.vars`, else
    `local-dev-token`), `SOURCE_ORIGIN_MAP`.
  - Health for the due check comes from the Worker's `/api/sources` (on `--dry`, from `data/sources.json`).
  - One POST per scanned source. Writes `data/sources.json`; `--dry` also writes `data/scan-latest.json`, with bodies
    replaced by byte counts.
  - `SC_DATA_DIR` exists for tests only.
- **Fixture server** `core/tests/fixture-server.mjs`:
  - Real paths, switchable scenarios: `today quiet gone region ambiguous storm stale norule nodate format csfp`.
  - `/__log` (UA and time per hit), `/__fail`, `/__hang`.
  - Every registry origin, link-only included, is mapped onto it, so a stray request would show up in the log.
- **`core/tests/pipeline.test.mjs`** (14 tests, port 8203):
  - Real files → payloads.
  - UA on every hit, and the order page → fragment → notices.
  - **≥ 1.1 s measured at the server**, and **≥ 1.1 s with a fake clock**. csfp.nl.ca isn't held back.
  - **Link-only never requested**: the spy's URLs are exactly the used `fetch_urls`, no `/__linkonly` hits, and
    `only: <link-only>` rejects.
  - Due-only / later / `--only`; 503 → error; hang → timeout; format_changed keeps its raws; a tampered quote is
    dropped and counted; the storm scenario.
  - `scan.mjs`: `--dry --force` writes sources.json / scan-latest.json / the raw cache; POSTs 3 ingests with the
    Bearer token to a fake Worker; without `--force` skips what the Worker says was just attempted; `--only <link-only>`
    exits 2 with no request.

**Core total: 85 tests, 0 failing** (`node --test 'core/tests/**/*.test.mjs'`, ~17 s).

## 4. Worker — DONE (50fe6a5)
- **Config**: `worker/wrangler.toml` (name, main, `compatibility_date = "2026-09-01"`, D1 `DB` with
  `LOCAL-ONLY-set-at-deploy`, `crons = ["*/5 * * * *"]`, vars). Also `worker/.dev.vars.example`,
  `worker/package.json` (`dev`, `migrate:local`, `test`) and `worker/migrations/0001_init.sql` (§7 tables;
  `raw_copies` has an extra `ingested_at` for pruning).
- **Endpoints** (`worker/src/index.js`): all of §7. GET responses carry CORS `*` and `no-store`; OPTIONS → 204;
  errors are `{error, message}`.
- **Ingest**, in order:
  1. Bearer check (constant-time) and payload shape.
  2. Notice shape.
  3. **§0 re-verification against the payload's raws**, then re-derivation (point 9 above).
  4. Upsert keeps `first_seen_at` and sets `last_seen_at`. A notice seen again gets `removed_at` cleared.
  5. On `ok`, every current notice of that source with the same sample flag that isn't in the payload gets
     `removed_at = now`. `error` / `format_changed` only change health.
  6. Raw copies: the last 3 ingests per source are kept, plus any raw a current notice points at.
- **Scans**: `scheduled()` and `POST /api/admin/scan` both call `scanInWorker` (the same `runScan` + ingest code).

## 5. Worker tests — DONE
`npm --prefix worker test` → `worker/tests/run.mjs`:
1. Fails if 8202 or 8204 is already in use (never reuses a server).
2. Wipes and migrates `.wrangler/test-state` with `--local`.
3. Starts the fixture server on 8204.
4. **Phase 1**: `wrangler dev --local` with `ALLOW_FAKE_NOW=0`, running `real-now.test.mjs`.
5. **Phase 2**: restarts with `ALLOW_FAKE_NOW=1 --test-scheduled`, running `api.test.mjs` (`--test-concurrency=1`).
6. Stops everything.

Results on 50fe6a5: **phase 1 1/1, phase 2 19/19**:
- now is ignored unless ALLOW_FAKE_NOW=1 (GET and ingest); the reset endpoint does not exist
- today ingest → Glovertown closed exact, Eastside other, another NLSchools school open with as_of
- École Boréale unknown csfp_no_online_status; a private school unknown no_official_source; unknown ids listed
- SAMPLE whole-Central closure → all 77 Central NLSchools schools closed how region; no Western or CSFP school affected
- SAMPLE ambiguous → Glovertown may_apply (NOT closed)
- stale (fixture 503) → stale true + stale_text; open schools become unknown stale; Glovertown stays closed with stale true
- overdue without a failure is stale too (10 minutes after the next scan was due)
- a second ok scan without a row → removed_at set and it appears in /api/today earlier (and it comes back if re-listed)
- old list date → unknown list_date_old
- open rule missing → unknown open_rule_missing; date line missing → list_date_missing
- tampered quote at ingest → dropped
- a payload cannot bring its own matches or status: the Worker re-derives them
- 401 without token (ingest, scan); 400 on a bad payload
- /api/raw/… returns the saved body; unknown raw → 404
- unknown notice → 404
- SAMPLE rows hidden without include_sample=1
- /api/admin/scan (the scheduled() code path) against the fixture origin: polite (gaps ≥ 1100 ms at the fixture), due-only unless forced (+1 min all skipped; +5 min NLSchools due, CSFP not)
- CSFP SAMPLE post → École Boréale may_apply; École Sainte-Anne stays unknown
- /api/schools, /api/sources, /api/health, CORS preflight
- cron: scheduled() runs a scan (wrangler --test-scheduled)

**`worker/tests/seed.mjs --url <worker> --token <t> --scenario today|storm|quiet|stale [--now ISO] [--reset]`**
(also `csfp region ambiguous`). It builds payloads in-process with the real `runScan` over the fixture files and
POSTs them. Everything is `sample: true`, so view with the app's `?sample=1`.
- `stale` = an ok scan 45 min before `--now`, then a failed one 5 min before. Without `ALLOW_FAKE_NOW=1` both land at
  the Worker's now, which is still stale (last attempt failed).

## 6. Negative controls — DONE
Each control ran in a clean `git archive HEAD` copy under `test-results/nc-*`: patch, run, restore the file, run
again. The core and pipeline controls were re-run after restoring. For the Worker controls, "green again" is the full
Worker run on the unchanged tree (section 5, and the final run below), since each Worker run takes about a minute.

**Control G found a real hole.** Both spacing tests compared gaps against the *imported* `HOST_GAP_MS`, so setting it
to 0 would still have passed. They now use a literal 1100 from the AGENTS.md rule (8c0cd3a). Only then did G go red.

| # | Break | Red (failing tests) | Restored |
|---|---|---|---|
| A core | `matchRow` exact-name-only (rules 2–4 dropped) | 7 of 71: 4 `may_apply …` match tests, `SAMPLE storm fragment …`, `may_apply: ambiguous row is NOT applied`, `stale: …` | 71/71 |
| C core | `staleness()` always `{stale:false}` | 4: two §6 worked examples ("stale after"), `staleness reasons and plain text`, `stale: applying notices keep their status…` | 71/71 |
| D core | region expansion off in `schoolStatus` | 2: `region-wide: every Central NLSchools school…`, `worst applying notice wins…` | 71/71 |
| E core | busy windows shifted +1 h (`[[6,10],[12,14]]`) | 4: `§6 worked example: Mon 04:02…`, `a January date uses NST`, `busy window edges…`, `nextDue across the end of the week…` | 71/71 |
| F core | open-rule check removed from `schoolStatus` | 1: `unknown reasons: list_date_old, list_date_missing, open_rule_missing` | 71/71 |
| F2 core | adapter always sets `open_rule_quote` | 1: `page without the date line …; page without the open rule → open_rule_quote null` | 71/71 |
| H pipeline | `runScan` verification skipped | 1 of 14: `verification runs in runScan: a tampered quote is dropped and counted` (actual `[2, 0]`, expected `[1, 1]`) | 14/14 |
| G pipeline | `HOST_GAP_MS = 0` | 2 of 14: `≥ 1.1 s … (measured at the fixture server)` ("gap 2 ms"), `≥ 1.1 s … (fake clock)` ("gap 500") | 14/14 |
| A Worker | exact-name-only | 2 of 19: `SAMPLE ambiguous → Glovertown may_apply (NOT closed)`, `a payload cannot bring its own matches or status` | full run green |
| B Worker | ingest: `verified = { notices: shaped, dropped: 0 }` | 2 of 19: `tampered quote at ingest → dropped`, `a payload cannot bring its own matches or status` | full run green |
| C Worker | staleness disabled | 3 of 19: `stale (fixture 503) → …`, `overdue without a failure is stale too`, `/api/schools, /api/sources…` (used sources `never_checked`) | full run green |
| D Worker | region expansion off | 1 of 19: `SAMPLE whole-Central closure → all 77 …` | full run green |
| F Worker | open-rule check removed | 1 of 19: `open rule missing → unknown open_rule_missing; …` | full run green |

Not controlled: F2 in the Worker. The adapter can't make the Worker say Open on its own, because ingest re-verifies
`open_rule_quote` against the raw page, so F2 is only red in core.

## 7. Demo + live check — DONE
`scripts/demo.mjs` (`npm run demo`):
1. Refuses if 8202 or 8201 is already in use.
2. Creates `worker/.dev.vars` from the example if missing.
3. Migrates local D1, then starts the Worker (8202) and the app (8201, when `app/serve.mjs` exists).
4. Runs one forced live scan, then `scan.mjs --watch`, and prints the URL. Ctrl-C stops every child.

I didn't run the demo (it does live scans).

**One live check**: `node scripts/scan.mjs --dry --force`, run once at 2026-09-14T17:30:46Z (14:00 NDT). It took 3 s
and was polite (1.1 s gaps). Results:

| source | result | list date | notices | requests (HTTP, bytes) |
|---|---|---|---|---|
| nlschools-status | ok | 2026-09-14 ("Monday, September 14, 2026"), open rule found | 2 (0 dropped, 0 rows skipped, no unmapped classes) | statusreport.jsp 200 59,925 · schoolstatus.html 200 3,089 |
| nlschools-notices | ok | – | 0 | newspostings_5.html 200 65 |
| csfp-news | ok | – | 0 | feed/ 200 75,650 |

The two live rows are the same as the saved samples: Eastside Elementary (Corner Brook, `otherStatus` → other, exact)
and Glovertown Academy (Glovertown, `closedAllDay` → closed, exact). `data/sources.json` from this run is committed.

## 8. Left undone / for other slices
- **sc2 / lead**: to run the app against a real Worker:
  1. `npm --prefix worker run migrate:local`
  2. `npm --prefix worker run dev` (with `ALLOW_FAKE_NOW=1` in `worker/.dev.vars` if you want `--reset` and `?now=`)
  3. `node worker/tests/seed.mjs --scenario storm --reset --now 2026-09-14T10:40:00Z`
  4. Open the app with `?sample=1&now=2026-09-14T10:41:00Z`.
- **`/api/today` `unplaced`** (DONE; an addition to §7): status rows with no recognisable `region_text` and no
  matched school are listed there, so none is silently left out. A test checks that regions + unplaced add up to
  `counts.current`. **Lead: please add `unplaced` to §7, and sc2 should show it if it is ever non-empty.**
- **Lead decision**: point 3 (two regions in one notice), and the NLSchools terms (DECISIONS.md, NEEDS ALEXANDER)
  before anything public.

## Round 2 (lead 14:50 / 14:55 / 15:10 / 15:20) — DONE
main is merged in (lead files only). Code and tests are in 734de73; this report and `data/sources.json` are in the
next commit.

**Test counts** (working tree = 734de73, on the **QA ports**):
- core `SC_FIXTURE_PORT=8207`: **90/90**
- Worker `SC_WORKER_PORT=8208 SC_WORKER_FIXTURE_PORT=8206`: phase 1 **1/1**, phase 2 **22/22**

| # | Item | Where | Test |
|---|---|---|---|
| 1 | Old lists never set today's status | `core/status.js` `isOldList`: ignored for applies, may_apply and `unmatched_in_region`. `/api/today` leaves them out of current and lists them under `earlier` | core `old lists never set today's status … → open` (2026-09-11 closed exact notice, Monday 07:00 NDT, healthy list → `open`; also old may_apply, old region row, old unmatched). Worker `old list (lead fix 14:55): Monday's rows never set Tuesday's status; /api/today lists them under earlier` |
| 2 | Region phrase before similarity (§4.2 3a) | `core/notice.js`: with no same-name school, `findRegionPhrase(school_text)` is checked before the similar-name result | core `§4.2 rule 3a: a region phrase is checked BEFORE similar names`: SAMPLE list with "Central High" (key `{central}`); "SAMPLE All schools in the Central region" → `region`, not may_apply |
| 3 | More than one region named → `district` | `core/notice.js` `regionScope` (status rows and text notices) | core `§4.4 more than one distinct region named → district` (the same region named twice stays `region`) |
| 4 | `name_same_community_differs` with no community | `mayApplyReasonText` | core `may_apply reason text when the row gives no community` |
| 5 | `unmatched_in_region` for NLSchools schools only | `schoolStatus` | core `unmatched_in_region …`: École Sainte-Anne and a private school get 0; the storm-seed Worker test checks École Boréale 0 and Eastside 1 |
| 6 | Stale text: never ok, an attempt failed | `staleText` (already worded this way) | core `stale_text when no check was ever good but an attempt failed` (NLSchools list and CSFP news feed) |
| 7 | What sc2's screens need | `/api/today` `applies_to[]` gains `reason` (may_apply schools included); the notices map, `sources[]` fields, relative `raw_links` and CORS were already there | Worker `CORS: every GET (errors and raw copies too) …; preflight allows authorization`; Worker `storm seed (seed.mjs): /api/status notices map is complete; /api/today applies_to has may_apply with reason; sources fields` (runs `seed.mjs` as a child process; 9 references, all present; regions + district + region_wide + csfp + unplaced = `counts.current`) |
| 9 | QA ports | `run.mjs` already used `SC_WORKER_PORT`/`SC_WORKER_FIXTURE_PORT` for the busy-port refusal; `pipeline.test` uses `SC_FIXTURE_PORT`; `seed.mjs`, `scan.mjs` and the Worker test helpers now default to the env ports | Busy-port check: holding 8216 with `SC_WORKER_FIXTURE_PORT=8216` → exit 1 "[run] port 8216 is already in use: refusing to reuse another server"; holding 8218 with `SC_WORKER_PORT=8218` → exit 1 "[run] port 8218 is already in use …" |

Two existing tests changed because the rules changed, not to make them pass:
- Worker `old list date → unknown list_date_old` asserted Glovertown stays `closed` on Tuesday. Under 14:55 it is
  `unknown` / `list_date_old`, so the test says that now.
- The new storm test first had a guessed `≥ 10` references. The storm seed has exactly 9, so the test pins 9.

### Round 2 negative controls
Each ran in a copy of the working tree under `test-results/r2-nc-*`: break, run, restore. Core copies were re-run
after restoring. Worker "green again" is the QA-port run above.

| Control | Break | Failing lines | Restored |
|---|---|---|---|
| A core: exact-name-only | `matchRow` returns no_school after rule 1 | 9 of 60: `SAMPLE storm fragment…`, `may_apply: "SAMPLE Glovertown" / "Gander, NL" → … name_similar (never exact)`, `may_apply: same name, different or missing community…`, `may_apply: a name shared by more than one school…`, `similar names: 1–5 candidates…`, `§4.2 rule 3a…`, `stale: applying notices keep their status…`, `may_apply: ambiguous row is NOT applied`, `may_apply reason text when the row gives no community` | 60/60 |
| A Worker: exact-name-only | same | 3 of 22: `SAMPLE ambiguous → Glovertown may_apply (NOT closed)`, `a payload cannot bring its own matches or status…`, `storm seed (seed.mjs)…` | QA run green |
| OL core: old-list guard removed | `isOldList` returns false | 1: `old lists never set today's status (lead fix 14:55): a 2026-09-11 closed exact notice on Monday 07:00 → open` | 60/60 |
| OL Worker: old-list guard removed | same | 2: `old list date → unknown list_date_old`, `old list (lead fix 14:55): Monday's rows never set Tuesday's status…` | QA run green |
| R3a core: region check back after similarity | `region = sameName \|\| m.matches.length ? null : findRegionPhrase(…)` | 1: `§4.2 rule 3a: a region phrase is checked BEFORE similar names (lead fix 14:55)` | 60/60 |
| AMB core: ambiguous → district off | `regionScope` ignores `ambiguous` | 1: `§4.4 more than one distinct region named → district…` | 60/60 |

The first-round controls (B, C, D, E, F, F2, G, H) cover code that round 2 didn't change; their record is in section 6.

### PLAN steps 6 and 7
- Step 6: every control is recorded (section 6 and above).
- Step 7, the live `--dry --force` check: done in round 1 (section 7).
- **`npm run demo`**, run once here at 15:14 NDT:
  - It created `worker/.dev.vars` from the example, applied the local migrations and started the Worker on 8202.
    There's no `app/serve.mjs` in this tree yet.
  - It ran one forced live scan, ingested into the local Worker: nlschools-status ok, list 2026-09-14, 2 notices
    (59,928 + 3,089 bytes); nlschools-notices ok, 0 notices (65 bytes); csfp-news ok, 0 notices (75,650 bytes).
  - `--watch` then checked every minute and correctly skipped everything as `not_due`. Ctrl-C stopped every child,
    and 8202 was free afterwards.
  - `data/sources.json` from that scan is committed.

### Still open
- Nothing from round 2.
- The NLSchools terms still need Alexander's sign-off before anything public (DECISIONS.md).
