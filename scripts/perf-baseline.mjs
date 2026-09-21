#!/usr/bin/env node
// ============================================================
// Rumbo — perf-baseline.mjs  (RUM-001)
//
// Times the database half of the baseline: every RPC and lookup a dashboard
// navigation makes, run N times each, reported as p50/p75/p95 with rows
// returned and payload size. Optionally prints EXPLAIN (ANALYZE, BUFFERS) for
// the slowest ones and a pg_stat_statements top-N.
//
// READ-ONLY BY CONSTRUCTION. The probe list below is fixed and every entry is a
// SELECT; there is no way to pass arbitrary SQL in. The functions it calls are
// the same ones the app calls on every page load, so running this is exactly as
// safe as opening the Dashboard. Nothing here writes, and there is no DDL.
//
// !! It runs against the live project. There is no staging copy. !!
//
// RLS: the Management API connects as `postgres`, which BYPASSES row-level
// security, so the default numbers are a floor — the app pays RLS predicates on
// top. Pass --user=<auth-user-uuid> to run as `authenticated` with that user's
// JWT claims set, which is what the app actually does. Always report which mode
// produced a number.
//
// Usage:
//   node scripts/perf-baseline.mjs --household=<uuid>
//   node scripts/perf-baseline.mjs --household=<uuid> --user=<uuid>   # with RLS
//   node scripts/perf-baseline.mjs --household=<uuid> --runs=10
//   node scripts/perf-baseline.mjs --household=<uuid> --explain
//   node scripts/perf-baseline.mjs --household=<uuid> --stat-statements
//   node scripts/perf-baseline.mjs --household=<uuid> --json
//
// Env: SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF (or supabase/.temp/project-ref),
//      SUPABASE_TEST_HOUSEHOLD_ID (same as --household)
// ============================================================

import { apiContext, fail, log, runScript, runSql } from './lib/supabase-api.mjs'

const HOUSEHOLD = '__HOUSEHOLD_ID__'
const MONTH = '__MONTH__'

// Every probe is a SELECT and every one mirrors a call the app makes. `where`
// names the call site so a slow row leads straight back to the code.
const PROBES = [
  {
    name: 'rpc:get_account_balances (today)',
    where: 'dashboard/page.tsx:276 · accounts/page.tsx:730 · net-worth/page.tsx:288',
    sql: `select * from get_account_balances('${HOUSEHOLD}'::uuid, current_date)`,
  },
  {
    name: 'rpc:get_monthly_dashboard_summary',
    where: 'dashboard/page.tsx:280 and :293 (twice per load)',
    sql: `select * from get_monthly_dashboard_summary('${HOUSEHOLD}'::uuid, '${MONTH}'::date)`,
  },
  {
    name: 'rpc:get_monthly_expenses_by_category',
    where: 'dashboard/page.tsx:284',
    sql: `select * from get_monthly_expenses_by_category('${HOUSEHOLD}'::uuid, '${MONTH}'::date)`,
  },
  {
    name: 'rpc:get_monthly_budget_details',
    where: 'dashboard/page.tsx:301',
    sql: `select * from get_monthly_budget_details('${HOUSEHOLD}'::uuid, '${MONTH}'::date)`,
  },
  {
    name: 'rpc:search_household_transactions (page 1)',
    where: 'transactions/page.tsx:721 · PAGE_SIZE 50',
    // Every null is cast: PostgreSQL cannot infer a bare null's type for an
    // array parameter, and an uncast one fails to resolve the signature.
    sql: `select * from search_household_transactions(
            '${HOUSEHOLD}'::uuid,
            '${MONTH}'::date,
            (date_trunc('month', '${MONTH}'::date) + interval '1 month - 1 day')::date,
            null::text[], null::text[], null::text, null::text,
            null::uuid[], null::uuid[], null::uuid[], null::uuid[],
            50, 0)`,
  },
  {
    name: 'from:accounts (lookup)',
    where: 'transactions/page.tsx:602',
    sql: `select id, name from accounts where household_id = '${HOUSEHOLD}'::uuid`,
  },
  {
    name: 'from:categories (lookup)',
    where: 'dashboard/page.tsx:288 · transactions/page.tsx:610',
    sql: `select id, name from categories where household_id = '${HOUSEHOLD}'::uuid`,
  },
  {
    name: 'from:payees (lookup)',
    where: 'transactions/page.tsx:620',
    sql: `select id, name from payees where household_id = '${HOUSEHOLD}'::uuid`,
  },
  {
    name: 'from:tags (lookup)',
    where: 'transactions/page.tsx:628',
    sql: `select id, name from tags where household_id = '${HOUSEHOLD}'::uuid`,
  },
]

const KNOWN_FLAGS = new Set(['household', 'user', 'runs', 'month', 'explain', 'stat-statements', 'json'])

function parseArgs(argv) {
  const options = { runs: 7, json: false, explain: false, statStatements: false }
  for (const token of argv) {
    const match = token.match(/^--([a-z-]+)(?:=(.*))?$/)
    if (!match || !KNOWN_FLAGS.has(match[1])) {
      fail(
        `Unrecognised argument: ${token}\n` +
          '  Usage: node scripts/perf-baseline.mjs --household=<uuid> [--user=<uuid>]\n' +
          '         [--runs=N] [--month=YYYY-MM-DD] [--explain] [--stat-statements] [--json]',
      )
    }
    const [, flag, value] = match
    if (flag === 'json') options.json = true
    else if (flag === 'explain') options.explain = true
    else if (flag === 'stat-statements') options.statStatements = true
    else if (flag === 'runs') options.runs = Number.parseInt(value, 10)
    else if (flag === 'household') options.household = value
    else if (flag === 'user') options.user = value
    else if (flag === 'month') options.month = value
  }

  options.household ??= process.env.SUPABASE_TEST_HOUSEHOLD_ID
  if (!options.household) {
    fail(
      'A household is required.\n' +
        '  node scripts/perf-baseline.mjs --household=<uuid>\n' +
        '  or set SUPABASE_TEST_HOUSEHOLD_ID.',
    )
  }
  for (const [flag, value] of [['household', options.household], ['user', options.user]]) {
    if (value && !/^[0-9a-f-]{36}$/i.test(value)) fail(`--${flag} must be a UUID, got: ${value}`)
  }
  if (!Number.isFinite(options.runs) || options.runs < 1 || options.runs > 100) {
    fail('--runs must be between 1 and 100.')
  }
  options.month ??= new Date().toISOString().slice(0, 8) + '01'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(options.month)) fail('--month must be YYYY-MM-DD.')

  return options
}

/** Wraps a probe so RLS applies, when the caller supplied a user. */
function asRole(sql, options) {
  if (!options.user) return sql
  const claims = JSON.stringify({ sub: options.user, role: 'authenticated' })
  return `set local role authenticated;
set local request.jwt.claims = '${claims}';
${sql}`
}

function fill(sql, options) {
  return sql.split(HOUSEHOLD).join(options.household).split(MONTH).join(options.month)
}

function percentile(values, p) {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const position = p * (sorted.length - 1)
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  if (lower === upper) return sorted[lower]
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower)
}

const ms = (value) => (value == null ? '—' : `${value.toFixed(0)} ms`)

/**
 * EXPLAIN output quotes the literals a plan filtered on. The household UUID is
 * the operator's own, but transaction descriptions and payee names are not, so
 * anything quoted is masked before it can reach a terminal, a log or a doc.
 */
function redactPlan(text) {
  return String(text)
    .replace(/'[^']*'::(text|character varying|varchar)/g, "'<redacted>'::text")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<uuid>')
}

async function timeProbe(context, probe, options) {
  const sql = fill(probe.sql, options)
  const durations = []
  let rows = null
  let failure = null

  for (let run = 0; run < options.runs; run += 1) {
    const startedAt = performance.now()
    try {
      const result = await runSql(context, asRole(sql, options), { throwOnError: true })
      durations.push(performance.now() - startedAt)
      if (rows == null) rows = Array.isArray(result) ? result.length : null
    } catch (error) {
      failure = error.message
      break
    }
  }

  return {
    name: probe.name,
    where: probe.where,
    failure,
    rows,
    runs: durations.length,
    // The first run pays for a cold plan and a cold cache; keep it, but report
    // it separately so it cannot quietly inflate the percentiles.
    coldMs: durations[0] ?? null,
    p50: percentile(durations.slice(1), 0.5) ?? percentile(durations, 0.5),
    p75: percentile(durations.slice(1), 0.75) ?? percentile(durations, 0.75),
    p95: percentile(durations.slice(1), 0.95) ?? percentile(durations, 0.95),
    maxMs: durations.length > 0 ? Math.max(...durations) : null,
  }
}

async function explainProbe(context, probe, options) {
  const sql = `explain (analyze, buffers, format text) ${fill(probe.sql, options)}`
  try {
    const result = await runSql(context, asRole(sql, options), { throwOnError: true })
    return redactPlan(result.map((row) => Object.values(row)[0]).join('\n'))
  } catch (error) {
    return `EXPLAIN failed: ${error.message}`
  }
}

async function statStatements(context) {
  const sql = `
    select calls,
           round(total_exec_time::numeric, 1) as total_ms,
           round(mean_exec_time::numeric, 2)  as mean_ms,
           round(max_exec_time::numeric, 2)   as max_ms,
           rows,
           shared_blks_hit, shared_blks_read,
           left(query, 90) as query
    from pg_stat_statements
    where query not ilike '%pg_stat_statements%'
    order by total_exec_time desc
    limit 15;`
  try {
    const rows = await runSql(context, sql, { throwOnError: true })
    return rows.map((row) => ({ ...row, query: redactPlan(row.query) }))
  } catch (error) {
    return { error: error.message }
  }
}

runScript(async () => {
  const options = parseArgs(process.argv.slice(2))
  const context = apiContext()

  const mode = options.user ? 'authenticated (RLS enforced)' : 'postgres (RLS BYPASSED — a floor)'

  const results = []
  for (const probe of PROBES) results.push(await timeProbe(context, probe, options))

  if (options.json) {
    const payload = { mode, month: options.month, runs: options.runs, results }
    if (options.statStatements) payload.statStatements = await statStatements(context)
    log(JSON.stringify(payload, null, 2))
    return
  }

  log(`Rumbo — database baseline (RUM-001)`)
  log(`  role   : ${mode}`)
  log(`  month  : ${options.month}`)
  log(`  runs   : ${options.runs} per probe (first reported separately as cold)`)
  log('')
  log(
    'probe'.padEnd(44) + 'rows'.padStart(7) + 'cold'.padStart(10) +
      'p50'.padStart(10) + 'p75'.padStart(10) + 'p95'.padStart(10),
  )
  log('-'.repeat(91))

  for (const result of results) {
    if (result.failure) {
      log(`${result.name.padEnd(44)}  FAILED: ${result.failure}`)
      continue
    }
    log(
      result.name.padEnd(44) +
        String(result.rows ?? '—').padStart(7) +
        ms(result.coldMs).padStart(10) +
        ms(result.p50).padStart(10) +
        ms(result.p75).padStart(10) +
        ms(result.p95).padStart(10),
    )
  }

  log('')
  log('Call sites:')
  for (const result of results) log(`  ${result.name.padEnd(44)} ${result.where}`)

  log('')
  log('These are database timings only: they exclude PostgREST, TLS, the network')
  log('between Vercel and Supabase, React rendering and the browser. Pair them with')
  log('a RUMBO_PERF=1 run to see the round-trip the app actually waits on.')

  if (options.explain) {
    const slowest = [...results]
      .filter((result) => result.p75 != null)
      .sort((a, b) => b.p75 - a.p75)
      .slice(0, 5)
    for (const result of slowest) {
      const probe = PROBES.find((entry) => entry.name === result.name)
      log(`\n${'='.repeat(78)}\nEXPLAIN (ANALYZE, BUFFERS) — ${result.name}\n${'='.repeat(78)}`)
      log(await explainProbe(context, probe, options))
    }
  }

  if (options.statStatements) {
    log(`\n${'='.repeat(78)}\npg_stat_statements — top 15 by total time\n${'='.repeat(78)}`)
    const rows = await statStatements(context)
    if (rows.error) log(`unavailable: ${rows.error}`)
    else for (const row of rows) {
      log(`${String(row.calls).padStart(8)} calls · ${String(row.mean_ms).padStart(9)} ms mean · ${row.query}`)
    }
  }
})
