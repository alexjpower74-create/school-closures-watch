#!/usr/bin/env node
// Builds data/schools.json from the official files saved in data/samples/govnl/. Lead-owned, zero dependencies.
//   node tools/build-schools.mjs          write data/schools.json
//   node tools/build-schools.mjs --check  exit 1 if data/schools.json is out of date
// Every name and community is copied from the saved source; the build fails if a quote isn't in its source.
import { readFileSync, writeFileSync } from 'node:fs'
import { inflateRawSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const SAMPLES = `${REPO}data/samples/govnl/`
const OUT = `${REPO}data/schools.json`
const FETCHED = '2026-09-14'

// ---------- text helpers (same rules as docs/API.md §0) ----------
const NAMED = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  hellip: '…',
  eacute: 'é',
}
const decodeEntities = (s) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => (n in NAMED ? NAMED[n] : m))
const normText = (s) => s.replace(/[\s ]+/g, ' ').trim()
const extractText = (body) =>
  normText(
    decodeEntities(
      decodeEntities(
        body
          .replace(/<script[\s\S]*?<\/script>/gi, ' ')
          .replace(/<style[\s\S]*?<\/style>/gi, ' ')
          .replace(/<!--[\s\S]*?-->/g, ' ')
          .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
          .replace(/<[^>]*>/g, ' '),
      ),
    ),
  )
const slug = (s) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

function mustContain(text, quote, where) {
  if (!text.includes(normText(quote))) throw new Error(`quote not found in ${where}: ${quote}`)
}

// ---------- minimal xlsx (zip) reader ----------
function unzip(buf) {
  let eocd = -1
  for (let i = buf.length - 22; i >= 0; i--)
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i
      break
    }
  if (eocd < 0) throw new Error('not a zip file')
  const count = buf.readUInt16LE(eocd + 10)
  let p = buf.readUInt32LE(eocd + 16)
  const files = {}
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('bad central directory')
    const method = buf.readUInt16LE(p + 10)
    const csize = buf.readUInt32LE(p + 20)
    const nameLen = buf.readUInt16LE(p + 28)
    const extraLen = buf.readUInt16LE(p + 30)
    const commentLen = buf.readUInt16LE(p + 32)
    const local = buf.readUInt32LE(p + 42)
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen)
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28)
    const data = buf.subarray(start, start + csize)
    files[name] = method === 8 ? inflateRawSync(data) : Buffer.from(data)
    p += 46 + nameLen + extraLen + commentLen
  }
  return files
}

function readSheet(path) {
  const files = unzip(readFileSync(path))
  const shared = [...(files['xl/sharedStrings.xml']?.toString('utf8') ?? '').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    decodeEntities([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')),
  )
  const sheet = files['xl/worksheets/sheet1.xml'].toString('utf8')
  const rows = []
  for (const r of sheet.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = {}
    for (const c of r[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const [, col, attrs, inner = ''] = c
      const v = inner.match(/<v>([\s\S]*?)<\/v>/)
      const t = inner.match(/<t[^>]*>([\s\S]*?)<\/t>/)
      if (/t="s"/.test(attrs) && v) cells[col] = shared[Number(v[1])]
      else if (v) cells[col] = decodeEntities(v[1])
      else if (t) cells[col] = decodeEntities(t[1])
    }
    rows.push(cells)
  }
  const header = rows.shift()
  return rows.map((cells) => Object.fromEntries(Object.entries(header).map(([col, h]) => [h, cells[col] ?? null])))
}

// ---------- public schools (NLSchools + CSFP) ----------
const GRADE_COLS = [
  ['K', 'K'],
  ['ONE', '1'],
  ['TWO', '2'],
  ['THREE', '3'],
  ['FOUR', '4'],
  ['FIVE', '5'],
  ['SIX', '6'],
  ['SEVEN', '7'],
  ['EIGHT', '8'],
  ['NINE', '9'],
  ['TEN', '10'],
  ['ELEVEN', '11'],
  ['TWELVE', '12'],
]
const REGIONS = { Avalon: 'avalon', Central: 'central', Western: 'western', Labrador: 'labrador' }

const dbPage = extractText(readFileSync(`${SAMPLES}schooldatabase-page-2026-09-14.html`, 'utf8'))
const DB_QUOTE =
  'The listed spreadsheets contain enrolment data for 2025-26. These figures are based on enrollment data as of September 30, 2025.'
const DB_USE_QUOTE = 'This is a file for your own personal use.'
mustContain(dbPage, DB_QUOTE, 'schooldatabase page')
mustContain(dbPage, DB_USE_QUOTE, 'schooldatabase page')
const disclaimer = extractText(readFileSync(`${SAMPLES}disclaimer-2026-09-14.html`, 'utf8'))
const GOV_TERMS_QUOTE =
  'Where the Government of Newfoundland and Labrador is the owner of copyright in information on this website, government hereby grants permission for the information of this web site to be used by the public and non-government organizations.'
mustContain(disclaimer, GOV_TERMS_QUOTE, 'gov.nl.ca disclaimer')

const XLSX_URL = 'https://www.gov.nl.ca/education/files/PublicEnrollment_FINAL2025-10-31.xlsx'
const schools = []
for (const row of readSheet(`${SAMPLES}PublicEnrollment_FINAL2025-10-31.xlsx`)) {
  if (!row.SchoolID || !row.School) continue
  const board = row.SchoolGroup === 'CSFP' ? 'CSFP' : row.SchoolGroup === 'NLSchools' ? 'NLSchools' : null
  if (!board) throw new Error(`unexpected SchoolGroup ${row.SchoolGroup}`)
  const region = REGIONS[row.Region]
  if (!region) throw new Error(`unexpected Region ${row.Region}`)
  const grades = GRADE_COLS.filter(([col]) => Number(row[col] ?? 0) > 0).map(([, label]) => label)
  schools.push({
    id: `${board === 'CSFP' ? 'csfp' : 'nls'}-${row.SchoolID}`,
    name: row.School.trim(),
    community: row.Community ? row.Community.trim().replace(/,+$/, '').trim() : null,
    region,
    region_name: row.Region,
    board,
    coverage: board === 'CSFP' ? 'csfp' : 'nlschools',
    type_code: row.School_Type?.trim() || null,
    grades_text: grades.length ? (grades.length === 1 ? grades[0] : `${grades[0]}–${grades.at(-1)}`) : null,
    phone: row.Phone ? row.Phone.trim() : null,
    urban_rural: row.Urban_Rural?.trim() || null,
    source_id: 'govnl-public-schools',
    source_url: XLSX_URL,
    source_row: { SchoolID: row.SchoolID, School: row.School, Community: row.Community, Region: row.Region, SchoolGroup: row.SchoolGroup },
  })
}

// ---------- private, Indigenous and other schools (names only on the directory pages) ----------
function entryContent(file) {
  const html = readFileSync(`${SAMPLES}${file}`, 'utf8')
  const m = html.match(/<div class="entry-content">([\s\S]*?)<\/div><!-- \.entry-content -->/)
  if (!m) throw new Error(`no entry-content in ${file}`)
  return { html: m[1], text: extractText(html) }
}
function directoryNames(file, { strongOnly = false } = {}) {
  const { html, text } = entryContent(file)
  const out = []
  let operator = null
  for (const m of html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>|<p[^>]*>([\s\S]*?)<\/p>/g)) {
    if (m[1] !== undefined) {
      const h = extractText(m[1])
      if (h) operator = h
      continue
    }
    const inner = m[2]
    if (strongOnly && !/<strong/.test(inner)) continue
    const name = extractText(inner.replace(/<br\s*\/?>[\s\S]*$/, ''))
    if (!name || /https?:\/\//.test(name) || /^Education Operations/.test(name)) continue
    mustContain(text, name, file)
    out.push({ name, operator: strongOnly ? operator : null })
  }
  return out
}
const DIRS = [
  ['private', 'Private', 'directory-private-2026-09-14.html', 'https://www.gov.nl.ca/education/k12/schooldirectory/private/', {}],
  [
    'indigenous',
    'Indigenous',
    'directory-indigenous-2026-09-14.html',
    'https://www.gov.nl.ca/education/k12/schooldirectory/indigenous/',
    { strongOnly: true },
  ],
  ['other', 'Other', 'directory-other-2026-09-14.html', 'https://www.gov.nl.ca/education/k12/schooldirectory/other/', {}],
]
for (const [key, board, file, url, opts] of DIRS) {
  for (const { name, operator } of directoryNames(file, opts)) {
    schools.push({
      id: `${key}-${slug(name)}`,
      name,
      community: null,
      region: null,
      region_name: null,
      board,
      coverage: 'none',
      type_code: null,
      grades_text: null,
      phone: null,
      urban_rural: null,
      operator,
      source_id: `govnl-directory-${key}`,
      source_url: url,
      source_row: null,
    })
  }
}

const ids = new Set()
for (const s of schools) {
  if (ids.has(s.id)) throw new Error(`duplicate id ${s.id}`)
  ids.add(s.id)
}
const ORDER = { NLSchools: 0, CSFP: 1, Indigenous: 2, Private: 3, Other: 4 }
schools.sort(
  (a, b) => ORDER[a.board] - ORDER[b.board] || (a.region_name ?? '').localeCompare(b.region_name ?? '') || a.name.localeCompare(b.name),
)

const count = (f) => schools.filter(f).length
const out = {
  built_from_fetch: FETCHED,
  note: 'Built by tools/build-schools.mjs from the official files saved in data/samples/govnl/. Principal names, emails and fax numbers are deliberately left out.',
  sources: [
    {
      id: 'govnl-public-schools',
      name: 'Public Schools 2025-26 (spreadsheet)',
      publisher: 'Government of Newfoundland and Labrador, Department of Education',
      url: XLSX_URL,
      page_url: 'https://www.gov.nl.ca/education/faq/schooldatabase/',
      fetched: FETCHED,
      saved_as: 'data/samples/govnl/PublicEnrollment_FINAL2025-10-31.xlsx',
      quote: DB_QUOTE,
      use_quote: DB_USE_QUOTE,
      terms_url: 'https://www.gov.nl.ca/disclaimer/',
      terms_quote: GOV_TERMS_QUOTE,
    },
    ...DIRS.map(([key, board, file, url]) => ({
      id: `govnl-directory-${key}`,
      name: `${board} Schools (directory page)`,
      publisher: 'Government of Newfoundland and Labrador, Department of Education',
      url,
      page_url: url,
      fetched: FETCHED,
      saved_as: `data/samples/govnl/${file}`,
      quote: null,
      terms_url: 'https://www.gov.nl.ca/disclaimer/',
      terms_quote: GOV_TERMS_QUOTE,
    })),
  ],
  counts: {
    total: schools.length,
    NLSchools: count((s) => s.board === 'NLSchools'),
    CSFP: count((s) => s.board === 'CSFP'),
    Indigenous: count((s) => s.board === 'Indigenous'),
    Private: count((s) => s.board === 'Private'),
    Other: count((s) => s.board === 'Other'),
    by_region: Object.fromEntries(Object.values(REGIONS).map((r) => [r, count((s) => s.region === r)])),
  },
  schools,
}
const json = `${JSON.stringify(out, null, 2)}\n`
if (process.argv.includes('--check')) {
  let current = ''
  try {
    current = readFileSync(OUT, 'utf8')
  } catch {}
  if (current !== json) {
    console.error('data/schools.json is out of date: run npm run schools')
    process.exit(1)
  }
  console.log(`data/schools.json is up to date (${schools.length} schools)`)
} else {
  writeFileSync(OUT, json)
  console.log(`wrote data/schools.json: ${JSON.stringify(out.counts)}`)
}
