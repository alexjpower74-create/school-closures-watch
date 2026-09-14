# Build report: sc2 · The app (screens, mock, Playwright)

## Contract questions
1. **Storm spec vs §4.5.** The SAMPLE whole-Central closure applies to every Central NLSchools school, so under §4.5
   Bay d'Espoir Academy and Bishop White School (both Central) are **both `closed`**, not `closed_part` / `delayed`.
   I followed §4.5. The brief's "Bay d'Espoir `closed_part` before Bishop White `delayed`" is tested as: the cards come
   worst first then by name (Bay d'Espoir, Bishop White, Botwood, Glovertown all `closed`, then the Western school
   `open`), each card lists its own real notice (`data-notice-status="closed_part"` / `"delayed"`) under the
   region-wide headline, and on Today the Central list is worst first. If the lead wanted the storm scenario without
   the region closure touching those schools, the scenario (not the rules) needs changing.
2. **What the card shows when the quote guard drops a school's only notice.** Nothing in the contract says. The app
   shows `Unknown` with an app-side reason ("A notice for this school didn't match the words we saved from the source,
   so we don't show it. Check nlschools.ca or call the school.", reason code `quote_check_failed`). If other applying
   notices remain, the worst of those becomes the status. Please confirm or give fixed wording.
3. **Stale banner on Pick and Notice.** `/api/schools` and `/api/notices/:id` don't carry every used source's health,
   so those two screens also call `/api/sources` for the banner.
4. **`?ids=a,b`.** My schools shows the ids in the URL without saving them. It is the Done link when localStorage is
   unavailable, and it lets `pwshot` photograph My schools. Tests never use it (they pick through the UI).
5. **`/api/today` `applies_to[].how`.** The app renders `exact` as "Matches:" and `may_apply` as "May apply to:".
   Please confirm the Worker includes `may_apply` matches in `applies_to` (the contract lists `how` without values).
6. **Stale with an applying notice.** The card keeps the notice's status and says "As of 2:15 PM, the last good
   check" (app wording) under the stale banner.
7. **May-apply card wording.** Besides the fixed title and `reason_text`, the card shows "The notice names: SAMPLE
   Glovertown, Gander, NL" (the row's verbatim `school_text`, `community_text`) and the row's own seen line. It never
   shows a status label.
8. **Mock details the contract doesn't fix.** The storm scenario's `list_date_text` is `SAMPLE Wednesday, January 10,
   2024`, because there is no saved 2024 page to copy a date line from. A sixth, test-only scenario `checks` holds a
   SAMPLE row with a tampered quote plus a SAMPLE district notice. The mock doesn't sort `/api/status` (the real API
   does), so the app's own sort is what gets tested. Registry names for entries §2 lists without a name are mock-only;
   the real app reads them from `/api/sources`.
9. `rig-harness` `check()` isn't installed here (sc1 found the same). The negative controls were run by hand with a
   script (below).

## What I built: DONE
- `app/serve.mjs`: zero-dep static server for `app/` only (Road Watch's approach). Hides tests, the config and the
  mock builder. Port from `--port` (8201).
- `app/index.html` + `my.js` (**My schools**), `pick.html` + `pick.js`, `notice.html` + `notice.js`,
  `today.html` + `today.js`, `sources.html` + `sources.js`, with shared `common.js` (DOM builder, SVG status
  icons, header, stale banner), `render.js` (school card, notice block, may-apply card, district notice, Today
  notice, quote guard), `labels.js` (§4.1/§4.5/§5.4 fixed wording), `format.js` (Newfoundland times via `Intl`),
  `text.js` (`normText`, the guard check, the accent-insensitive search key), `store.js` (`scw.schools.v1`, guarded),
  `params.js`, `client.js` (picks `api.js` or `api.mock.js`), and `app.css` (§9 look).
- `app/api.js` (the real §7 client, passes `now` and `include_sample`) and `app/api.mock.js` (same exports).
- `app/mock/`:
  - `build.mjs` generates `data.js`: 31 real school rows from `data/schools.json` (the six real-row schools, 12
    Central, 4 Western, 3 Avalon, 2 Labrador, all 6 CSFP, 2 private, 1 Indigenous, 1 other), and the real status rows
    extracted verbatim from `data/samples/` with the §0 rules.
  - `scenarios.js` holds the §8.4 scenarios (`today`, `storm`, `quiet`, `stale`, `csfp`) plus test-only `checks`.
  - `engine.js` (MOCK-ONLY) handles region expansion, ranks, Unknown reasons and "old lists never set today's status",
    returning §7 shapes.
  - `registry.js` is a mock copy of §2.
- Every §8.2 hook is present, plus a few extra (`today-notice`, `region-current`, `region-unmatched`,
  `region-earlier`, `removed-at`, `source-text`, `applies-to`, `may-apply-to`, `open-rule-quote`, `terms-quote`,
  `source-kind`, `checked-at`).
- `app/playwright.config.mjs`: chromium-390, chromium-1280, webkit-390, webkit-1280 (phone `hasTouch`, 390×844),
  `webServer` `node app/serve.mjs --port ${SC_APP_PORT:-8201}`, `reuseExistingServer: false`, output
  `test-results/app`.

## Verified: DONE
`npm run test:app` on all four projects: **100 passed, 4 skipped** (integration, no `SC_WORKER_URL`) at `91cffa0`
(my worktree; the lead's QA numbers come from `rig qa`).

| Spec | What it proves | What would make it red |
|---|---|---|
| `pick` | type "glover", tap, `aria-pressed="true"`, Done → card; reload keeps it (localStorage read to assert); Remove; "boreale" finds École Boréale; private school says "No official closure list, call the school" | search not accent-insensitive; state not saved |
| `storm` | worst-first card order (picked in the wrong order on purpose); Bay d'Espoir label, verbatim `CLOSED FOR MORNING` + quote; Botwood (Central, no row) `closed` with "names the whole Central region"; Glovertown may-apply card with reason and quote, and the only applied notice is the region one; Western school `open` + unmatched count; Today order, unmatched and earlier sections | C1, C3 below |
| `today` | real rows: Glovertown `Closed`, `CLOSED ALL DAY`, "School closed all day NOTE: Water Shut Off", "NLSchools doesn't show a posted time"; Eastside `Other notice, read it`; quiet: `today-empty` + open rule quote, a picked school `Open, no notice` + "as of 6:40 AM" | wrong label table, wrong time zone |
| `stale` | banner (role alert, not dismissible, at the top) on all five screens; unlisted school `Unknown` + stale reason; nothing Open; Glovertown keeps `closed`; no banner when healthy | C2 below |
| `csfp` | Boréale may-apply; Sainte-Anne `Unknown` + CSFP reason; Anchor Academy `Unknown` "call the school"; no Open | |
| `notice` | every field of a real row; "No longer on the list since 6:35 AM"; region notice applies to the 12 Central NLSchools schools only (no Eastside, no École); ambiguous row's may-apply-to, reached by tapping from My schools | |
| `sources` | all 8 registry entries, kinds in words, terms quotes, "No terms of use found", link-only reasons, school counts, coverage gaps | |
| `layout` | 5 screens: no horizontal scroll; every visible `a, button, input, summary, pick-result` ≥ 44×44 and on top at its centre (`elementFromPoint`, scrolled with the mouse wheel) | C5 below |
| `guard` | the tampered notice is on no screen, a console warning names it, the school is `Unknown` with the guard reason, its notice page says "This notice can't be shown" | C4 below |

Real input only: `tap()` on phone projects, `click()` on desktop, `keyboard.type` in the search box, the mouse wheel
for scrolling. `evaluate` is only used to read (`elementFromPoint`, sizes, `localStorage`, `details.open`).

## Negative controls
Run by `app/tests/negative-controls.py`. For each control it patches one
file, runs the named specs on **chromium-390 and webkit-1280**, restores the file with `git checkout`, and runs the
specs again. All five went red, then green again, at `468edb3`.

| # | What I broke | Spec | Broken run | Failing line | Restored |
|---|---|---|---|---|---|
| C1 | `render.js` `schoolCard`: `may_apply` entries merged into `applies` as `exact`, may-apply cards not drawn (the exact-match-only bug) | storm + csfp | 4 failed, 10 passed | `locator('[data-testid="school-card"][data-school-id="nls-300422"]').locator('[data-testid="may-apply"][data-notice-id="nlschools-status-2024-01-10-sample-1-mock"]') Expected: visible`; Boréale `getByTestId('may-apply') Expected: 1 Received: 0` | 14 passed |
| C2 | `common.js` `renderStale`: `const stale = []` (banner never drawn) | stale | 2 failed, 2 passed | `expect(locator).toBeVisible() failed Locator: getByTestId('stale-banner')` | 4 passed |
| C3 | `labels.js` `byRankThenName`: rank ignored (`0 * (a.rank - b.rank)`) | storm | 2 failed, 10 passed | `storm › cards are worst first, then by name`: `toEqual` deep equality, Expected −1 / Received +1 (C. C. Loughlin, open, sorted in among the closed schools by name) | 12 passed |
| C4 | `text.js` `quoteIsVerified`: `return true` (guard removed) | guard | 2 failed | `locator('[data-testid="school-card"][data-school-id="nls-300417"]') Expected: "unknown" Received: "closed"` | 2 passed |
| C5 | `app.css` `.button-link` `min-height: 30px; max-height: 30px` | layout | 8 failed, 2 passed (Pick has no button-link) | `expectTargetsHittable`: `toEqual([])` got 3 (My schools) / 9 (Today, Notice, Sources) `"Read the notice" is …×30 (< 44)` entries | 10 passed |

These controls cover the sort, the guard, the banner, may-apply and tap size. The layout hit-test can also catch
covered targets (it reports what `elementFromPoint` hit), but I didn't run a separate control that overlays a
target.

## Screenshots
`pwshot` (chromium) at 390 (`--phone`, full page) and 1280×900 (full page) into `app/tests/shots/`:
`my-storm`, `my-quiet`, `my-stale`, `pick`, `today-storm`, `today-quiet`, `notice`, `sources` (`-390.png`,
`-1280.png`). My schools uses `?ids=` because `pwshot` can't tap.

I looked at each of these:
- my-storm 390/1280, my-stale 390, my-quiet 1280, pick 390, today-storm 1280, today-quiet 390, notice 390,
  sources 1280.
- **Fixed:** on the phone, Pick's "Remove" buttons wrapped mid-word ("Remo / ve"). The cause was
  `overflow-wrap: anywhere` on the body, which let flex rows squeeze buttons below their word width. It's now
  `break-word`, plus `flex: none` on the Remove button. Layout and pick specs are green again (28 passed), and I
  retook and rechecked the Pick shot.
- Still true, and worth the lead's eye:
  - On desktop Today, an empty region card sits beside a tall one (two-column grid, `align-items: start`), leaving
    empty space.
  - A storm card at 390 is long, because the region notice and the school's own notice are both shown in full.
  - Screenshots are chromium only; webkit rendering is covered by the Playwright suite, not by shots.

## Cross-review of sc1
Read `f08b765` (foundations) and rechecked `core/status.js` / `core/schedule.js` at `d168c7a`. **Shapes match §5.4:**
`schoolStatus()` returns every key my screens read (`status`, `label`, `rank`, `source_status_text`,
`headline_notice_id`, `applies[{notice_id, how}]`, `may_apply[{notice_id, reason, reason_text}]`, `reason`,
`reason_text`, `as_of`, `stale`, `list_date_text`, `unmatched_in_region`). May-apply is never applied, stale keeps an
applying notice's status, region expansion only reaches NLSchools schools, and CSFP `stale` comes from `csfp-news`.
The Notice example matches §5.1 field for field.

Doesn't match, or needs a decision (sent to the lead here):
1. **Old lists aren't ignored yet.** `indexNotices` drops only `removed_at`. The 14:55 rule (a notice with
   `list_date < today_local` can't set today's status) isn't in `core/status.js` at `d168c7a`, so a 2026-09-11 `closed`
   exact notice would still close the school on 2026-09-14 unless the Worker filters first. The mock engine and my
   screens follow the rule.
2. **Empty community in a reason.** `mayApplyReasonText('name_same_community_differs')` with `community_text: null`
   gives `The notice names this school but a different community: "".` Parents would see empty quotes. The contract
   needs wording for "community missing".
3. **`unmatched_in_region` counts for CSFP schools too** (sc1 note 11). The app would put "1 notice in the Western
   region couldn't be matched to a school" on a CSFP card, but those rows are NLSchools rows. I suggest NLSchools
   schools only. Lead to decide; the app shows whatever the API sends.
4. **An extra stale_text variant.** `staleText('never_checked')` with a failed attempt says "…We haven't had a good
   check yet." That wording isn't in the 14:50 list. It's harmless, but it isn't fixed wording.
5. **Tie order.** Core orders same-rank notices by `first_seen_at`, then id. The card now puts `headline_notice_id`
   first, then the rest worst first, so the headline always agrees with the API.
6. **What the screens need from the Worker (step 4), for sc1 to check:**
   - `/api/status.notices` has every id referenced by `applies` (including region and province notices) and
     `may_apply`.
   - `sources[]` entries carry `kind`, `name`, `human_url`, `stale`, `stale_text`.
   - `raw_links[].href` is the relative `/api/raw/…` (the app prefixes the API origin).
   - `/api/today` always has the four regions and `sources`.
   - GET responses have `Access-Control-Allow-Origin: *`, because the app (8201) calls the Worker (8202)
     cross-origin.

## Left undone
- `app/tests/integration.spec.mjs` is written but not run: it needs sc1's Worker and `worker/tests/seed.mjs`, which
  weren't on `rig/sc1` yet. It picks through the UI with `?api=${SC_WORKER_URL}&sample=1`, then compares card
  order/status/label/reason with `/api/status`, Today's notice ids per region with `/api/today`, and a notice's
  quote, source text and raw link with `/api/notices/:id`. Lead: run it in QA after seeding the `today` scenario.

## Needs from other slices
- sc1: items 1–3 and 6 of the cross-review.

## Round 2 (lead decisions 15:10, polish): DONE
Code at `f03c7e8`, screenshots at the next commit. The lead's decisions are in API.md `5a3e86f` (§4.5, §5.4, §8.2).

**Contract decisions mirrored in the mock**
- `name_same_community_differs` with `community_text: null` now gives "The notice names this school but doesn't say
  which community." (`labels.js` `name_same_community_differs_none`, and `mayApplyText()` in `mock/engine.js`).
  Checked in Node: null community gives the new text, "Gander, NL" keeps the quoted form.
- `unmatched_in_region` is NLSchools schools only. The engine only ever set it in the NLSchools branch. Checked: the
  CSFP and private schools give 0; C. C. Loughlin gives 1 in storm.
- `/api/today` `applies_to` entries marked `may_apply` now carry `reason` in the mock. They still render as
  "May apply to:".
- Q1 (storm tests), Q2 (guard wording, `quote_check_failed`) and Q3–Q8 were accepted as built. No code change.

**Polish**
1. **Today regions.** Regions with any notice (current, unmatched or earlier) go in the grid. The grid is one column
   when only one region has notices. Regions with none share one line: "No notices: Avalon, Labrador" (hook
   `empty-regions`). Each name there is a `span` with `data-testid="region-section"` and `data-region`, so all four
   regions still have the hook; the stale spec still counts 4.
2. **Hard-edged blue rectangle.** The cause was the aurora's third glow, centred at the layer's bottom edge
   (`50% 100%`). The fixed layer is one viewport tall (900 px on desktop), so in a full-page capture the glow stopped
   in a straight line at y ≈ 900, visible wherever no card covered it. That is the hole beside Central. It is now
   centred at `50% 62%`, and every glow reaches transparent before the layer edge. The layer is still `position:
   fixed`, `pointer-events: none`, opacity 0.2. The retaken today-storm-1280 and my-storm-1280 have no edge.
3. **Compact second notice on My schools.** The headline notice (API `headline_notice_id`) is shown in full. Each
   other applying notice shows:
   - its label and icon, and the STATUS text verbatim;
   - the region line, if any;
   - a details "Show the notice's words" holding the verbatim quote and its seen line;
   - Read the notice.

   `data-notice-id`, `data-notice-status` and the `quote` hook are unchanged. The summary is a 44 px tap target, and
   the layout spec's hit-test covers it.

   New storm test: "a second applying notice is compact; its words open on tap, verbatim". It checks the mini label
   `Closed part of the day · CLOSED FOR MORNING`, that the quote is hidden, then taps the summary (`tap` on phone,
   `click` on desktop). The quote is then visible with the exact text, and the headline quote was visible without a
   tap.

**Verified at `f03c7e8`:** `npm run test:app` gives **104 passed, 4 skipped** (integration, not run as asked) on
chromium-390, chromium-1280, webkit-390 and webkit-1280.

**Negative controls, rerun at `f03c7e8`** (chromium-390 + webkit-1280, `app/tests/negative-controls.py`):

| # | Broken run | Failing line | Restored |
|---|---|---|---|
| C1 may_apply as applied | 4 failed, 12 passed | `…[data-school-id="nls-300422"]').locator('[data-testid="may-apply"][data-notice-id="nlschools-status-2024-01-10-sample-1-mock"]') Expected: visible`; Boréale `getByTestId('may-apply') Expected: 1 Received: 0` | 16 passed |
| C2 banner removed | 2 failed, 2 passed | `getByTestId('stale-banner') Expected: visible` | 4 passed |
| C3 sort broken | 2 failed, 12 passed | `storm › cards are worst first, then by name`: deep equality, Expected −1 / Received +1 | 14 passed |
| C4 guard removed | 2 failed | `[data-school-id="nls-300417"] Expected: "unknown" Received: "closed"` | 2 passed |
| C5 `.button-link` 30 px | 8 failed, 2 passed | `expectTargetsHittable` `toEqual([])` got 3 / 9 "< 44" entries | 10 passed |

**A mistake in this round, caught and fixed.**
- **What happened:** my first controls run went off before Round 2 was committed. The script restores each patched
  file with `git checkout`, so it silently reverted my uncommitted edits to `render.js`, `labels.js` and `app.css`.
  That run's numbers and the screenshots taken right after it came from a half-reverted tree. The same run also
  exposed a real test bug: the new storm test used `press` without importing it.
- **How it was caught:** the run showed 4 failures in the new test and C1/C3 "restored" runs that stayed red, and
  `git status` listed only three of my six changed files.
- **Fix:** I re-applied the three edits, fixed the import, ran the suite (104 passed), committed, then reran all five
  controls on the committed tree (table above) and retook every screenshot.
- **Guard added:** `negative-controls.py` now refuses to run while `app/` has uncommitted changes other than
  screenshots. It printed "negative-controls: commit app/ first (…)" and exited 1 on that dirty tree, so the guard
  was seen to work before it was relied on.

**Screenshots retaken (all 16) and looked at:** my-storm 390 and 1280 (compact second notices, "Show the notice's
words"), today-storm-1280 (Central and Western side by side, "No notices: Avalon, Labrador", no hard edge),
today-quiet-390 ("No notices: Avalon, Central, Western, Labrador" under the empty card). Nothing else looked wrong.

**Not done, as asked:** the integration spec was not run.
