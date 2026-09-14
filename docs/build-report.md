# School Closures Watch — build report (lead)

Draft, written as each round lands. Final numbers come from the last pinned QA run and replace the "so far" table.

## QA runs so far (each pinned with `rig qa --ref <sha>`, QA ports 8206–8209)

| When | sha | What | Result |
|---|---|---|---|
| 14:45 | f08b765 | sc1 foundations, core | 57/57 |
| 15:15 | f3bf596 | sc2 round 1, app (chromium + webkit, 390 + 1280, mock) | 100 passed, 4 skipped (integration spec needs a Worker), EXIT=0 |
| 15:25 | b76085a | sc1 steps 1–7, core + Worker | core 85/85 (EXIT=0), Worker phase 1 1/1 + phase 2 19/19 (EXIT=0) |
| 15:38 | d8ec2ee | main after merging sc1 + sc2 round 1: integration (real local Worker on 8208 seeded with `today`, `storm`, `stale`; sc2's integration spec on chromium-390 + webkit-1280) | each scenario 2 passed, 2 skipped (other projects by design), EXIT=0 |

## Lead negative controls

| # | What I broke (in the QA worktree, restored with `git checkout`) | Expected | Result |
|---|---|---|---|
| L1 | `app/labels.js`: `closed` label → "Closed (broken)" | integration red | **Stayed green (EXIT=0). The control was aimed wrong, not the check:** on the real-API path the card renders the API's own `label` (`render.js:149`, `statusLabel(st.status, st.label)`), so `app/labels.js` only feeds the mock. Recorded so nobody reads the green as coverage of the app's label table (the mock specs cover that). |
| L2 | `app/api.js`: never send `include_sample=1` | integration red: the app sees the non-sample view while the spec reads the API with samples | **Red in all 3 scenarios × 2 projects** (`expect(received).toEqual(expected)`, card order: Expected −2 / Received +2). Restored, green again at d8ec2ee. |

## Cross-slice defects found (every one crossed a slice boundary)
- **sc2 → sc1:** `core/status.js` didn't yet ignore notices from an older list, so a Friday closure would still close
  the school on Monday (the lead's 14:55 rule). Also: empty community gave `""` in a reason, `unmatched_in_region`
  counted for CSFP schools, and one stale wording wasn't fixed.
- **Lead → sc1 (code read of f08b765):** the same old-list gap. Also the region phrase was checked only after the
  similar-name rule (no real collision on today's 249 schools: 22 region wordings tested, all fall through
  correctly, but it's fixed by order).
- **sc1 → contract:** §3.3 CSFP `source_text` (title + description) could never verify; empty notes cell would drop a
  real closure. Both fixed in the contract.
- **sc1 self-found (control G):** both 1.1 s spacing tests compared gaps to the imported constant, so setting it to 0
  still passed. Now a literal 1100.

## sc2 round 2 (done 15:13, bff3486)
- Today at 1280: regions with notices in the grid, empty ones on one line ("No notices: Avalon, Labrador"); the
  hard-edged blue block was the aurora's third glow centred on the fixed layer's bottom edge (a straight line at
  y ≈ 900 in full-page shots), now faded before the edge. My schools at 390: second applying notices compact, their
  words behind "Show the notice's words" (new storm test taps it open and checks the verbatim quote).
- sc2's own numbers at f03c7e8: 104 passed, 4 skipped; all five controls red → green again.
- **Mistake caught by sc2:** its first controls run started before round 2 was committed, and the script's
  `git checkout` restore silently reverted three uncommitted files. Caught because "restored" runs stayed red and
  `git status` showed 3 of 6 files. Re-applied, committed, reran; `negative-controls.py` now refuses a dirty `app/`
  (seen to refuse once before relying on it).
- Lead looked at the retaken today-storm-1280 and my-storm-390: both fixes visible, nothing else wrong.

## sc1 round 2 (code 734de73, lead read before merge)
- `core/notice.js`: a same-name match wins; otherwise the region phrase is checked before similar names (§4.2 3a);
  two different regions named → `district`.
- `core/status.js`: `isOldList` filters old-list notices out of a school's own, region, province and unmatched counts;
  empty-community and NLSchools-only unmatched wording/counts per the 15:10 decisions.
- `worker/src/index.js` `/api/today`: old-list rows aren't current and are listed under `earlier`; `applies_to`
  carries `reason`.

- sc1's own numbers on the QA ports (7cb9f09): core 90/90, Worker phase 1 1/1 + phase 2 22/22.
- Round-2 controls (all red, then green again): A exact-name-only (core 9 of 60, Worker 3 of 22); OL old-list guard
  removed (core 1, Worker 2); R3a region check moved back after similarity (core 1); AMB two regions not → district
  (core 1). Round-1 controls B–H cover code round 2 didn't touch.
- Two existing tests changed because the rules changed, not to go green: Glovertown on Tuesday under an old Monday
  list is now `unknown`/`list_date_old` (was `closed`); the storm notices-map test pins the seed's exact 9 references.
- `npm run demo` run once by sc1 at 15:14 NDT: migrations, Worker on 8202, one forced live scan (nlschools-status ok,
  list 2026-09-14, 2 notices; nlschools-notices ok, 0; csfp-news ok, 0), `--watch` skipped everything as not due,
  Ctrl-C freed 8202.

## Merges
- de28cd9 sc1 steps 1–7 (b76085a) · 6c221e8 sc2 round 1 (f3bf596) · 2ab80b5 sc2 round 2 (bff3486: pinned QA
  104 passed, 4 skipped, EXIT=0; the merge changed 24 files, all `app/**` + sc2's report, no deletions).

## Rounds
- Round 1: sc1 steps 1–7 (b76085a), sc2 screens + mock + Playwright (f3bf596). Both merged into main (de28cd9, 6c221e8).
- Round 2 (running): sc1 old-list guard, region phrase first, two regions → district, wording fixes, Worker fields for
  the app, QA port env. sc2 Today layout at 1280 (empty regions compact, hard-edged aurora block), compact secondary
  notices on phone cards.
