#!/usr/bin/env node
// npm run scan [-- --dry] [-- --only <id>] [-- --force] [-- --watch] [-- --now <ISO>]
// Runs core runScan (polite: ≥ 1.1 s per host, research User-Agent, 20 s timeout), caches every raw body at
// data/sources/<raw_ref>, writes data/sources.json (registry + last results), and POSTs one ingest per scanned
// source to the local Worker (API.md §1, §5.5). --dry: no POST; writes data/scan-latest.json instead.
// Env: SC_WORKER_URL (default http://127.0.0.1:8202), SC_ADMIN_TOKEN (default worker/.dev.vars ADMIN_TOKEN, else
// local-dev-token), SOURCE_ORIGIN_MAP (JSON, fixtures only: notices become sample), SC_DATA_DIR (tests; default data/).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runScan, parseOriginMap } from '../core/pipeline.js'
import { REGISTRY, USED } from '../core/sources/registry.js'
import { nextDue } from '../core/schedule.js'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const DATA = (process.env.SC_DATA_DIR ?? ROOT + 'data').replace(/\/+$/, '') + '/'

const args = process.argv.slice(2)
const flag = (f) => args.includes(f)
const value = (f) => {
  const i = args.indexOf(f)
  return i >= 0 ? args[i + 1] : null
}
const dry = flag('--dry')
const force = flag('--force')
const watch = flag('--watch')
const only = value('--only')
const fixedNow = value('--now')
if (args.includes('--only') && !only) {
  console.error('--only needs a source id')
  process.exit(2)
}
if (args.includes('--now') && Number.isNaN(Date.parse(fixedNow ?? ''))) {
  console.error('--now needs an ISO time')
  process.exit(2)
}
if (only && !USED.some((e) => e.id === only)) {
  console.error(`--only ${only}: not a used source (${USED.map((e) => e.id).join(', ')})`)
  process.exit(2)
}

export function readDevVars(path = ROOT + 'worker/.dev.vars') {
  if (!existsSync(path)) return {}
  const out = {}
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line)
    if (m && !line.trim().startsWith('#')) out[m[1]] = m[2].replace(/^"(.*)"$/, '$1')
  }
  return out
}

const WORKER = (process.env.SC_WORKER_URL ?? `http://127.0.0.1:${process.env.SC_WORKER_PORT ?? 8202}`).replace(/\/+$/, '')
const TOKEN = process.env.SC_ADMIN_TOKEN ?? readDevVars().ADMIN_TOKEN ?? 'local-dev-token'
const originMap = parseOriginMap(process.env.SOURCE_ORIGIN_MAP ?? '')
const SOURCES_JSON = DATA + 'sources.json'

const stamp = () => new Date().toLocaleTimeString('en-CA', { hour12: false })
const log = (...a) => console.log(...a)

function readPrevious() {
  try {
    return JSON.parse(readFileSync(SOURCES_JSON, 'utf8'))
  } catch {
    return { sources: [] }
  }
}

async function workerHealth() {
  const res = await fetch(`${WORKER}/api/sources`)
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${WORKER}/api/sources`)
  const { sources } = await res.json()
  return Object.fromEntries(sources.filter((s) => s.kind === 'used').map((s) => [s.id, { last_attempt_at: s.last_attempt_at ?? null }]))
}

async function onRaw(raw) {
  const path = DATA + 'sources/' + raw.raw_ref
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, raw.body)
}

async function ingest(payload) {
  const { requests, quotes_dropped, ...body } = payload
  const res = await fetch(`${WORKER}/api/admin/ingest`, {
    method: 'POST',
    headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`ingest ${payload.source_id}: HTTP ${res.status} ${text.slice(0, 200)}`)
  return JSON.parse(text)
}

function writeSourcesJson(scan) {
  const prev = Object.fromEntries((readPrevious().sources ?? []).map((s) => [s.id, s.last ?? null]))
  const out = {
    note: "Written by scripts/scan.mjs: the source registry (core/sources/registry.js) plus each used source's last scan result. Raw bodies are not stored here.",
    updated_at: scan.finished_at,
    sources: REGISTRY.map((e) => {
      const r = scan.sources.find((s) => s.source_id === e.id)
      if (e.kind !== 'used') return { ...e, last: null }
      if (!r || r.result === 'skipped') return { ...e, last: prev[e.id] ?? null }
      return {
        ...e,
        last: {
          result: r.result,
          error: r.error,
          sample: r.sample,
          last_attempt_at: r.finished_at,
          last_ok_at: r.result === 'ok' ? r.finished_at : (prev[e.id]?.last_ok_at ?? null),
          next_due_at: nextDue(e.id, r.finished_at),
          list_date: r.list_date,
          list_date_text: r.list_date_text,
          open_rule_quote: r.open_rule_quote,
          notices: r.notices.length,
          quotes_dropped: r.quotes_dropped,
          rows_skipped: r.rows_skipped,
          unmapped_classes: r.unmapped_classes,
          requests: r.requests,
        },
      }
    }),
  }
  mkdirSync(dirname(SOURCES_JSON), { recursive: true })
  writeFileSync(SOURCES_JSON, JSON.stringify(out, null, 1) + '\n')
}

async function once({ forceNow }) {
  let health = {}
  if (!dry) {
    try {
      health = await workerHealth()
    } catch (err) {
      console.error(`The Worker at ${WORKER} is not answering (${err.message}). Start it (npm run dev:worker) or use --dry.`)
      return 1
    }
  } else {
    for (const s of readPrevious().sources ?? []) if (s.last?.last_attempt_at) health[s.id] = { last_attempt_at: s.last.last_attempt_at }
  }
  const mapped = Object.keys(originMap).length > 0
  log(
    `[scan ${stamp()}] ${dry ? 'dry run (no POST)' : `→ ${WORKER}`}${only ? ` only ${only}` : ''}${forceNow ? ' forced' : ''}${mapped ? ' [origins mapped: sample]' : ''}`,
  )
  const scan = await runScan({
    now: fixedNow ?? new Date(),
    only,
    force: forceNow,
    fetchImpl: globalThis.fetch,
    originMap,
    onRaw,
    health,
    trigger: 'npm-scan',
  })
  let code = 0
  for (const s of scan.sources) {
    if (s.result === 'skipped') {
      log(`  ${s.source_id.padEnd(18)} skipped (${s.skipped_reason})`)
      continue
    }
    const bytes = s.requests.map((r) => r.bytes).join('+')
    log(
      `  ${s.source_id.padEnd(18)} ${s.result.padEnd(14)} list ${String(s.list_date ?? '-').padEnd(10)} notices ${String(s.notices.length).padStart(2)}  dropped ${s.quotes_dropped}  bytes ${bytes || 0}${s.error ? `  (${s.error})` : ''}`,
    )
    if (!dry) {
      try {
        const r = await ingest(s)
        log(
          `  ${''.padEnd(18)} ingested: accepted ${r.accepted}, dropped ${r.quotes_dropped}, removed ${r.removed}, current ${r.notices_current}`,
        )
      } catch (err) {
        console.error(`  ${err.message}`)
        code = 1
      }
    }
  }
  writeSourcesJson(scan)
  if (dry) {
    const lite = {
      ...scan,
      sources: scan.sources.map((s) =>
        s.raws ? { ...s, raws: s.raws.map(({ body, ...r }) => ({ ...r, bytes: Buffer.byteLength(body) })) } : s,
      ),
    }
    writeFileSync(DATA + 'scan-latest.json', JSON.stringify(lite, null, 1) + '\n')
    log('  wrote data/scan-latest.json and data/sources.json')
  } else {
    log('  wrote data/sources.json')
  }
  return code
}

if (!watch) {
  process.exit(await once({ forceNow: force }))
} else {
  let busy = false
  let first = true
  const tick = async () => {
    if (busy) return
    busy = true
    try {
      await once({ forceNow: first && force })
    } catch (err) {
      console.error(`[scan] ${err.message}`)
    }
    first = false
    busy = false
  }
  process.on('SIGINT', () => process.exit(0))
  process.on('SIGTERM', () => process.exit(0))
  await tick()
  setInterval(tick, 60000)
}
