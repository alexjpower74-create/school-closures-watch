// Shared page chrome: a tiny DOM builder (text only, never innerHTML with data), status icons, header, stale banner.
import { href, isMock } from './params.js'

export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag)
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue
    if (k === 'class') node.className = v
    else if (k === 'text') node.textContent = v
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v)
    else node.setAttribute(k, v === true ? '' : String(v))
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue
    node.append(c instanceof Node ? c : String(c))
  }
  return node
}

/** Replace a node's children, flattening arrays and skipping null/false (replaceChildren does neither). */
export function put(node, ...children) {
  const kids = children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false)
  Element.prototype.replaceChildren.call(node, ...kids.map((c) => (c instanceof Node ? c : String(c))))
}

const SVG_NS = 'http://www.w3.org/2000/svg'

function svg(size, shapes, cls) {
  const root = document.createElementNS(SVG_NS, 'svg')
  root.setAttribute('viewBox', '0 0 24 24')
  root.setAttribute('width', String(size))
  root.setAttribute('height', String(size))
  root.setAttribute('aria-hidden', 'true')
  root.setAttribute('focusable', 'false')
  root.setAttribute('fill', 'none')
  root.setAttribute('stroke', 'currentColor')
  root.setAttribute('stroke-width', '2.2')
  root.setAttribute('stroke-linecap', 'round')
  root.setAttribute('stroke-linejoin', 'round')
  if (cls) root.setAttribute('class', cls)
  for (const [tag, attrs] of shapes) {
    const s = document.createElementNS(SVG_NS, tag)
    for (const [k, v] of Object.entries(attrs)) s.setAttribute(k, String(v))
    root.append(s)
  }
  return root
}

const CIRCLE = ['circle', { cx: 12, cy: 12, r: 9 }]
const BUS = [
  ['rect', { x: 4, y: 3.5, width: 16, height: 13, rx: 2.5 }],
  ['path', { d: 'M4 10.5h16' }],
  ['circle', { cx: 8, cy: 19.5, r: 1.6 }],
  ['circle', { cx: 16, cy: 19.5, r: 1.6 }],
]
const QUESTION = [
  ['path', { d: 'M9.6 9.3a2.6 2.6 0 1 1 3.6 2.4c-.8.3-1.2 1-1.2 1.8v.3' }],
  ['path', { d: 'M12 16.8v.2' }],
]

const ICONS = {
  closed: [CIRCLE, ['path', { d: 'M8.6 8.6l6.8 6.8M15.4 8.6l-6.8 6.8' }]],
  closed_part: [CIRCLE, ['path', { d: 'M12 3a9 9 0 0 1 0 18z', fill: 'currentColor' }]],
  buses_cancelled: [...BUS, ['path', { d: 'M2.5 2.5l19 19' }]],
  early_dismissal: [CIRCLE, ['path', { d: 'M12 7v5h-4' }], ['path', { d: 'M15 15l2 2' }]],
  delayed: [CIRCLE, ['path', { d: 'M12 7v5l3.2 2' }]],
  buses_delayed: [...BUS, ['path', { d: 'M12 13.5v0' }]],
  other: [CIRCLE, ['path', { d: 'M12 11v5.5' }], ['path', { d: 'M12 7.6v.2' }]],
  may_apply: [['circle', { cx: 12, cy: 12, r: 9, 'stroke-dasharray': '3.2 3' }], ...QUESTION],
  unknown: [CIRCLE, ...QUESTION],
  open: [CIRCLE, ['path', { d: 'M7.8 12.4l2.9 2.9 5.5-6.1' }]],
}

export function statusIcon(code, size = 24) {
  return svg(size, ICONS[code] || ICONS.other, 'status-icon')
}

function wordmarkIcon() {
  return svg(30, [
    ['path', { d: 'M3 11l9-7 9 7' }],
    ['path', { d: 'M5.5 9.5V20h13V9.5' }],
    ['path', { d: 'M10 20v-5h4v5' }],
  ], 'wordmark-icon')
}

const NAV = [
  ['my', 'My schools', 'index.html'],
  ['today', 'Today', 'today.html'],
  ['sources', 'Sources', 'sources.html'],
]

/** Header (wordmark + nav) into #chrome. */
export function mountChrome(active) {
  const chrome = document.getElementById('chrome')
  chrome.className = 'site-header'
  put(chrome, 
    el(
      'div',
      { class: 'wrap header-inner' },
      el(
        'a',
        { class: 'wordmark', href: href('index.html') },
        wordmarkIcon(),
        el('span', { class: 'wordmark-text' }, 'School Closures Watch'),
      ),
      el(
        'nav',
        { class: 'nav', 'aria-label': 'Main' },
        NAV.map(([key, label, path]) =>
          el('a', { class: 'nav-link', href: href(path), 'aria-current': key === active ? 'page' : null }, label),
        ),
      ),
    ),
    isMock
      ? el('p', { class: 'wrap mock-note' }, 'Test data: these notices are samples, not today’s real list.')
      : null,
  )
}

/**
 * Stale banner (API.md §8.3) at the very top of the page: every used source with stale: true, its stale_text and a
 * link to the official page. Not dismissible.
 */
export function renderStale(sources) {
  const box = document.getElementById('stale')
  if (!box) return
  const stale = (sources || []).filter((s) => s && s.kind === 'used' && s.stale)
  if (stale.length === 0) {
    put(box)
    return
  }
  put(box, 
    el(
      'div',
      { class: 'stale-banner', role: 'alert', 'data-testid': 'stale-banner' },
      el(
        'div',
        { class: 'wrap' },
        stale.map((s) =>
          el(
            'div',
            { class: 'stale-item' },
            el('p', { class: 'stale-text' }, s.stale_text || `We couldn't check ${s.name} recently.`),
            s.human_url ? el('a', { class: 'stale-link', href: s.human_url, rel: 'noopener' }, `Open ${s.name}`) : null,
          ),
        ),
      ),
    ),
  )
}

/** A plain error card with a Try again button. */
export function errorCard(message, retry) {
  return el(
    'section',
    { class: 'card error-card', role: 'status' },
    el('h2', { class: 'card-title' }, 'We couldn’t load this page'),
    el('p', {}, message),
    el('p', {}, 'Check nlschools.ca directly or call the school.'),
    retry ? el('button', { class: 'button', type: 'button', onclick: retry }, 'Try again') : null,
  )
}

export function main() {
  return document.getElementById('main')
}
