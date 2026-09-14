#!/usr/bin/env node
// node worker/tests/seed.mjs --url http://127.0.0.1:8202 --token local-dev-token --scenario today|storm|quiet|stale|csfp|region|ambiguous [--now <ISO>] [--reset]
// Ingests fixture payloads (real saved files + SAMPLE fixtures, all sample: true) into a running local Worker so the
// app can run against a real API. View with the app's ?sample=1 (include_sample=1).
// - Payloads are built at --now (default: now; csfp defaults to 2026-09-14T18:00:00Z so the SAMPLE post is recent).
// - The Worker stamps ingest times with its own clock unless it runs with ALLOW_FAKE_NOW=1, in which case --now is
//   passed through as ?now=. "stale" = an ok scan, then a failed one (45 and 5 minutes before --now when time can be
//   faked; otherwise both at the Worker's now, which is still stale: last attempt failed).
// - --reset wipes the local DB first (only works while the Worker has ALLOW_FAKE_NOW=1).
import { scenarioPayloads, SCENARIOS } from './payloads.mjs'

const args = process.argv.slice(2)
const value = f => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null }
const url = (value('--url') ?? 'http://127.0.0.1:8202').replace(/\/+$/, '')
const token = value('--token') ?? 'local-dev-token'
const scenario = value('--scenario') ?? 'today'
if (!SCENARIOS[scenario]) { console.error(`unknown scenario ${scenario}: ${Object.keys(SCENARIOS).join(', ')}`); process.exit(2) }
const now = value('--now') ?? (scenario === 'csfp' ? '2026-09-14T18:00:00.000Z' : new Date().toISOString())
if (Number.isNaN(Date.parse(now))) { console.error('--now needs an ISO time'); process.exit(2) }
const MIN = 60000
const at = ms => new Date(Date.parse(now) + ms).toISOString()

async function post (path, body, nowParam) {
  const res = await fetch(`${url}${path}?now=${encodeURIComponent(nowParam)}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status} ${text.slice(0, 200)}`)
  return JSON.parse(text)
}

async function ingest (name, when, only = null) {
  for (const p of await scenarioPayloads(name, when, { only })) {
    const r = await post('/api/admin/ingest', p, when)
    console.log(`  ${name.padEnd(9)} ${p.source_id.padEnd(18)} ${p.result.padEnd(6)} accepted ${r.accepted} dropped ${r.quotes_dropped} removed ${r.removed} current ${r.notices_current}`)
  }
}

try {
  if (args.includes('--reset')) console.log(`reset: ${JSON.stringify(await post('/api/admin/reset', null, now))}`)
  console.log(`seeding ${scenario} into ${url} at ${now}`)
  if (scenario === 'stale') {
    await ingest('today', at(-45 * MIN))
    await ingest('stale', at(-5 * MIN), 'nlschools-status')
    await ingest('stale', at(-5 * MIN), 'nlschools-notices')
    await ingest('today', at(-5 * MIN), 'csfp-news')
  } else {
    await ingest(scenario, now)
  }
  console.log('done. Open the app with ?sample=1' + (scenario === 'today' ? ' (and ?now= on 2026-09-14 for the exact list date)' : ''))
} catch (err) {
  console.error(err.message)
  process.exit(1)
}
