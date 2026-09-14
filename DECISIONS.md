# School Closures Watch — decisions

Alexander was asleep; the lead (Onyx, overnight sprint 2026-09-14) decided these and wrote down why. Every quote below
is verbatim from a file saved in `data/samples/` on 2026-09-14 with the User-Agent
`APCO-Software-Tools-research/1.0 (+https://apcosoftwaretools.ca)`.

## 1. Sources (research, 2026-09-14 afternoon)

### 1.1 NLSchools School Status Report: USED (the main source)
- English schools are run by the Department of Education as **NLSchools** (the old NLESD). The gov.nl.ca public
  schools page says: "English schools are operated by the Department of Education, Education Operations Branch as
  NLSchools (with regional offices in Happy Valley-Goose Bay, Corner Brook, Gander and St. John’s) and French schools
  are operated by the Conseil Scolaire Francophone, guided by trustees." (`govnl/directory-public-2026-09-14.html`)
- The human page is `https://www.nlschools.ca/schools/statusreport.jsp`. Its table is not in the page: jQuery loads
  `generated/schoolstatus.html` into `#newStatus`. The fragment `https://www.nlschools.ca/schools/generated/schoolstatus.html`
  is a plain HTML table with columns SCHOOL/BUILDING, STATUS, DESCRIPTION/NOTES, FAMILY, REGION. We fetch the page
  (for the date line and the "open as usual" rule) and the fragment (for the rows). Old `nlesd.ca` URLs time out or 404.
- What the page says about itself (`nlschools/statusreport-2026-09-14T1408NDT.html`):
  - "Real-time school closure information for: Monday, September 14, 2026"
  - "Please note if after 6 PM Monday to Thursday then information for tomorrow is showing."
  - "This information is updated by school administrators and/or district personnel and resets at midnight daily."
  - "Results are refreshed every 5 minutes."
  - "If your school is not listed below, the status is normal and open as usual." ← the only basis for ever showing
    "Open". If this sentence disappears, we stop saying Open (API.md §4.5).
- **No posted time per notice.** The table has no time column; `Last-Modified` changes every regeneration. We store
  `first_seen_at` (our first scan that saw it) and say plainly that NLSchools doesn't show a posted time.
- Status CSS classes found in `nlesd.css` (`nlschools/nlesd-css-2026-09-14.css`): `busDelayed`, `delayedOpening`,
  `otherStatus`, `closedAllDay`, `closedForPD`, `closedForHoliday`, `closedForAfternoon`, `closedForMorning`. The 2025-07-31
  archive also uses `closingEarly` (not in the CSS). No "buses cancelled" class exists; the status table maps the
  STATUS text if one ever appears.
- Real rows saved: today 2026-09-14 (Eastside Elementary, Corner Brook: OTHER STATUS with a bus-run note; Glovertown
  Academy: CLOSED ALL DAY, "Water Shut Off"), and three Wayback Machine captures of the same fragment:
  2024-01-10 (Bay d'Espoir Academy CLOSED FOR MORNING; Bishop White School and St. Mark's School DELAYED OPENING,
  icy roads), 2024-01-17 (Eastside Elementary CLOSED FOR PD), 2025-07-31 (Upper Gullies Elementary CLOSING EARLY).
  All six names match the provincial spreadsheet exactly on name + community.
- No real capture of a whole-region closure exists in the archive (only 3 fragment captures). Region-wide and
  ambiguous fixtures are therefore **SAMPLE** rows, marked SAMPLE in fixtures only (the brief allows this).
- robots.txt: `https://www.nlschools.ca/robots.txt` returns a 404 page (no rules). We fetch 2 URLs every 5 minutes
  in the busy windows (≈0.007 requests/second), well under "an unreasonable or disproportionately large load".
- **Terms** (`nlschools/termsofuse-2026-09-14.html`): "The contents, but not any logo or other visual representation,
  of the NLSchools' website or related website may be used and reproduced solely for non-commercial, personal or
  educational purposes provided that it is not modified and that you do not delete any copyrights and other legal or
  proprietary notices contained therein. Such information may not otherwise be used, reproduced, broadcast, published
  or re-disseminated without the prior written permission of NLSchools."
  → Tonight's local build is fine (unmodified quotes, no logo). **A public or paid version needs NLSchools' written
  permission first. NEEDS ALEXANDER.**

### 1.2 NLSchools important notices: USED (watch only)
- The home page loads `/about/generated/newspostings_5.html` into `#importantNoticeBox`. Today it holds only
  `$('importantNoticeBox').css('display','none');` (saved). The 2023-05-16 and 2024-01-10 archive captures are the same.
  A storm-day notice could appear here, so we fetch it with the status list and show any text as an NLSchools notice
  (region-wide only when it names a whole region, API.md §4.4). Its non-empty format is unknown; the parser is
  deliberately simple and says so in health if it can't read it.

### 1.3 CSFP (Conseil scolaire francophone provincial): news feed USED, no status source exists
- Six CSFP schools are in the provincial spreadsheet (SchoolGroup `CSFP`).
- No closures page, status list or feed was found: home page, `nouvelles`, `transport-scolaire`, the six school
  pages, `page-sitemap.xml` (46 pages) and the RSS feed (latest post 2026-09-04) have no closure notices.
- The transport page says the principal decides and tells families directly: "C’est également à la direction que
  revient la décision de fermer l’école lorsque les conditions atmosphériques sont mauvaises et de prendre tous les
  moyens possibles pour en informer les élèves, leurs parents ou leurs tuteurs le plus rapidement possible."
- Decision: CSFP schools are never shown as Open. Their status is **Unknown** with that reason (in plain English on
  screen, the French quote in the detail). We watch `https://csfp.nl.ca/feed/` (robots.txt allows everything except
  `/wp-admin/`) and show any recent post with a closure word as "This notice may apply to your school".
- CSFP terms: none found on the site. Quotes are shown unmodified with a link. Flag for a public version.

### 1.4 Buses: LINK ONLY
- NLSchools BusPlanner `https://nlschools.mybusplanner.ca/` is linked from nlschools.ca. The public side has school
  lookup and eligibility; delays/cancellations are not published publicly (Parent Portal needs a login) and its
  robots.txt URL returns an error page. **Link only; never fetched by the scanner.**
- Bus information reaches parents through the status list itself (`busDelayed` class, notes such as "the following
  runs will be delayed"). We show those verbatim; we never infer "buses cancelled" from a note.
- NLSchools social accounts (X `@NLSchoolsCA`, Facebook, BlueSky): LINK ONLY (logins/terms; not scraped). Radio
  stations and aggregators: NOT USED (brief: official sources only).

### 1.5 School directory: USED (build time)
- `data/schools.json` is built by `tools/build-schools.mjs` from the **Public Schools 2025-26** spreadsheet
  (`https://www.gov.nl.ca/education/files/PublicEnrollment_FINAL2025-10-31.xlsx`, 255 schools: 249 NLSchools, 6 CSFP;
  Avalon 93, Central 77, Western 64, Labrador 21) plus the Private (8), Indigenous (3) and Other (3) directory pages
  (names only).
- The download page says "This is a file for your own personal use." and the gov.nl.ca disclaimer says
  "Where the Government of Newfoundland and Labrador is the owner of copyright in information on this website,
  government hereby grants permission for the information of this web site to be used by the public and
  non-government organizations." Names, communities and regions of public schools are public facts; we keep those,
  the school phone and grades, and **leave out principal names, emails and fax numbers**. Flag the "personal use"
  line for Alexander before a public version.
- "Grades" = the first and last grade with students enrolled on September 30, 2025 (the spreadsheet has no "grades
  offered" column). Shown as "Grades K–6 (enrolment, Sept 30 2025)". A trailing comma in two community cells
  ("Burin Bay Arm,") is trimmed; nothing else is changed.
- Private, Indigenous and Other schools have no official online status source: status **Unknown**, "Call the
  school". Inuit schools are run by NLSchools and are already in the spreadsheet.

## 2. Build decisions
1. **Two slices** (sprint pace rule): `sc1` core + scanner + Worker/D1, `sc2` app + Playwright. Lead owns contract,
   samples, schools.json, README/DEPLOY and final QA.
2. **Look**: the approved portfolio look (Shop Board calm pass: dark navy, glass, aurora at 0.2, colour on data),
   tuned for a parent at 6:30 AM: status label in very large type, always in words as well as colour.
3. **Scan schedule** (brief): every 5 minutes 05:00–08:59 and 11:00–12:59 Newfoundland time on weekdays, hourly
   otherwise. The Worker cron fires every 5 minutes and `core/schedule.js` decides what is due, so the Worker and
   `npm run scan --watch` share one rule.
4. **Status wording** uses our fixed labels plus the source's own STATUS text verbatim. No summaries.
5. **Ambiguity**: exact = same normalised name AND community, and only one such school. Anything else is "may apply"
   (or unmatched and listed on Today's page), never silently applied.
6. **Stale**: a source is stale if its last attempt failed or no successful check arrived within 10 minutes after the
   next one was due. Stale → banner, and no school is called Open.
7. No AI. No deploys. Private repo.
