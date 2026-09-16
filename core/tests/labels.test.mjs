import { test } from 'node:test'
import assert from 'node:assert/strict'
import { STATUSES, statusFromRow, statusFromPhrases, findRegionPhrase, hasCsfpWord, CLASS_STATUS } from '../labels.js'

test('§4.1 table: codes, labels and ranks', () => {
  assert.deepEqual(
    STATUSES.map((s) => [s.code, s.label, s.rank]),
    [
      ['closed', 'Closed', 1],
      ['closed_part', 'Closed part of the day', 2],
      ['buses_cancelled', 'Buses cancelled', 3],
      ['early_dismissal', 'Closing early', 4],
      ['delayed', 'Delayed opening', 5],
      ['buses_delayed', 'Buses delayed', 6],
      ['other', 'Other notice, read it', 7],
      ['may_apply', 'A notice may apply', 8],
      ['unknown', 'Unknown', 9],
      ['open', 'Open, no notice', 10],
    ],
  )
})

test('§4.1 NLSchools classes decide the status', () => {
  const want = {
    closedAllDay: 'closed',
    closedForPD: 'closed',
    closedForHoliday: 'closed',
    closedForMorning: 'closed_part',
    closedForAfternoon: 'closed_part',
    closingEarly: 'early_dismissal',
    delayedOpening: 'delayed',
    busDelayed: 'buses_delayed',
    otherStatus: 'other',
  }
  assert.deepEqual(CLASS_STATUS, want)
  for (const [cls, code] of Object.entries(want)) {
    assert.deepEqual(statusFromRow(cls, 'whatever'), { status: code, status_basis: 'class', status_evidence: cls, unmapped_class: null })
  }
  // The class wins over the words: Eastside's "OTHER STATUS" with a bus note is never buses_delayed
  assert.equal(statusFromRow('otherStatus', 'BUSES DELAYED').status, 'other')
})

test('§4.1 STATUS text only when the class is not in the table; unmapped classes reported', () => {
  const t = (text) => statusFromRow('snowDay', text)
  assert.equal(t('CLOSED ALL DAY').status, 'closed')
  assert.equal(t('CLOSED FOR HOLIDAY').status, 'closed')
  assert.equal(t('CLOSED FOR AFTERNOON').status, 'closed_part')
  assert.equal(t('SAMPLE BUS RUNS CANCELED').status, 'buses_cancelled')
  assert.equal(t('EARLY DISMISSAL').status, 'early_dismissal')
  assert.equal(t('DELAYED OPENING').status, 'delayed')
  assert.equal(t('SAMPLE BUSES DELAYED').status, 'buses_delayed')
  assert.deepEqual(t('CLOSED ALL DAY'), {
    status: 'closed',
    status_basis: 'status_text',
    status_evidence: 'CLOSED ALL DAY',
    unmapped_class: 'snowDay',
  })
  assert.deepEqual(t('SAMPLE SNOW DAY'), { status: 'other', status_basis: 'none', status_evidence: null, unmapped_class: 'snowDay' })
  assert.equal(statusFromRow(null, 'SAMPLE SNOW DAY').unmapped_class, null)
})

test('§4.3 phrases: longest first, blanked spans, evidence verbatim', () => {
  assert.deepEqual(statusFromPhrases('SAMPLE All schools in the Central region are Closed for the Day'), {
    status: 'closed',
    status_basis: 'phrase',
    status_evidence: 'Closed for the Day',
  })
  assert.equal(statusFromPhrases('SAMPLE School closed for the morning').status, 'closed_part')
  assert.equal(statusFromPhrases('SAMPLE Delayed opening of two hours').status, 'delayed')
  assert.equal(statusFromPhrases('SAMPLE Busing cancelled in Gander').status, 'buses_cancelled')
  assert.equal(statusFromPhrases('SAMPLE The following runs will be delayed').status, 'buses_delayed')
  assert.equal(statusFromPhrases('SAMPLE Dismissing early at noon').status, 'early_dismissal')
  // two different codes → other
  assert.deepEqual(statusFromPhrases('SAMPLE Buses cancelled and schools closed today'), {
    status: 'other',
    status_basis: 'none',
    status_evidence: null,
  })
  // whole words only
  assert.equal(statusFromPhrases('SAMPLE Unclosed today-ish').status, 'other')
  assert.equal(statusFromPhrases('SAMPLE Nothing to see').status, 'other')
})

test('§4.4 region and province phrases', () => {
  assert.deepEqual(findRegionPhrase('SAMPLE All schools in the Central region are closed'), {
    scope: 'region',
    scope_region: 'central',
    scope_evidence: 'All schools in the Central region',
    ambiguous: false,
  })
  assert.equal(findRegionPhrase('SAMPLE All Central Region Schools').scope_evidence, 'All Central Region Schools')
  assert.equal(findRegionPhrase('SAMPLE all LABRADOR schools').scope_region, 'labrador')
  assert.equal(findRegionPhrase('SAMPLE Western region schools will open late').scope_region, 'western')
  assert.deepEqual(findRegionPhrase('SAMPLE All schools in the province are closed'), {
    scope: 'province',
    scope_region: null,
    scope_evidence: 'All schools in the province',
    ambiguous: false,
  })
  assert.equal(findRegionPhrase('SAMPLE Central Regional Office'), null)
  assert.equal(findRegionPhrase('SAMPLE Avalon school'), null)
  assert.equal(findRegionPhrase('SAMPLE all Central schools and all Western schools').ambiguous, true)
})

test('CSFP_WORDS select feed posts (accent-insensitive, whole words)', () => {
  assert.equal(hasCsfpWord("SAMPLE École Boréale fermée aujourd'hui en raison de la tempête"), true)
  assert.equal(hasCsfpWord('SAMPLE ouverture retardée'), true)
  // the CSFP transport rule says "fermer", which is not a closure word
  assert.equal(hasCsfpWord('la décision de fermer l’école'), false)
  assert.equal(hasCsfpWord('Portrait finissant.e.s 2026'), false)
})
