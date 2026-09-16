// Worker tests with ALLOW_FAKE_NOW=0 (run.mjs runs this file first, against its own wrangler dev).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { get, post, GLOVERTOWN } from './helpers.mjs'
import { scenarioPayloads } from './payloads.mjs'

const OLD = '2020-01-06T10:00:00.000Z'

test('now is ignored unless ALLOW_FAKE_NOW=1 (GET and ingest); the reset endpoint does not exist', async () => {
  const before = Date.now()
  const h = (await get('/api/health', { now: OLD })).body
  assert.notEqual(h.now, OLD)
  assert.ok(Date.parse(h.now) >= before - 60000)
  const s = (await get('/api/status', { ids: GLOVERTOWN, now: OLD })).body
  assert.equal(s.today_local.slice(0, 4) !== '2020', true)
  const [p] = await scenarioPayloads('today', OLD)
  const r = await post('/api/admin/ingest', p, { params: { now: OLD } })
  assert.equal(r.status, 200)
  const src = (await get('/api/sources', { now: OLD })).body.sources.find((x) => x.id === 'nlschools-status')
  assert.ok(Date.parse(src.last_ok_at) >= before - 60000, `ingest used the fake time: ${src.last_ok_at}`)
  const reset = await post('/api/admin/reset')
  assert.equal(reset.status, 404)
})
