#!/usr/bin/env node
// Zero-dependency static server for the School Closures Watch app. Serves only files inside app/.
// Usage: node app/serve.mjs [--port 8201] [--host 127.0.0.1]
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('.', import.meta.url))
const args = process.argv.slice(2)
const arg = (name, fallback) => {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}
const PORT = Number(arg('--port', process.env.PORT || 8201))
const HOST = arg('--host', '127.0.0.1')

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
}

const NOT_FOUND = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Not found · School Closures Watch</title>
<link rel="stylesheet" href="/app.css"></head><body><main class="wrap">
<h1 class="page-title">Page not found</h1><p class="lead">There's nothing at this address.</p>
<p><a class="button" href="/">Go to My schools</a></p></main></body></html>`

// Test and tool files are not part of the app.
const HIDDEN = /^(tests|test-results|playwright-report)(\/|$)|^(serve\.mjs|playwright\.config\.mjs|mock\/build\.mjs)$/

function send(res, status, type, body) {
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  })
  res.end(body)
}

async function handle(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return send(res, 405, 'text/plain; charset=utf-8', 'Method not allowed')
  }
  let path
  try {
    path = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  } catch {
    return send(res, 400, 'text/plain; charset=utf-8', 'Bad request')
  }
  if (path.includes('\0')) return send(res, 400, 'text/plain; charset=utf-8', 'Bad request')
  if (path.endsWith('/')) path += 'index.html'
  const rel = normalize(path).replace(/^([/\\])+/, '')
  const file = join(ROOT, rel)
  if (!file.startsWith(ROOT) || rel.split(sep).includes('..') || HIDDEN.test(rel.split(sep).join('/'))) {
    return send(res, 404, TYPES['.html'], NOT_FOUND)
  }
  try {
    const info = await stat(file)
    if (!info.isFile()) return send(res, 404, TYPES['.html'], NOT_FOUND) // no directory listings
    const body = await readFile(file)
    const type = TYPES[extname(file).toLowerCase()] || 'application/octet-stream'
    return send(res, 200, type, req.method === 'HEAD' ? undefined : body)
  } catch {
    return send(res, 404, TYPES['.html'], NOT_FOUND)
  }
}

createServer((req, res) => {
  handle(req, res).catch(() => send(res, 500, 'text/plain; charset=utf-8', 'Server error'))
}).listen(PORT, HOST, () => {
  console.log(`School Closures Watch app on http://${HOST}:${PORT}/`)
})
