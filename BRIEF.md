# School Closures Watch — brief (Onyx, 2026-09-14)

**Prefix** `sc` · **Ports** app 8201, worker 8202, QA 8209 · **Repo** `school-closures-watch` (private) · **Lead effort** xhigh

## What
On a stormy Newfoundland morning parents need one answer fast: **is my kid's school open, delayed or closed, and
is the bus running?** Pick your schools once; the page shows each school's status from the official source with
the posted time and the verbatim notice, and "No notice posted as of 6:42 AM" when there isn't one.

## Sources (research and verify; public only)
- The NL provincial school authority's official school closures / delays page or feed (the English school
  district became part of the Department of Education — find the current official page, and any RSS/JSON/social
  feed it publishes). Also the Conseil scolaire francophone provincial (CSFP) closures.
- Official bus cancellation notices if published separately.
- Only official sources; no radio station aggregators unless the official source links them as official.
- `data/schools.json`: every school in the province from the official school directory (name, community, region,
  grades), each with the source URL. `data/sources.json`: URL, terms quote, format, last fetch, status.

## Behaviour
Scan every 5 minutes between 5:00 and 9:00 AM and at 11:00–13:00 (early dismissals), hourly otherwise
(`npm run scan` + Worker `scheduled()`). Notices matched to schools by the names/regions in the official text; a
notice naming a whole region applies to its schools and says so. **Ambiguous match = shown as "This notice may
apply to your school" with the quote**, never silently applied. Status: Open (no notice) / Delayed opening /
Closed / Early dismissal / Buses cancelled, each with posted time and quote.

## Screens
Pick schools (search by name/community), my schools page (worst status first, big type), notice detail, today's
full list by region, sources + health (stale-source banner when a fetch fails). 390 + 1280.

## Tests that matter
Fixtures from real saved notices (past storm days if the source has an archive; otherwise realistic SAMPLE
notices clearly marked SAMPLE in fixtures only); region-wide closure applies to every school in the region;
ambiguous name shows "may apply" (negative control: force an exact-match-only bug, see it go red); stale source
shows the banner. **Run a real scan at the end** (a September night will likely show no notices — that's the
correct result; say so on screen).
