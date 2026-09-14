# School Closures Watch — API and data contract

Owner: the lead. Slices build against this file. If it is wrong or missing something, write it under
**Contract questions** at the top of your build report and carry on with the most sensible reading. Don't quietly
diverge. Source evidence is in `DECISIONS.md`; the real saved files are in `data/samples/` (read-only for slices).

## 0. Words that matter

- **Source**: one registry entry (§2). Kinds: `used`, `link_only`, `not_used`. Link only and Not used sources are
  **never fetched**.
- **Raw copy**: the exact response body of one request, saved as fetched. `raw_ref` names it:
  `<source_id>/<fetched_at with : and . replaced by ->-<name>.<ext>`, e.g.
  `nlschools-status/2026-09-14T16-40-05-000Z-schoolstatus.html`. Node caches raw copies at `data/sources/<raw_ref>`
  (gitignored); the Worker keeps the last 3 per source in D1 plus any raw copy a current notice still points at.
- **Text extraction** (identical in core, Worker and app; `core/text.js`):
  - `normText(s)`: replace every run of whitespace (including U+00A0) with one space, then trim.
  - `decodeEntities(s)`: named `&amp; &lt; &gt; &quot; &apos; &nbsp; &ndash; &mdash; &lsquo; &rsquo; &ldquo; &rdquo;
    &hellip; &eacute; &egrave; &agrave; &ecirc; &ccedil; &ocirc; &icirc; &laquo; &raquo;` plus numeric `&#NNN;` /
    `&#xHH;`. Unknown named entities stay as they are.
  - `extractText(body)` for html and xml: remove `<script…>…</script>`, `<style…>…</style>` and `<!-- … -->`; unwrap
    `<![CDATA[ … ]]>` (keep the inside); replace every tag `<…>` with one space; `decodeEntities` **twice**; `normText`.
- **Verbatim field**: `school_text`, `community_text`, `family_text`, `region_text`, `status_text`, `title`, `quote`,
  `source_text`, `posted_text`, `list_date_text`, `open_rule_quote`, `scope_evidence`, `status_evidence` (when
  `status_basis` is `phrase`). Each one is copied from one place in the source, never composed from two places.
- **Verified**: a verbatim value `v` is verified when `normText(v).length >= 2` and
  `extractText(raw.body).includes(normText(v))` for a raw copy in the notice's `raw_refs`. `quote` must also satisfy
  `normText(source_text).includes(normText(quote))`.
  - `quote` or `source_text` fails → the **notice is dropped** (counted in `quotes_dropped`).
  - `school_text` fails on a `school_row` → dropped.
  - any other verbatim field fails → that field becomes `null` (and `status` falls back per §4.1; `scope` falls back to
    `district` if `scope_evidence` fails).
  - The check runs in core (`runScan`), again in the Worker at ingest (against the raw bodies in the payload), and in
    the app before rendering (`quote` ⊆ `source_text`). Each has its own negative control.
- **SAMPLE**: test/demo rows, `sample: true`. The API hides them unless `include_sample=1`. Invented rows (app mock,
  Worker tests, core fixtures) have invented text starting `SAMPLE ` (e.g. school_text `SAMPLE All Central Region
  Schools`, note `SAMPLE Closed due to storm`). Replays of the real files in `data/samples/` are `sample: true` but keep
  verbatim text.
- **Times**: every `*_at` value is an ISO 8601 UTC string (`2026-09-14T16:40:05.000Z`) or `null`. The app shows times
  in `America/St_Johns` ("6:42 AM"). Core does not rely on `Intl` time zones: `core/time.js` implements Newfoundland
  time (NST UTC−3:30; NDT UTC−2:30 from the second Sunday in March 02:00 local to the first Sunday in November 02:00
  local). `localDate(now)` → `"2026-09-14"`, `localParts(now)` → `{y,m,d,hh,mm,weekday}` (weekday 0 = Sunday).
  (sc1 may start from `~/Projects/Road Watch/core/time.js`, `text.js`, `verify.js`; read-only copy, re-test here.)
- **Our day**: `today_local = localDate(now)`.

## 1. Ports, processes, env

| What | Slice / dev | QA worktree |
|---|---|---|
| App `node app/serve.mjs --port N` | 8201 (sc2) | 8209 |
| Worker `wrangler dev --local --port N` | 8202 (sc1) | 8208 |
| Fixture server for core scan tests (`SC_FIXTURE_PORT`) | 8203 (sc1) | 8207 |
| Fixture server for Worker scan tests (`SC_WORKER_FIXTURE_PORT`) | 8204 (sc1) | 8206 |

- App: `<meta name="api-base" content="http://127.0.0.1:8202">`, overridden by `?api=<origin>`. `?mock=1` swaps in
  `app/api.mock.js` (no network). `?scenario=<name>` picks a mock scenario (§8.4). `?now=<ISO>` fixes the app clock
  and is passed to the API as `now`. `?sample=1` adds `include_sample=1`.
- Worker env: `ADMIN_TOKEN` (secret), `SOURCE_ORIGIN_MAP` (JSON `{"https://www.nlschools.ca":"http://127.0.0.1:8204",
  "https://csfp.nl.ca":"http://127.0.0.1:8204"}`; empty = real origins), `ALLOW_FAKE_NOW` (`"1"` lets requests honour
  `?now=`; tests only). `worker/.dev.vars.example`: `ADMIN_TOKEN=local-dev-token`, `ALLOW_FAKE_NOW=0`.
- `scripts/scan.mjs` reads `SC_WORKER_URL` (default `http://127.0.0.1:8202`), `SC_ADMIN_TOKEN` (default: from
  `worker/.dev.vars`, else `local-dev-token`). Flags: `--dry` (no POST; writes `data/scan-latest.json`), `--only <id>`,
  `--force` (ignore the schedule, scan every used source now), `--watch` (keep running; every minute run whatever
  §6 says is due), `--now <ISO>` (tests).
- `scripts/demo.mjs` (`npm run demo`): applies local D1 migrations, starts the Worker on 8202 and the app on 8201,
  runs one forced scan, then `--watch`. Ctrl-C stops all children. Prints the URL to open.

## 2. Registry (`core/sources/registry.js`, mirrored to `data/sources.json` by every scan)

```jsonc
{
  "id": "nlschools-status",
  "name": "NLSchools School Status Report",
  "publisher": "NLSchools (Department of Education, Education Operations Branch)",
  "kind": "used",                        // used | link_only | not_used
  "covers": "NLSchools schools",         // plain English
  "human_url": "https://www.nlschools.ca/schools/statusreport.jsp",
  "fetch_urls": ["https://www.nlschools.ca/schools/statusreport.jsp",
                 "https://www.nlschools.ca/schools/generated/schoolstatus.html"],
  "format": "html",
  "terms_url": "https://www.nlschools.ca/termsofuse.jsp",
  "terms_quote": "The contents, but not any logo or other visual representation, of the NLSchools' website or related website may be used and reproduced solely for non-commercial, personal or educational purposes provided that it is not modified and that you do not delete any copyrights and other legal or proprietary notices contained therein.",
  "robots_note": "robots.txt is a 404 page (no rules)",
  "reason": null,                        // plain English for link_only / not_used
  "attribution": "Source: NLSchools School Status Report"
}
```

| id | kind | fetch (in this order, ≥ 1.1 s apart per host) |
|---|---|---|
| `nlschools-status` | used | `https://www.nlschools.ca/schools/statusreport.jsp` then `https://www.nlschools.ca/schools/generated/schoolstatus.html` |
| `nlschools-notices` | used | `https://www.nlschools.ca/about/generated/newspostings_5.html` (fetched in the same pass, after the two above) |
| `csfp-news` | used | `https://csfp.nl.ca/feed/` |
| `nlschools-busplanner` | link_only | human_url `https://nlschools.mybusplanner.ca/` — "Bus delays and cancellations aren't published publicly; the Parent Portal needs a login." |
| `nlschools-social` | link_only | human_url `https://twitter.com/NLSchoolsCA` (also `https://www.facebook.com/NLSCHOOLSCA`) — "Social posts need a login to read reliably; we don't copy them." |
| `nlschools-weather-protocol` | link_only | human_url `https://www.nlschools.ca/schools/weatherprotocol.jsp` — "How NLSchools decides closures (announced 6:30–7:00 a.m.)." |
| `csfp-transport` | link_only | human_url `https://csfp.nl.ca/transport-scolaire/` — "CSFP principals decide closures and tell families directly." |
| `radio-aggregators` | not_used | – "Not an official source." |

`csfp-news` `terms_quote` is `null` ("No terms of use found on csfp.nl.ca"). `nlschools-notices` shares
`nlschools-status`'s terms. Coverage quotes (shown on the sources page and in Unknown reasons, verbatim, verified by
sc1 tests against `data/samples/`):
- `NLS_OPEN_RULE`: "If your school is not listed below, the status is normal and open as usual."
  (`nlschools/statusreport-2026-09-14T1408NDT.html`; re-verified from the live page every scan, §4.5)
- `CSFP_RULE`: "C’est également à la direction que revient la décision de fermer l’école lorsque les conditions
  atmosphériques sont mauvaises et de prendre tous les moyens possibles pour en informer les élèves, leurs parents ou
  leurs tuteurs le plus rapidement possible." (`csfp/transport-scolaire-2026-09-14.html`)

## 3. Adapters (`core/sources/*.js`)

Each adapter is `{ id, due(now, health), fetchPlan(now) → [{url, name, format}], parse(raws, ctx) → ParseResult }`.
`ctx = { now, schools }`. `ParseResult = { result: "ok"|"format_changed", error, list_date, list_date_text,
open_rule_quote, notices: [Notice…] }` (Notice §5.1 without `first_seen_at`, `last_seen_at`, `removed_at`).
A network or HTTP error is `result: "error"` from the pipeline, never from `parse`.

### 3.1 `nlschools-status`
Page (`statusreport.jsp`):
- `list_date_text`: the text right after `Real-time school closure information for:` matching
  `(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), (January|…|December) \d{1,2}, \d{4}` → e.g.
  `"Monday, September 14, 2026"`; `list_date` `"2026-09-14"`. Missing → both `null` (not an error).
- `open_rule_quote`: `NLS_OPEN_RULE` if `extractText(page)` contains it, else `null`.

Fragment (`generated/schoolstatus.html`):
- No `id='schoolStatusTable'` (either quote style) → `result: "format_changed"`, 0 notices.
- Each `<tr id=…>` inside `<tbody>` is one row. `row_id` = the id attribute value without quotes.
- Cells, in order: (1) `school_text` = extractText of the first `<span>`; `community_text` = extractText of what
  follows the first `<br/>` in the cell (e.g. `"Corner Brook, NL"`), `null` if empty. (2) `status_class` = the cell's
  class token (first token found in §4.1, else the first token); `status_text` = extractText(cell), e.g.
  `"CLOSED ALL DAY"`. (3) `quote` = extractText(cell), e.g. `"School closed all day NOTE: Water Shut Off"`; when this
  cell is empty, `quote` = `status_text` (still verbatim, one place) so a real closure isn't dropped (lead 15:20).
  (4) `family_text` e.g. `"FOS 05"`. (5) `region_text` e.g. `"CENTRAL"`.
- `source_text` = extractText(row). `kind: "school_row"`, `link` = human_url, `raw_refs` = [page, fragment].
- Row with fewer than 5 cells → skipped and counted in `rows_skipped` (not format_changed unless every row fails).
- `status` from §4.1; `scope`/`matches` from §4.2–4.4.
- **Expected on real files** (read in place from `data/samples/`):
  - `nlschools/schoolstatus-2026-09-14T1640Z.html` + `nlschools/statusreport-2026-09-14T1408NDT.html` → 2 notices;
    `list_date "2026-09-14"`; `open_rule_quote` set.
    - Glovertown Academy / "Glovertown, NL" / `closedAllDay` / "CLOSED ALL DAY" → `status "closed"`, quote
      "School closed all day NOTE: Water Shut Off", family "FOS 05", region "CENTRAL", matches
      `[{school_id: <Glovertown Academy's id>, how: "exact"}]`.
    - Eastside Elementary / "Corner Brook, NL" / `otherStatus` / "OTHER STATUS" → `status "other"`, quote starts
      "Other NOTE: Due to a water main break at the bottom of Massey Dr", exact match. **Never** `buses_delayed`
      (the class says other; the note's words don't change the status).
  - `wayback/schoolstatus-20240110005921.html` → 3: Bay d'Espoir Academy (St. Alban's) `closedForMorning` →
    `closed_part`; Bishop White School (Port Rexton) `delayedOpening` → `delayed`; St. Mark's School (King's Cove)
    `delayedOpening` → `delayed`. All exact.
  - `wayback/schoolstatus-20240117055404.html` → Eastside Elementary `closedForPD` → `closed`.
  - `wayback/schoolstatus-20250731230821.html` → Upper Gullies Elementary (Conception Bay South) `closingEarly` →
    `early_dismissal`.
  - The wayback files have no page: test them with `list_date` supplied by the test.

### 3.2 `nlschools-notices`
- `extractText(body)` empty (the body is only the `importantNoticeBox` hide script) → ok, 0 notices. Real files:
  `nlschools/newspostings_5-2026-09-14-empty.html`, `wayback/np5-*.html` → 0.
- Otherwise one notice per `<a …>…</a>` whose text is ≥ 3 chars (`title` = link text, `link` = absolute href), or,
  when there are no links, one notice for the whole text. `quote` = `title` when a link exists, else the first 600
  characters of the text cut back to a word boundary (still a substring). `source_text` = extractText(body), cut at
  6000 chars on a word boundary. `kind: "text_notice"`, `row_id` = fnv1a8(normText(quote)).
- `status` from §4.3 (phrases), scope from §4.4 (region phrase → `region`/`province`, else `district`).

### 3.3 `csfp-news`
- RSS `<item>`: `title`, `link`, `pubDate`, `description` (CDATA), `guid`. Keep only items with `pubDate` within 36 h
  before `now` (and not more than 1 h in the future) **and** a closure word (§4.3 `CSFP_WORDS`) in title or
  description text.
- `quote` = title; `source_text` = extractText of the whole `<item>…</item>` cut at 6000 (lead 15:20, from sc1: title +
  description is never one contiguous place in the raw feed); `posted_at` from pubDate;
  `posted_text` = pubDate verbatim; `kind: "feed_post"`; `row_id` = fnv1a8(guid); `status: "may_apply"`,
  `status_basis: "none"`.
- `scope: "board"`, matches: CSFP schools whose short name (§4.2 `CSFP_SHORT`) appears in the text →
  `{how: "may_apply", reason: "board_feed_names_school"}`; none named → every CSFP school with
  `reason: "board_feed_no_school_named"`. Feed posts are **never** exact.
- Real file `csfp/feed-2026-09-14.xml` with `now = 2026-09-14T18:00:00Z` → 0 notices (no recent post). A SAMPLE
  fixture item "SAMPLE École Boréale fermée aujourd'hui en raison de la tempête" dated 2 h before `now` → 1 notice,
  may_apply to École Boréale only.

## 4. Rules

### 4.1 Status codes (fixed)

| code | label on screen | rank | from NLSchools class | from STATUS text (only when class unknown) |
|---|---|---|---|---|
| `closed` | Closed | 1 | `closedAllDay`, `closedForPD`, `closedForHoliday` | starts `CLOSED ALL DAY`, `CLOSED FOR PD`, `CLOSED FOR HOLIDAY` |
| `closed_part` | Closed part of the day | 2 | `closedForMorning`, `closedForAfternoon` | `CLOSED FOR MORNING`, `CLOSED FOR AFTERNOON` |
| `buses_cancelled` | Buses cancelled | 3 | – | contains `BUS` and (`CANCELLED` or `CANCELED`) |
| `early_dismissal` | Closing early | 4 | `closingEarly` | `CLOSING EARLY`, `EARLY DISMISSAL` |
| `delayed` | Delayed opening | 5 | `delayedOpening` | `DELAYED OPENING` |
| `buses_delayed` | Buses delayed | 6 | `busDelayed` | contains `BUS` and `DELAY` |
| `other` | Other notice, read it | 7 | `otherStatus`, or any class/text not in this table | – |
| `may_apply` | A notice may apply | 8 | – | – |
| `unknown` | Unknown | 9 | – | – |
| `open` | Open, no notice | 10 | – | – |

`status_basis`: `class`, `status_text`, `phrase` or `none`; `status_evidence` = the class name, the status text, or the
matched phrase (verbatim substring of `quote`). A class not in the table → `status "other"`, and the source health gets
`unmapped_classes: ["…"]` so the lead sees it.
(Lead answer 14:50: "only when class unknown" = class missing or not in the table. A class in the table decides; else
the STATUS text rules; else `other`. A class not in the table always goes into `unmapped_classes`, even when the STATUS
text gave a status.)

### 4.2 School matching (`core/match.js`)
- `normName(s)`: NFKD, drop combining marks, lowercase, `&` → ` and `, delete `'` `’` `‘`, every other
  non-alphanumeric run → one space, trim. (`"St. Mark's School"` → `"st marks school"`.)
- `normCommunity(s)`: remove a trailing `, NL` / ` NL` (any case) and trailing commas, then `normName`.
  (`"St.John's"` and `"St. John's, NL"` → `"st johns"`.)
- For `nlschools-status` rows, candidates are NLSchools schools only.
  1. **Exact**: exactly one school with `normName(name) == normName(school_text)` AND
     `normCommunity(community) == normCommunity(community_text)` → `{how: "exact"}`.
  2. Same normalised name, community differs or missing → `may_apply`, reason `name_same_community_differs`.
  3. Same normalised name on more than one school and community doesn't single one out → each `may_apply`, reason
     `name_shared`.
  3a. **Region phrase before similarity** (lead fix 14:55): no same-name school and `school_text` contains a §4.4
     region or province phrase → `scope: "region"`/`"province"`, `matches: []`. A row "All schools in the Central
     region" must never become "may apply" to a school whose name words happen to be a subset.
  4. Otherwise, similar names: `STOP = {school, academy, elementary, primary, high, collegiate, all, grade, the, of,
     and, st, saint, memorial, regional, junior, senior, intermediate, middle, centre, center, k, 12, nl}`;
     `key(s) = tokens(normName(s)) − STOP`. A school is a candidate when `key(row)` is non-empty and
     `key(row) ⊆ key(school)` or `key(school) ⊆ key(row)` (school key non-empty), or when the communities are equal and
     the keys share a token. 1–5 candidates → each `may_apply`, reason `name_similar`. More than 5 → no matches,
     `unmatched_reason: "too_many"`. None → `unmatched_reason: "no_school"`.
- `CSFP_SHORT` (for `csfp-news`, accent- and case-insensitive on normName; a single `l` or `d` elided onto the start
  of the short name counts, since normName deletes apostrophes: `lenvol` matches `envol`): `boreale` → École Boréale, `envol` → École
  l'ENVOL, `notre dame du cap` → École Notre-Dame-du-Cap, `sainte anne` → École Sainte-Anne, `rocher du nord` → École
  Rocher-du-Nord, `grands vents` → École des Grands-Vents.
- **Negative control required** (sc1 core, sc2 app): make matching exact-name-only (drop rules 2–4) and watch the
  "may apply" tests go red.

### 4.3 Phrase tables (text notices only; `core/labels.js`)
Matched on `normName(quote)` as whole-word sequences, longest phrase first, each match blanks its span:
- `closed_part`: `closed for the morning`, `closed this morning`, `closed for morning`, `closed for the afternoon`,
  `closed this afternoon`, `closed for afternoon`
- `early_dismissal`: `closing early`, `early dismissal`, `dismissed early`, `dismissing early`, `will close early`
- `buses_cancelled`: `buses cancelled`, `buses canceled`, `bus cancelled`, `bus canceled`, `busing cancelled`,
  `busing canceled`, `no busing`, `buses will not run`, `bus service cancelled`
- `buses_delayed`: `buses delayed`, `buses will be delayed`, `bus delayed`, `runs will be delayed`
- `delayed`: `delayed opening`, `delayed start`, `will open late`, `opening late`
- `closed`: `closed all day`, `closed for the day`, `closed today`, `will be closed`, `are closed`, `is closed`,
  `remain closed`
- One distinct code matched → that code (`status_basis: "phrase"`). None, or more than one distinct code → `other`.
- `CSFP_WORDS` (selects feed posts only, never a status): `ferme`, `fermee`, `fermees`, `fermes`, `fermeture`,
  `ouverture retardee`, `retard`, `annule`, `annulee`, `annulation`, `intemperies`, `tempete`, `closed`, `closure`,
  `delayed`, `cancelled`.

### 4.4 Whole-region notices
`REGION_PHRASES` with `{R}` ∈ Avalon, Central, Western, Labrador (matched on normName, whole words):
`all schools in the {R} region`, `all schools in {R} region`, `all {R} region schools`, `all {R} schools`,
`{R} region schools`, `schools in the {R} region`. Province: `all nlschools schools`, `all schools in the province`,
`all schools province wide`.
- A text notice (or a status row with no exact/may_apply match) whose text contains a region phrase →
  `scope: "region"`, `scope_region: "central"`, `scope_evidence` = the matched words **as they appear in the source**
  (verbatim substring). A province phrase → `scope: "province"`. It applies to every **NLSchools** school in that
  region (CSFP and others excluded), and says so on screen: "This notice names the whole Central region."
- A status row with an exact or may_apply match is `scope: "school"` even if its note mentions a region.
- For status rows the region check reads `school_text` only (never the note); for text notices it reads `quote` only
  (never the rest of the box). (Lead answer 14:50.)
- **More than one distinct region named** (e.g. "all Central schools and all Western schools") → `scope: "district"`,
  shown to everyone as an NLSchools notice and applied to no school. We don't guess which regions a sentence covers.
  (Lead answer 14:50.)
- Text notice with no region phrase → `scope: "district"`: shown at the top of My schools and Today as
  "NLSchools notice", attached to no school status.
- Status row with no match and no region phrase → `scope: "unmatched"`: listed on Today under its `region_text`
  ("Not matched to a school in the provincial list") and counted on My schools for users with a school in that
  region ("1 notice in the Central region couldn't be matched to a school").

### 4.5 School status (`core/status.js`, computed per request)
Input: school, current (not removed) notices, source health, `now`.
**Old lists never set today's status** (lead fix 14:55): a notice with `list_date !== null && list_date < today_local`
is ignored by §4.5 (it can't make a school Closed, Delayed or "may apply" today); `/api/today` lists it under
`earlier`. Notices with `list_date: null` (CSFP feed posts) are bounded by the 36 h window instead. Test: a
2026-09-11 `closed` exact notice, `now` Monday 2026-09-14 07:00 NDT, healthy source with today's list → the school is
`open`, not `closed`.
- NLSchools school:
  - `applies` = notices with an exact match to the school + current `region` notices for its region + `province`
    notices. `may` = notices with a `may_apply` match to it.
  - `nlschools-status` stale (§6): `applies` non-empty → status = worst rank in `applies`, `stale: true`;
    else `unknown`, reason `stale`.
  - healthy: `applies` non-empty → worst rank in `applies`; else `may` non-empty → `may_apply`; else `open` **only if**
    `list_date >= today_local` and `open_rule_quote` is set; otherwise `unknown` with reason `list_date_old`,
    `list_date_missing` or `open_rule_missing`.
  - `as_of` = `nlschools-status.last_ok_at`.
- CSFP school: `may` from `csfp-news` → `may_apply`; else `unknown`, reason `csfp_no_online_status`. `as_of` =
  `csfp-news.last_ok_at`.
- Private / Indigenous / Other: `unknown`, reason `no_official_source`, `as_of: null`.
- `reason_text` (fixed):
  - `stale`: "We couldn't check NLSchools since {time}. Check nlschools.ca or call the school." When NLSchools was
    never checked: "We haven't been able to check NLSchools yet. Check nlschools.ca or call the school."
  - `list_date_old`: "The NLSchools list is still showing {list_date_text}."
  - `list_date_missing`: "We couldn't read which day the NLSchools list is for."
  - `open_rule_missing`: "The NLSchools page no longer says unlisted schools are open, so we can't say this school is open."
  - `csfp_no_online_status`: "CSFP schools don't post closures online. The school tells families directly."
  - `no_official_source`: "This school has no official online closure list. Call the school."
- Sorting on My schools: rank ascending, then school name.

## 5. Records

### 5.1 Notice
```jsonc
{
  "id": "nlschools-status-2026-09-14-468-1a2b3c4d",  // `${source_id}-${list_date ?? localDate(first scan)}-${row_id}-${fnv1a8(status_class|status_text|quote)}`
  "source_id": "nlschools-status",
  "sample": false,
  "kind": "school_row",            // school_row | text_notice | feed_post
  "list_date": "2026-09-14",       // null for csfp-news
  "list_date_text": "Monday, September 14, 2026",
  "row_id": "468",
  "school_text": "Glovertown Academy",
  "community_text": "Glovertown, NL",
  "family_text": "FOS 05",
  "region_text": "CENTRAL",
  "status_class": "closedAllDay",
  "status_text": "CLOSED ALL DAY",
  "status": "closed",
  "status_basis": "class",
  "status_evidence": "closedAllDay",
  "title": null,
  "quote": "School closed all day NOTE: Water Shut Off",
  "source_text": "Glovertown Academy Glovertown, NL CLOSED ALL DAY School closed all day NOTE: Water Shut Off FOS 05 CENTRAL",
  "posted_at": null, "posted_text": null,       // NLSchools gives no posted time
  "first_seen_at": "2026-09-14T16:40:05.000Z",  // Worker-set
  "last_seen_at": "2026-09-14T16:40:05.000Z",   // Worker-set
  "removed_at": null,                            // Worker-set when a later ok scan no longer lists it
  "scope": "school",               // school | region | province | board | district | unmatched
  "scope_region": null,            // avalon | central | western | labrador (scope region only)
  "scope_evidence": null,
  "unmatched_reason": null,        // no_school | too_many
  "matches": [ { "school_id": "nls-…", "how": "exact", "reason": null } ],   // how: exact | may_apply
  "link": "https://www.nlschools.ca/schools/statusreport.jsp",
  "raw_refs": ["nlschools-status/2026-09-14T16-40-05-000Z-statusreport.html", "nlschools-status/2026-09-14T16-40-05-000Z-schoolstatus.html"]
}
```
`fnv1a8` = FNV-1a 32-bit over UTF-8 bytes, 8 lowercase hex digits (`core/text.js`).

### 5.2 Source health
```jsonc
{
  "id": "nlschools-status", "name": "NLSchools School Status Report", "kind": "used", "human_url": "…",
  "last_attempt_at": "…", "last_ok_at": "…",
  "last_result": "ok",             // ok | error | format_changed | never
  "last_error": null,              // "HTTP 503", "timeout", "table not found" (plain, no secrets)
  "list_date": "2026-09-14", "list_date_text": "Monday, September 14, 2026",
  "open_rule_quote": "If your school is not listed below, the status is normal and open as usual.",
  "notices_current": 2, "rows_skipped": 0, "quotes_dropped": 0, "unmapped_classes": [],
  "stale": false, "stale_reason": null,   // never_checked | last_attempt_failed | overdue
  "stale_text": null,              // fixed, core/schedule.js staleText (lead answer 14:50):
                                   // last_attempt_failed: "We couldn't reach the NLSchools list at 6:40 AM. Statuses below are from 6:35 AM."
                                   //   ("couldn't read" when format_changed; "Statuses below are from" omitted if never ok)
                                   // overdue: "We haven't been able to check the NLSchools list since 6:35 AM."
                                   // never_checked: "We haven't checked the NLSchools list yet."
                                   //   (never ok but an attempt failed: "We couldn't reach the NLSchools list at 6:40 AM. We haven't had a good check yet.")
                                   // csfp-news uses "the CSFP news feed" in place of "the NLSchools list"
  "next_due_at": "…", "interval_minutes_now": 5
}
```

### 5.3 School (from `data/schools.json`, served by `GET /api/schools`)
`{ id, name, community, region, region_name, board, coverage, type_code, grades_text, phone, operator?, source_id,
source_url }` — `coverage`: `nlschools` | `csfp` | `none`. `core/schools-data.js` is generated from
`data/schools.json` by `scripts/gen-schools.mjs` (a test checks they are equal). Only the lead edits the JSON.

### 5.4 School status
```jsonc
{
  "school": { /* §5.3 */ },
  "status": "closed", "label": "Closed", "rank": 1,
  "source_status_text": "CLOSED ALL DAY",      // from the headline notice, verbatim; null for open/unknown/may_apply
  "headline_notice_id": "nlschools-status-…", // worst applying notice, or first may_apply notice, or null
  "applies": [ { "notice_id": "…", "how": "exact" } ],     // how: exact | region | province
  "may_apply": [ { "notice_id": "…", "reason": "name_similar", "reason_text": "The notice names a similar school: \"Glovertown\"." } ],
  "reason": null, "reason_text": null,
  "as_of": "2026-09-14T16:40:05.000Z", "stale": false,
  "list_date_text": "Monday, September 14, 2026",
  "unmatched_in_region": 0
}
```
`unmatched_in_region` counts unmatched `nlschools-status` rows in the school's region **for NLSchools schools only**
(0 for CSFP and others; those rows are NLSchools rows). (Lead 15:10.)

`may_apply` `reason_text` (fixed): `name_same_community_differs` "The notice names this school but a different
community: \"{community_text}\"." — when `community_text` is null: "The notice names this school but doesn't say which
community." (lead 15:10); `name_shared` "More than one school has this name."; `name_similar` "The notice names
a similar school: \"{school_text}\"."; `board_feed_names_school` "A CSFP news post mentions this school.";
`board_feed_no_school_named` "A CSFP news post mentions a closure but no school."

### 5.5 Ingest payload (`POST /api/admin/ingest`)
```jsonc
{
  "source_id": "nlschools-status", "trigger": "npm-scan",   // npm-scan | cron | admin
  "started_at": "…", "finished_at": "…",
  "result": "ok", "error": null, "http_status": 200,
  "raws": [ { "raw_ref": "…", "url": "…", "fetched_at": "…", "format": "html", "body": "…" } ],
  "list_date": "2026-09-14", "list_date_text": "…", "open_rule_quote": "…",
  "rows_skipped": 0, "unmapped_classes": [],
  "notices": [ /* Notice without first_seen_at/last_seen_at/removed_at */ ],
  "sample": false
}
```
Worker at ingest: re-verify every notice (§0) against `raws`; **re-derive** `status`, `scope` and `matches` from the
verified fields with its own school list (a payload can't bring its own `how: "exact"`; lead answer 14:50); upsert by `id` (keep `first_seen_at`, set
`last_seen_at`); every current notice of this source (same `sample` flag) not in the payload gets `removed_at = now`
when `result` is ok. `error`/`format_changed` → only health changes, notices stay as they were (shown as stale).
`nlschools-status` and `nlschools-notices` come in as two payloads from the same pass.

## 6. Schedule and staleness (`core/schedule.js`)
- Busy windows, Newfoundland local time, Monday–Friday: 05:00–08:59 and 11:00–12:59.
- `intervalMinutes(source, now)`: `nlschools-status` and `nlschools-notices` 5 in a busy window, else 60;
  `csfp-news` 15 in a busy window, else 60.
- `nextDue(source, t)` = the earlier of `t + intervalMinutes(source, t)` and the start of the next busy window after
  `t`.
- `isDue(source, now, health)`: never attempted, or `now >= nextDue(source, last_attempt_at) − 30 s`.
- `staleness(source, now, health)`: `never_checked` (no `last_ok_at`); `last_attempt_failed` (last attempt not ok);
  `overdue` (`now > nextDue(source, last_ok_at) + 10 min`); else not stale.
- Worker `wrangler.toml` `[triggers] crons = ["*/5 * * * *"]`; `scheduled()` runs `runScan` for due sources.
  `scripts/scan.mjs --watch` checks every 60 s with the same functions.
- Worked examples (tests): Mon 2026-09-14 06:40 NDT last ok → next due 06:45, stale after 06:55. Mon 04:02 NDT last ok
  → next due 05:00, stale after 05:10. Mon 14:00 NDT last ok → next due 15:00. Sat 06:40 → 60-minute interval.
  A date in January uses NST.

## 7. Worker HTTP API (`worker/src/index.js`) + D1

All responses JSON (`content-type: application/json; charset=utf-8`) except `/api/raw/*`. GET responses carry
`Access-Control-Allow-Origin: *` and `Cache-Control: no-store`. Errors: `{ "error": "not_found", "message": "…" }`.
GET endpoints accept `now=<ISO>` when `ALLOW_FAKE_NOW=1` and `include_sample=1`.

| Method + path | Returns |
|---|---|
| `GET /api/health` | `{ ok: true, now }` |
| `GET /api/schools` | `{ built_from_fetch, count, schools: [School] }` |
| `GET /api/status?ids=a,b,c` | `{ now, today_local, sources: [SourceHealth used], stale: [{source_id, text}], district_notices: [Notice], schools: [SchoolStatus] (sorted §4.5), notices: {id: Notice}, unknown_ids: [] }` — 1–30 ids, else 400 `bad_ids` |
| `GET /api/today` | `{ now, today_local, list_date, list_date_text, sources, stale, counts: {current, by_status}, district: [Notice], region_wide: [Notice], regions: [{ region, region_name, notices: [Notice & {applies_to: [{school_id, name, community, how}]}], unmatched: [Notice], earlier: [Notice removed on this list_date] }], csfp: [Notice], open_rule_quote }` — regions always all four in order Avalon, Central, Western, Labrador |
| `GET /api/notices/:id` | `{ notice, source: registry & health, applies_to: [{school, how}], may_apply_to: [{school, reason, reason_text}], raw_links: [{raw_ref, href: "/api/raw/<raw_ref>", fetched_at}] }` — removed notices included; 404 if unknown |
| `GET /api/sources` | `{ now, sources: [registry & health for every entry, link_only and not_used included], schools: {counts, sources} }` |
| `GET /api/raw/<raw_ref>` | the raw body, `text/plain; charset=utf-8`; 404 if not kept |
| `POST /api/admin/ingest` | Bearer `ADMIN_TOKEN`; §5.5 → `{ ok, source_id, accepted, quotes_dropped, removed, notices_current }`; 401 without token |
| `POST /api/admin/scan?only=<id>&force=1` | Bearer; runs `runScan` inside the Worker (same code as `scheduled()`), returns the summary |
| `POST /api/admin/reset` | Bearer; wipes the local D1. **Exists only while `ALLOW_FAKE_NOW=1`** (tests, `seed.mjs --reset`); 404 otherwise (lead 15:20, from sc1) |

Additions accepted from sc1's report (lead 15:20):
- `/api/today` also returns `unplaced: [Notice]`: status rows with no recognisable `region_text` and no matched school,
  so nothing is silently left out; regions + `district` + `region_wide` + `csfp` + `unplaced` add up to
  `counts.current`. The app shows an "Not placed in a region" section when it is non-empty.
- Ingest times (`first_seen_at`, `last_seen_at`, `removed_at`, health times) are the Worker's `now`, never the
  payload's `finished_at`.
- `runScan` marks notices `sample: true` whenever `SOURCE_ORIGIN_MAP` is non-empty (replays).
- `nlschools-notices` has no list date: its ids use `localDate(first scan)`.
- Registry extra fields: `other_urls`, `fetch_names`, `coverage_quote`; `nlschools-notices` `human_url`
  `https://www.nlschools.ca/`; `csfp-news` `human_url` `https://csfp.nl.ca/`.
- At ingest `open_rule_quote` must equal `NLS_OPEN_RULE` and verify against the raw page.

D1 (`worker/migrations/`): `source_health` (one row per source id), `raw_copies` (raw_ref PK, source_id, url,
fetched_at, format, body), `notices` (id PK, source_id, sample, list_date, status, rank, scope, scope_region, json,
first_seen_at, last_seen_at, removed_at), `scans` (id, trigger, started_at, finished_at, summary json). The whole Notice
lives in `json`; indexed columns are copies for queries.

## 8. App (`app/`)

### 8.1 Screens
- `index.html` **My schools**. No schools saved → a welcome card with one big button "Pick your schools". Otherwise
  one card per school, worst status first: school name + community, the status label in very large type with its
  colour and icon, the source's STATUS text verbatim, the quote in a quote block, "On the NLSchools list since 6:42 AM
  · NLSchools doesn't show a posted time" (or "Posted {posted_text}" when there is one), region-wide line when
  `how` is region/province, "As of 6:42 AM" (or the Unknown `reason_text`). May-apply notices show as a separate
  outlined card inside the school card: "This notice may apply to your school" + reason_text + quote + link to the
  notice. District notices at the top. Stale banner at the very top (§8.3). "Checked at 6:42 AM · Refresh" and a
  link to Today's full list. Re-fetch every 60 s while the page is visible.
- `pick.html` **Pick your schools**. Search box (name or community, accent-insensitive, results as you type, ≥ 1 char),
  results show name, community, region, board, grades; tap adds/removes (a clear "Added" state); the selected list
  on top with Remove; a "Done" button back to My schools. Up to 30 schools. Private/Indigenous/Other schools can be
  picked and say "No official closure list, call the school" in the result.
- `notice.html?id=` **Notice**. Source name + link to the official page, status label + STATUS text, the quote, the
  full row text (`source_text`), family and region as given, first seen / last seen / removed ("No longer on the list
  since 10:05 AM"), which schools it applies to (and how) and may apply to (and why), "See the saved copy" links to
  `/api/raw/…`, the list date.
- `today.html` **Today**. Header "NLSchools list for Monday, September 14, 2026 · checked 6:42 AM". District and
  region-wide notices first, then the four regions (collapsed count on phone, expanded on desktop), each with its
  notices, unmatched notices, and "Earlier today (no longer listed)". CSFP section. Empty list → "No schools are on
  the NLSchools list right now" + the open rule quote + "checked 6:42 AM". On a September night this is the correct
  result; say so plainly.
- `sources.html` **Sources**. Each source: name, what it covers, kind in words (Checked / Link only / Not used), last
  check, last good check, next check, result, stale text, terms quote, link. Schools list origin and counts. Coverage
  gaps in plain English (CSFP, private/Indigenous/other schools, buses).

### 8.2 Behaviour and hooks
- localStorage key `scw.schools.v1` = JSON array of school ids. Every read/write in try/catch; storage unavailable →
  keep in memory and show "This browser won't remember your schools."
- `app/api.js` exports `getSchools()`, `getStatus(ids)`, `getToday()`, `getNotice(id)`, `getSources()`; `api.mock.js`
  exports the same. Both pass `now` and `include_sample` through.
- Test hooks (`data-testid`): `school-card` (+ `data-status`, `data-school-id`), `status-label`, `source-status-text`,
  `quote`, `may-apply` (+ `data-notice-id`), `region-wide-line`, `as-of`, `reason`, `stale-banner`,
  `district-notice`, `unmatched-count`, `pick-search`, `pick-result` (+ `data-school-id`, `aria-pressed`),
  `pick-selected`, `notice-detail`, `region-section` (+ `data-region`), `today-empty`, `source-row` (+ `data-source`).
- Before rendering any quote the app checks `normText(source_text).includes(normText(quote))`; failing notices are not
  rendered and a console warning is logged (negative control required). If that drops a school's only applying
  notice, the card shows `Unknown`, app-side reason `quote_check_failed`: "A notice for this school didn't match the
  words we saved from the source, so we don't show it. Check nlschools.ca or call the school." (fixed, lead 15:10).
- `/api/today` `applies_to[].how` is `exact`, `region`, `province` or `may_apply` (may-apply schools are included,
  marked `may_apply`, with `reason`). `/api/status` `notices` holds every id referenced by any `applies` or
  `may_apply` entry and every `district_notices` id. `sources[]` entries carry `id`, `name`, `kind`, `human_url`,
  `stale`, `stale_text`. `raw_links[].href` is relative (`/api/raw/…`); the app prefixes the API origin. (Lead 15:10,
  from sc2's cross-review.)
- Times via `Intl.DateTimeFormat('en-CA', {timeZone: 'America/St_Johns', hour: 'numeric', minute: '2-digit'})`, shown
  as "6:42 AM".

### 8.3 Stale banner
Any `used` source with `stale: true` → a banner at the top of every screen: its `stale_text` (e.g. "We couldn't reach
NLSchools at 6:40 AM. Statuses below are from 6:35 AM.") and a link to the official page. Role `alert`, not
dismissible while stale.

### 8.4 Mock scenarios (`?mock=1&scenario=`)
School list = a copy of real rows from `data/schools.json` (sc2 keeps a subset in `app/mock/`). Notices:
- `today` (default): the two real rows of 2026-09-14, `sample: true`, verbatim.
- `storm`: the three real 2024-01-10 rows (verbatim, `sample: true`) + SAMPLE region-wide Central closure (text
  notice "SAMPLE All schools in the Central region are closed for the day") + SAMPLE ambiguous row
  (school_text "SAMPLE Glovertown", community "Gander, NL", may_apply to Glovertown Academy, reason `name_similar`) +
  one SAMPLE unmatched Western row.
- `quiet`: no notices, healthy sources.
- `stale`: `nlschools-status` last attempt failed 5 minutes ago, last ok 45 minutes ago.
- `csfp`: SAMPLE CSFP feed post may_apply to École Boréale.

## 9. Design
The approved portfolio look (Shop Board calm pass): dark navy/slate base, glass surfaces with hairline borders, soft
shadows, a faint aurora at ~0.2 opacity, gradient wordmark "School Closures Watch". Colour goes on data. **Readable
at 6:30 AM**: 18 px base; school name 22 px; status label 34 px on phone / 40 px desktop, weight 700; quote 18 px.
Status always in words plus colour plus an inline SVG icon: Closed red `#ef4444`, Closed part of the day deep red,
Buses cancelled orange `#f97316`, Closing early amber `#f59e0b`, Delayed opening yellow `#eab308`, Buses delayed pale
yellow, Other notice blue-slate, A notice may apply dashed amber outline, Unknown grey `#94a3b8`, Open green `#22c55e`.
Body text contrast ≥ 7:1, tap targets ≥ 44 px. System fonts, tabular numbers, no emoji. Phone-first at 390; desktop
1280 uses two columns on My schools and Today.
