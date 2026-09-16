import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SCHOOLS_DATA } from '../schools-data.js'
import { SCHOOLS, publicSchool, schoolsInRegion, schoolCounts } from '../schools.js'
import { ROOT } from './helpers.mjs'

test('core/schools-data.js equals data/schools.json (run scripts/gen-schools.mjs if red)', () => {
  assert.deepEqual(SCHOOLS_DATA, JSON.parse(readFileSync(ROOT + 'data/schools.json', 'utf8')))
})

test('counts from DECISIONS.md: 269 schools, 249 NLSchools, 6 CSFP, 77 Central NLSchools', () => {
  assert.equal(SCHOOLS.length, 269)
  const c = schoolCounts()
  assert.equal(c.by_coverage.nlschools, 249)
  assert.equal(c.by_coverage.csfp, 6)
  assert.equal(c.by_coverage.none, 14)
  assert.equal(schoolsInRegion('central').length, 77)
  assert.ok(schoolsInRegion('central').every((s) => s.board === 'NLSchools'))
})

test('publicSchool has the §5.3 fields only', () => {
  const s = publicSchool(SCHOOLS.find((x) => x.name === 'Glovertown Academy'))
  assert.deepEqual(Object.keys(s), [
    'id',
    'name',
    'community',
    'region',
    'region_name',
    'board',
    'coverage',
    'type_code',
    'grades_text',
    'phone',
    'source_id',
    'source_url',
  ])
  const ind = publicSchool(SCHOOLS.find((x) => x.coverage === 'none' && x.operator))
  assert.ok('operator' in ind)
})
