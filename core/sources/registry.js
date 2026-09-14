// Source registry (API.md §2). Mirrored to data/sources.json by every scan. Link only and Not used entries are
// NEVER fetched: they have no fetch_urls, and runScan skips any entry whose kind isn't "used".

/** Verbatim from nlschools/statusreport-2026-09-14T1408NDT.html; re-checked on the live page every scan (§4.5). */
export const NLS_OPEN_RULE = 'If your school is not listed below, the status is normal and open as usual.'
/** Verbatim from csfp/transport-scolaire-2026-09-14.html. */
export const CSFP_RULE = 'C’est également à la direction que revient la décision de fermer l’école lorsque les conditions atmosphériques sont mauvaises et de prendre tous les moyens possibles pour en informer les élèves, leurs parents ou leurs tuteurs le plus rapidement possible.'

const NLS_PUBLISHER = 'NLSchools (Department of Education, Education Operations Branch)'
const NLS_TERMS_URL = 'https://www.nlschools.ca/termsofuse.jsp'
const NLS_TERMS = "The contents, but not any logo or other visual representation, of the NLSchools' website or related website may be used and reproduced solely for non-commercial, personal or educational purposes provided that it is not modified and that you do not delete any copyrights and other legal or proprietary notices contained therein."
const CSFP_PUBLISHER = 'Conseil scolaire francophone provincial (CSFP)'

const entry = e => ({
  id: null, name: null, publisher: null, kind: 'used', covers: null, human_url: null, other_urls: [], fetch_urls: [],
  fetch_names: [], format: null, terms_url: null, terms_quote: null, robots_note: null, reason: null, attribution: null,
  coverage_quote: null, ...e
})

export const REGISTRY = [
  entry({
    id: 'nlschools-status',
    name: 'NLSchools School Status Report',
    publisher: NLS_PUBLISHER,
    covers: 'NLSchools schools',
    human_url: 'https://www.nlschools.ca/schools/statusreport.jsp',
    fetch_urls: ['https://www.nlschools.ca/schools/statusreport.jsp', 'https://www.nlschools.ca/schools/generated/schoolstatus.html'],
    fetch_names: ['statusreport', 'schoolstatus'],
    format: 'html',
    terms_url: NLS_TERMS_URL,
    terms_quote: NLS_TERMS,
    robots_note: 'robots.txt is a 404 page (no rules)',
    attribution: 'Source: NLSchools School Status Report',
    coverage_quote: NLS_OPEN_RULE
  }),
  entry({
    id: 'nlschools-notices',
    name: 'NLSchools important notices',
    publisher: NLS_PUBLISHER,
    covers: 'Notices for all NLSchools schools (usually empty)',
    human_url: 'https://www.nlschools.ca/',
    fetch_urls: ['https://www.nlschools.ca/about/generated/newspostings_5.html'],
    fetch_names: ['newspostings_5'],
    format: 'html',
    terms_url: NLS_TERMS_URL,
    terms_quote: NLS_TERMS,
    robots_note: 'robots.txt is a 404 page (no rules)',
    attribution: 'Source: NLSchools important notices'
  }),
  entry({
    id: 'csfp-news',
    name: 'CSFP news feed',
    publisher: CSFP_PUBLISHER,
    covers: 'CSFP (French first-language) schools: news posts only, no closure list',
    human_url: 'https://csfp.nl.ca/',
    fetch_urls: ['https://csfp.nl.ca/feed/'],
    fetch_names: ['feed'],
    format: 'xml',
    terms_url: null,
    terms_quote: null,
    robots_note: 'robots.txt allows everything except /wp-admin/',
    reason: 'No terms of use found on csfp.nl.ca',
    attribution: 'Source: CSFP news feed'
  }),
  entry({
    id: 'nlschools-busplanner',
    name: 'NLSchools BusPlanner',
    publisher: NLS_PUBLISHER,
    kind: 'link_only',
    covers: 'NLSchools school buses',
    human_url: 'https://nlschools.mybusplanner.ca/',
    reason: "Bus delays and cancellations aren't published publicly; the Parent Portal needs a login."
  }),
  entry({
    id: 'nlschools-social',
    name: 'NLSchools social media',
    publisher: NLS_PUBLISHER,
    kind: 'link_only',
    covers: 'NLSchools announcements',
    human_url: 'https://twitter.com/NLSchoolsCA',
    other_urls: ['https://www.facebook.com/NLSCHOOLSCA'],
    reason: "Social posts need a login to read reliably; we don't copy them."
  }),
  entry({
    id: 'nlschools-weather-protocol',
    name: 'NLSchools weather protocol',
    publisher: NLS_PUBLISHER,
    kind: 'link_only',
    covers: 'How closures are decided',
    human_url: 'https://www.nlschools.ca/schools/weatherprotocol.jsp',
    reason: 'How NLSchools decides closures (announced 6:30–7:00 a.m.).'
  }),
  entry({
    id: 'csfp-transport',
    name: 'CSFP school transport',
    publisher: CSFP_PUBLISHER,
    kind: 'link_only',
    covers: 'CSFP schools',
    human_url: 'https://csfp.nl.ca/transport-scolaire/',
    reason: 'CSFP principals decide closures and tell families directly.',
    coverage_quote: CSFP_RULE
  }),
  entry({
    id: 'radio-aggregators',
    name: 'Radio stations and closure aggregators',
    publisher: null,
    kind: 'not_used',
    covers: null,
    reason: 'Not an official source.'
  })
]

export const REGISTRY_BY_ID = Object.fromEntries(REGISTRY.map(e => [e.id, e]))
export const USED = REGISTRY.filter(e => e.kind === 'used')

/** fetchPlan for a used entry: [{ url, name, format }] in registry order. */
export function planFor (entry) {
  if (entry.kind !== 'used') return []
  return entry.fetch_urls.map((url, i) => ({ url, name: entry.fetch_names[i], format: entry.format }))
}
