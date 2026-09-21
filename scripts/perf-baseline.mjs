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
// --user IS EFFECTIVELY REQUIRED. The Management API connects as `postgres`,
// which bypasses row-level security — but every RPC here checks
// `is_household_member()` in its own body and RAISEs, so as `postgres` they do
// not run at all; they fail with "Not authorized to read ... for this
// household". (Household isolation is enforced twice over: in the policy and in
// the function. Verified 2026-09-21.) Only the plain table lookups will produce
// a number without --user, and that number has no RLS predicate in it.
//
// Pass --user=<auth-user-uuid> to run as `authenticated` with that user's JWT
// claims set, which is what the app actually does. Always report the mode.
//
// Usage:
//   node scripts/perf-baseline.mjs --household=<uuid>
//   node scripts/perf-baseline.mjs --household=<uuid> --user=<uuid>   # with RLS
//   node scripts/perf-baseline.mjs --household=<uuid> --runs=10
//   node scripts/perf-baseline.mjs --household=<uuid> --explain
//   node scripts/perf-baseline.mjs --household=<uuid> --stat-statements
//   node scripts/perf-baseline.mjs --household=<uuid> --json
//   node scripts/perf-baseline.mjs --household=<uuid> --pace=500   # if 429s persist
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
    // Not a query: `select 1` measures what every other row below also pays —
    // HTTPS to api.supabase.com, auth, connection, and the API's own overhead.
    // Subtract this from every other probe to get the query's real cost. Without
    // it a 270 ms lookup of 26 rows reads as a slow query when it is in fact a
    // fast query behind a slow transport, and the whole table is misleading.
    name: 'TRANSPORT FLOOR (select 1)',
    where: 'not a call site — the measurement overhead of this harness',
    sql: `select 1 as one`,
  },
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
    name: 'rpc:search_household_transactions (one month)',
    where: 'transactions/page.tsx:721 · PAGE_SIZE 50 · default period',
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
    // The month probe above only proves the month case. RUM-004's premise is
    // about YEARS of data, so this pages the household's whole history: no
    // lower bound, a full 50-row page. Without it, "Transactions is fast"
    // is a claim about September, not about the 4.25 s in the recording.
    name: 'rpc:search_household_transactions (ALL TIME, page 1)',
    where: 'transactions/page.tsx:721 with period=all-time',
    sql: `select * from search_household_transactions(
            '${HOUSEHOLD}'::uuid,
            '1900-01-01'::date, current_date,
            null::text[], null::text[], null::text, null::text,
            null::uuid[], null::uuid[], null::uuid[], null::uuid[],
            50, 0)`,
  },
  {
    // OFFSET pagination degrades with depth: the database still walks the rows
    // it skips. This is the worst case a real user can reach by scrolling.
    name: 'rpc:search_household_transactions (ALL TIME, offset 4000)',
    where: 'transactions/page.tsx:719 — deep pagination',
    sql: `select * from search_household_transactions(
            '${HOUSEHOLD}'::uuid,
            '1900-01-01'::date, current_date,
            null::text[], null::text[], null::text, null::text,
            null::uuid[], null::uuid[], null::uuid[], null::uuid[],
            50, 4000)`,
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

const KNOWN_FLAGS = new Set([
  'household', 'user', 'runs', 'month', 'explain', 'stat-statements', 'json', 'pace',
])

/**
 * The Management API throttles, and a tight loop of probes trips it — the last
 * two probes of a 15-run pass came back 429. A pause between calls keeps the
 * run under the limit; it costs wall-clock time and nothing else, because each
 * probe is timed individually.
 */
const sleep = (durationMs) => new Promise((resolve) => setTimeout(resolve, durationMs))

/**
 * The API answers 429 for a while once the per-token budget is spent, and a run
 * that reports "FAILED: 429" for every probe tells you nothing about the
 * database. Backs off and retries so a throttled run finishes late instead of
 * finishing wrong.
 *
 * A retried call's own duration is discarded by the caller, never averaged in:
 * waiting on a rate limit is not query time.
 */
async function withRetry(task, { attempts = 5, baseDelayMs = 4_000 } = {}) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await task()
    } catch (error) {
      const throttled = /429|ThrottlerException|Too Many Requests/i.test(error.message)
      if (!throttled || attempt >= attempts - 1) throw error
      await sleep(baseDelayMs * 2 ** attempt)
    }
  }
}

function parseArgs(argv) {
  const options = { runs: 7, pace: 250, json: false, explain: false, statStatements: false }
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
    else if (flag === 'pace') options.pace = Number.parseInt(value, 10)
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
  if (!Number.isFinite(options.pace) || options.pace < 0 || options.pace > 10_000) {
    fail('--pace must be between 0 and 10000 (milliseconds between calls).')
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
    if (run > 0 && options.pace > 0) await sleep(options.pace)

    let throttled = false
    const startedAt = performance.now()
    try {
      const result = await withRetry(async () => {
        try {
          return await runSql(context, asRole(sql, options), { throwOnError: true })
        } catch (error) {
          throttled = true
          throw error
        }
      })
      // A sample that had to wait on a 429 measures the rate limiter, not the
      // query, so it is dropped rather than folded into the percentiles.
      if (!throttled) durations.push(performance.now() - startedAt)
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

/**
 * PostgREST wraps every call in the same `WITH pgrst_source AS (...)` preamble,
 * so a truncated `query` column is 90 identical characters for a dozen
 * different RPCs. This pulls the actual target — `rpc:<fn>` or `from:<table>` —
 * out of the statement text so the top-N is readable.
 */
async function statStatements(context) {
  const sql = `
    select calls,
           round(total_exec_time::numeric, 1) as total_ms,
           round(mean_exec_time::numeric, 2)  as mean_ms,
           rows,
           shared_blks_hit,
           coalesce(
             'rpc:'  || substring(query from '"public"\\."([a-z_]+)"\\('),
             'from:' || substring(query from 'FROM "public"\\."([a-z_]+)"'),
             left(regexp_replace(query, '\\s+', ' ', 'g'), 60)
           ) as target
    from pg_stat_statements
    where query not ilike '%pg_stat_statements%'
      and query not ilike '%pg_timezone_names%'
      and query not ilike '%pg_walfile_name_offset%'
    order by total_exec_time desc
    limit 20;`
  try {
    const rows = await runSql(context, sql, { throwOnError: true })
    return rows.map((row) => ({ ...row, target: redactPlan(row.target) }))
  } catch (error) {
    return { error: error.message }
  }
}

runScript(async () => {
  const options = parseArgs(process.argv.slice(2))
  const context = apiContext()

  const mode = options.user
    ? 'authenticated (RLS enforced)'
    : 'postgres — RPC probes WILL FAIL, they check membership themselves'

  const results = []
  for (const probe of PROBES) {
    results.push(await timeProbe(context, probe, options))
    if (options.pace > 0) await sleep(options.pace)
  }

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
      const notMember = /Not authorized to read/i.test(result.failure)
      const reason = notMember && !options.user
        ? 'needs --user: the function checks household membership itself'
        : result.failure
      log(`${result.name.padEnd(44)}  FAILED: ${reason}`)
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

  const floor = results.find((result) => result.name.startsWith('TRANSPORT FLOOR'))
  if (floor?.p50 != null) {
    log('')
    log(`Net of the ${floor.p50.toFixed(0)} ms transport floor (p50):`)
    log('')
    log('probe'.padEnd(44) + 'p50 net'.padStart(10) + 'p75 net'.padStart(10) + '× floor'.padStart(10))
    log('-'.repeat(74))
    for (const result of results) {
      if (result === floor || result.p50 == null) continue
      log(
        result.name.padEnd(44) +
          `${Math.max(0, result.p50 - floor.p50).toFixed(0)} ms`.padStart(10) +
          `${Math.max(0, (result.p75 ?? 0) - floor.p50).toFixed(0)} ms`.padStart(10) +
          `${(result.p50 / floor.p50).toFixed(2)}×`.padStart(10),
      )
    }
  }

  log('')
  log('These are database timings only: they exclude PostgREST, TLS, the network')
  log('between Vercel and Supabase, React rendering and the browser. Pair them with')
  log('a RUMBO_PERF=1 run to see the round-trip the app actually waits on.')

  if (options.explain) {
    const slowest = [...results]
      .filter((result) => result.p75 != null && !result.name.startsWith('TRANSPORT FLOOR'))
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
    if (rows.error) {
      log(`unavailable: ${rows.error}`)
    } else {
      log(
        'target'.padEnd(42) + 'calls'.padStart(8) + 'mean'.padStart(11) +
          'total'.padStart(12) + 'buffers/call'.padStart(14),
      )
      log('-'.repeat(87))
      for (const row of rows) {
        const perCall = row.calls > 0 ? Math.round(row.shared_blks_hit / row.calls) : 0
        log(
          String(row.target).slice(0, 41).padEnd(42) +
            String(row.calls).padStart(8) +
            `${row.mean_ms} ms`.padStart(11) +
            `${Math.round(row.total_ms / 1000)} s`.padStart(12) +
            String(perCall).padStart(14),
        )
      }
    }
  }
})
