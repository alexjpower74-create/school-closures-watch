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

## Rounds
- Round 1: sc1 steps 1–7 (b76085a), sc2 screens + mock + Playwright (f3bf596). Both merged into main (de28cd9, 6c221e8).
- Round 2 (running): sc1 old-list guard, region phrase first, two regions → district, wording fixes, Worker fields for
  the app, QA port env. sc2 Today layout at 1280 (empty regions compact, hard-edged aurora block), compact secondary
  notices on phone cards.
