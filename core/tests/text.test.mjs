import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normText, decodeEntities, extractText, fnv1a8, clip, normName, normCommunity, wordTokens } from '../text.js'
import { sample } from './helpers.mjs'

test('normText: whitespace runs (NBSP, tabs, newlines) → one space, trimmed', () => {
  assert.equal(normText('  a  b\t\nc  '), 'a b c')
  assert.equal(normText(null), '')
})

test('decodeEntities: every named entity in §0, numeric, unknown kept', () => {
  const named =
    '&amp;&lt;&gt;&quot;&apos;&nbsp;&ndash;&mdash;&lsquo;&rsquo;&ldquo;&rdquo;&hellip;&eacute;&egrave;&agrave;&ecirc;&ccedil;&ocirc;&icirc;&laquo;&raquo;'
  assert.equal(decodeEntities(named), '&<>"\' –—‘’“”…éèàêçôî«»')
  assert.equal(decodeEntities('l&#8217;école &#x2019; &#233;'), 'l’école ’ é')
  assert.equal(decodeEntities('&copy; &bogus;'), '&copy; &bogus;')
})

test('extractText: drops script/style/comments, unwraps CDATA, tags → space, decodes twice', () => {
  const body = '<script>var x = "<b>no</b>"</script><style>p{}</style><!-- hidden --><p>Qui&amp;#8217;a</p><![CDATA[<i>in</i> side]]><br/>x'
  assert.equal(extractText(body), 'Qui’a in side x')
  assert.equal(extractText(sample('nlschools/newspostings_5-2026-09-14-empty.html')), '')
})

test('extractText of the real fragment keeps each row readable', () => {
  const t = extractText(sample('nlschools/schoolstatus-2026-09-14T1640Z.html'))
  assert.ok(t.includes('Glovertown Academy Glovertown, NL CLOSED ALL DAY School closed all day NOTE: Water Shut Off FOS 05 CENTRAL'))
})

test('fnv1a8: FNV-1a 32-bit over UTF-8 bytes', () => {
  assert.equal(fnv1a8(''), '811c9dc5')
  assert.equal(fnv1a8('a'), 'e40c292c')
  assert.equal(fnv1a8('foobar'), 'bf9cf968')
  // UTF-8, not UTF-16: an independent byte-wise computation
  const ref = (s) => {
    let h = 0x811c9dc5
    for (const b of Buffer.from(s, 'utf8')) {
      h ^= b
      h = Math.imul(h, 0x01000193) >>> 0
    }
    return h.toString(16).padStart(8, '0')
  }
  assert.equal(fnv1a8('École Boréale'), ref('École Boréale'))
  assert.notEqual(fnv1a8('é'), fnv1a8('é'.normalize('NFD')))
})

test('clip: cut on a word boundary, still a substring', () => {
  const s = 'one two three four five'
  assert.equal(clip(s, 10), 'one two')
  assert.ok(s.includes(clip(s, 10)))
  assert.equal(clip(s, 100), s)
})

test('normName / normCommunity (§4.2 examples)', () => {
  assert.equal(normName("St. Mark's School"), 'st marks school')
  assert.equal(normName('École Boréale'), 'ecole boreale')
  assert.equal(normName('Holy Trinity & St. Mary’s'), 'holy trinity and st marys')
  assert.equal(normCommunity("St.John's"), 'st johns')
  assert.equal(normCommunity("St. John's, NL"), 'st johns')
  assert.equal(normCommunity('Burin Bay Arm,'), 'burin bay arm')
  assert.equal(normCommunity('Corner Brook nl'), 'corner brook')
  assert.equal(normCommunity('Happy Valley-Goose Bay, NL'), normCommunity('Happy Valley - Goose Bay'))
})

test('wordTokens spans slice back to the original text', () => {
  const s = 'All Schools in the  CENTRAL Region'
  const t = wordTokens(s)
  assert.deepEqual(
    t.map((x) => x.norm),
    ['all', 'schools', 'in', 'the', 'central', 'region'],
  )
  assert.equal(s.slice(t[4].start, t[5].end), 'CENTRAL Region')
})
