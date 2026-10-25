// A minimal stand-in for Supabase, so the real entry form can be driven in a
// browser with no database and no credentials (`npm run e2e:entry`).
//
// Auth: GET /auth/v1/user always answers with the fixture user. PostgREST:
// GET on a table returns its fixture rows (eq.* filters only), POST /rpc/*
// answers the RPCs the form calls. Every request is appended as one JSON line
// to LOG, so a scenario can count the writes it caused.
//
// `create_manual_transaction` with an amount of exactly 999 fails on purpose:
// that is how a scenario gets a rejected save.
import http from 'node:http'
import fs from 'node:fs'

// Accounts and categories are shared with the /e2e/entry harness page.
const shared = JSON.parse(fs.readFileSync(new URL('./fixtures.json', import.meta.url), 'utf8'))

const PORT = Number(process.env.PORT ?? 54321)
const LOG = process.env.LOG ?? 'e2e/entry/.mock-supabase.log'
const LATENCY = Number(process.env.LATENCY ?? 40) // ms per request (network)
const RPC_LATENCY = Number(process.env.RPC_LATENCY ?? 250) // ms for create rpc

const user = {
  id: 'u1',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'qa@example.com',
  app_metadata: {},
  user_metadata: {},
  created_at: '2026-01-01T00:00:00Z',
}

const fixtures = {
  profiles: [{ id: 'u1', default_household_id: 'h1', display_name: 'QA', ui_preferences: null }],
  households: [{ id: 'h1', name: 'QA', base_currency: 'CAD' }],
  accounts: shared.accounts,
  categories: shared.categories,
  payees: [{ id: 'p1', name: 'High Point' }],
  tags: Array.from({ length: 14 }, (_, i) => ({ id: `t${i}`, name: `tag-${String(i).padStart(2, '0')}`, color: null })),
  currencies: [{ code: 'CAD' }, { code: 'COP' }, { code: 'USD' }],
  transactions: [],
}

let txCounter = 0
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function log(entry) {
  fs.appendFileSync(LOG, JSON.stringify({ at: Date.now(), ...entry }) + '\n')
}

function filterRows(rows, params) {
  let out = rows
  for (const [key, raw] of params) {
    if (['select', 'order', 'limit', 'offset'].includes(key)) continue
    const m = /^eq\.(.*)$/.exec(raw)
    if (m) out = out.filter((row) => !(key in row) || String(row[key]) === m[1])
  }
  return out
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`)
  let body = ''
  for await (const chunk of req) body += chunk
  await sleep(LATENCY)

  const send = (status, data) => {
    res.writeHead(status, {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
    })
    res.end(data === undefined ? '' : JSON.stringify(data))
  }

  if (url.pathname === '/auth/v1/user') {
    log({ kind: 'auth.user' })
    return send(200, user)
  }

  const rpc = /^\/rest\/v1\/rpc\/([a-z0-9_]+)$/.exec(url.pathname)
  if (rpc) {
    const fn = rpc[1]
    log({ kind: 'rpc', fn, body: body.slice(0, 800) })
    if (fn === 'create_manual_transaction') {
      await sleep(RPC_LATENCY)
      if (/"p_amount":999\b/.test(body)) return send(400, { message: 'forced failure', code: 'P0001' })
      txCounter += 1
      return send(200, `tx-${txCounter}`)
    }
    if (fn === 'change_transaction_type') return send(200, 'tx-retyped')
    if (fn === 'is_household_admin') return send(200, true)
    if (fn === 'get_or_create_payee') return send(200, 'p1')
    return send(200, null)
  }

  const table = /^\/rest\/v1\/([a-z_]+)$/.exec(url.pathname)
  if (table) {
    const name = table[1]
    log({ kind: req.method, table: name, query: url.search.slice(0, 200) })
    if (req.method === 'GET' || req.method === 'HEAD') {
      const rows = filterRows(fixtures[name] ?? [], url.searchParams)
      const wantsObject = (req.headers.accept ?? '').includes('vnd.pgrst.object')
      if (wantsObject) return rows[0] ? send(200, rows[0]) : send(406, { message: 'no rows' })
      return send(200, rows)
    }
    return send(200, [])
  }

  log({ kind: 'unknown', method: req.method, path: url.pathname })
  send(404, { message: 'not mocked' })
})

server.listen(PORT, '127.0.0.1', () => console.log(`mock supabase on ${PORT}`))
