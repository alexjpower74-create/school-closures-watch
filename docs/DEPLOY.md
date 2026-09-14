# School Closures Watch — what deploying needs

**Nothing here has been run.** Tonight's build is local only (Alexander's rule for the overnight sprint). This is the
checklist for when he decides to put it online.

## 0. Decide first (needs Alexander)
1. **NLSchools permission.** Their terms allow reuse "solely for non-commercial, personal or educational purposes
   provided that it is not modified" and say "Such information may not otherwise be used, reproduced, broadcast,
   published or re-disseminated without the prior written permission of NLSchools." A free public page is arguably
   non-commercial, but anything under APCO Software Tools (a business) should get written permission first. Contact:
   NLSchools Avalon/HQ office, 100 Prince Philip Drive, St. John's, (709) 729-1234, feedback@nlschools.ca.
2. **School spreadsheet.** gov.nl.ca's download page says "This is a file for your own personal use." while the
   site-wide disclaimer grants permission for the public and non-government organizations to use the information.
   Only public facts are kept (school name, community, region, grades, school phone). Confirm this is acceptable.
3. **CSFP.** No online closures source exists. Decide whether to ask the CSFP (709-722-6324, conseil@csfp.nl.ca)
   whether they publish closures anywhere official.
4. **Domain.** e.g. `schools.apcosoftwaretools.ca` (Cloudflare DNS on the existing zone).

## 1. Cloudflare resources
| What | Name | Command (run by Alexander or with his go-ahead) |
|---|---|---|
| D1 database | `school-closures-watch` | `wrangler d1 create school-closures-watch`, then put the id in `worker/wrangler.toml` `database_id` |
| Migrations | `worker/migrations/` | `cd worker && wrangler d1 migrations apply school-closures-watch --remote` (deploy does **not** migrate) |
| Secret | `ADMIN_TOKEN` | `wrangler secret put ADMIN_TOKEN` (a long random string; only needed for `/api/admin/*`) |
| Worker | `school-closures-watch` | `cd worker && wrangler deploy` |
| Cron | `*/5 * * * *` | already in `wrangler.toml`; `core/schedule.js` decides what is due (every 5 min 05:00–08:59 and 11:00–12:59 NL time on weekdays, hourly otherwise) |
| App | static `app/` | Cloudflare Pages project `school-closures-watch` or Workers static assets; set `<meta name="api-base">` to the Worker URL |

Vars in production: `SOURCE_ORIGIN_MAP = ""`, `ALLOW_FAKE_NOW = "0"`.

## 2. After deploying
1. `curl https://<worker>/api/health`.
2. Trigger one scan: `curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" https://<worker>/api/admin/scan?force=1`.
3. `curl https://<worker>/api/sources` — every used source `last_result: "ok"`, `stale: false`.
4. Open the app, pick a school, check "As of" is a minute ago.
5. Watch the first weekday 05:00 NL window: `/api/sources` `interval_minutes_now` should be 5.

## 3. Load on the sources
NLSchools: 3 small requests per pass (page 60 KB, table ~3 KB, notices ~65 B), every 5 minutes for 6 hours a weekday,
hourly otherwise, ≈ 44 passes a day. CSFP feed: every 15 minutes in the windows, hourly otherwise. One shared cache
serves every visitor; visitors never cause source requests.
