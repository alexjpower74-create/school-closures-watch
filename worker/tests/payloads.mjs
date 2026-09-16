// Ingest payloads (§5.5) for a fixture scenario, built in-process by the real core runScan against the fixture
// files (no network, no server). Used by the Worker tests and by seed.mjs. Every payload is sample: true.
import { runScan } from '../../core/pipeline.js'
import { scenarioBody, SCENARIOS } from '../../core/tests/fixture-server.mjs'

export { SCENARIOS }

const FIXTURE_ORIGIN = 'http://fixture.invalid'

export async function scenarioPayloads(name, now, { only = null } = {}) {
  if (!SCENARIOS[name]) throw new Error(`unknown scenario ${name}`)
  const fetchImpl = async (url) => {
    const out = scenarioBody(name, new URL(url).pathname)
    if (!out) return new Response('not in fixtures', { status: 404 })
    return new Response(out.body, { status: out.status, headers: { 'content-type': out.type } })
  }
  const scan = await runScan({
    now,
    only,
    force: true,
    fetchImpl,
    originMap: { 'https://www.nlschools.ca': FIXTURE_ORIGIN, 'https://csfp.nl.ca': FIXTURE_ORIGIN },
    sleep: async () => {},
    trigger: 'admin',
  })
  return scan.sources.map(({ requests, quotes_dropped, ...payload }) => payload)
}
