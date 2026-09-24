#!/usr/bin/env node
// ============================================================
// Rumbo — db-local.mjs (RUM-010b)
//
// The ledger invariants in supabase/tests/, run against GENERATED data in a
// throwaway local Postgres instead of production:
//
//   1. start a private PostgreSQL cluster in a temp dir (no Docker, no
//      Supabase CLI — only the stock server binaries);
//   2. apply supabase/local/supabase-shim.sql (API roles + auth.uid()), then
//      every file in supabase/migrations/ in order, unmodified;
//   3. load supabase/local/fixtures.sql: two households, ~3.5k transactions,
//      CAD/COP/USD/EUR, transfers, voids, refunds, pending, overpaid card,
//      archived and excluded accounts, missing FX — all through the app's RPCs
//      under RLS;
//   4. run every supabase/tests/*.sql for BOTH households, as a member — and
//      the `run-as=non-member` files as the OTHER household's owner and as a
//      user with no household at all;
//   5. run supabase/local/fixture-expectations.sql (checks tied to the fixture
//      shape: the edge cases really exist, and behave);
//   6. optionally (--bench) time the reporting RPCs as `authenticated`;
//   7. stop the cluster and delete it (unless --keep).
//
// Nothing here can touch the live project: it never reads Supabase
// credentials and only ever connects to the socket it just created.
//
// Usage:
//   npm run db:local                      # full suite, exit 1 on any failure
//   npm run db:local -- --bench           # + RPC timings (p50/p95) on fixtures
//   npm run db:local -- --keep            # leave the cluster running, print how to connect
//   npm run db:local -- --file=rum_010b   # only test files matching a substring
//   npm run db:local -- --port=54329
//
// Needs the PostgreSQL server binaries (initdb, pg_ctl, postgres) and psql.
// Found via PG_BIN, `pg_config --bindir`, or /usr/lib/postgresql/<v>/bin.
// ============================================================

import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, chownSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { fileDirectives, runFile, testFiles } from './db-test.mjs'

const MIGRATIONS_DIR = 'supabase/migrations'
const SHIM = 'supabase/local/supabase-shim.sql'
const FIXTURES = 'supabase/local/fixtures.sql'
const EXPECTATIONS = 'supabase/local/fixture-expectations.sql'
const DB = 'rumbo_local'

// Fixed ids from supabase/local/fixtures.sql.
const USERS = {
  a1: '00000000-0000-4000-a000-0000000000a1',
  b1: '00000000-0000-4000-a000-0000000000b1',
  outsider: '00000000-0000-4000-a000-0000000000ff',
}
const HOUSEHOLDS = [
  { label: 'A (CAD, 2 members, 4y)', id: '10000000-0000-4000-a000-00000000000a', member: USERS.a1, otherOwner: USERS.b1 },
  { label: 'B (COP, 1 member, 3y)', id: '10000000-0000-4000-a000-00000000000b', member: USERS.b1, otherOwner: USERS.a1 },
]

const log = (...args) => console.log(...args)

function parseArgs(argv) {
  const known = new Set(['keep', 'bench', 'file', 'port'])
  const options = {}
  for (const token of argv) {
    const match = token.match(/^--([a-z-]+)(?:=(.*))?$/)
    if (!match || !known.has(match[1])) {
      console.error(`Unrecognised argument: ${token}\n  Usage: node scripts/db-local.mjs [--bench] [--keep] [--file=<substring>] [--port=<n>]`)
      process.exit(2)
    }
    options[match[1]] = match[2] ?? true
  }
  return options
}

// ── Postgres binaries ───────────────────────────────────────────────────────

function pgBinDir() {
  const candidates = []
  if (process.env.PG_BIN) candidates.push(process.env.PG_BIN)
  try {
    candidates.push(execFileSync('pg_config', ['--bindir'], { encoding: 'utf8' }).trim())
  } catch {
    // pg_config is often absent when only the server package is installed.
  }
  if (existsSync('/usr/lib/postgresql')) {
    for (const version of readdirSync('/usr/lib/postgresql').sort((a, b) => Number(b) - Number(a))) {
      candidates.push(`/usr/lib/postgresql/${version}/bin`)
    }
  }
  const found = candidates.find((dir) => existsSync(path.join(dir, 'initdb')) && existsSync(path.join(dir, 'pg_ctl')))
  if (!found) {
    console.error('Could not find the PostgreSQL server binaries (initdb, pg_ctl). Set PG_BIN=<dir>.')
    process.exit(2)
  }
  return found
}

// Postgres refuses to run as root. When we are root (a container), run the
// server as the `postgres` OS user instead; everywhere else, as ourselves.
function serverCommand(binary, args) {
  if (process.getuid?.() === 0) return ['runuser', ['-u', 'postgres', '--', binary, ...args]]
  return [binary, args]
}

function run(command, args, { input, quiet = false } = {}) {
  const result = spawnSync(command, args, { input, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || '').trim()
    throw new Error(`${path.basename(command)} ${args.slice(0, 3).join(' ')} … failed:\n${detail}`)
  }
  if (!quiet && result.stderr.trim()) process.stderr.write(result.stderr)
  return result.stdout
}

// ── Cluster lifecycle ───────────────────────────────────────────────────────

function startCluster(bin, port) {
  const dir = mkdtempSync(path.join(tmpdir(), 'rumbo-db-local-'))
  const data = path.join(dir, 'data')
  if (process.getuid?.() === 0) {
    chownSync(dir, Number(execFileSync('id', ['-u', 'postgres'], { encoding: 'utf8' })), Number(execFileSync('id', ['-g', 'postgres'], { encoding: 'utf8' })))
  }
  chmodSync(dir, 0o755)

  run(...serverCommand(path.join(bin, 'initdb'), ['-D', data, '-U', 'postgres', '--auth=trust', '-E', 'UTF8', '--locale=C']), { quiet: true })
  run(
    ...serverCommand(path.join(bin, 'pg_ctl'), [
      '-D', data, '-w', '-l', path.join(dir, 'postgres.log'),
      '-o', `-p ${port} -k ${dir} -c listen_addresses='' -c fsync=off -c synchronous_commit=off -c full_page_writes=off`,
      'start',
    ]),
    { quiet: true }
  )
  return { dir, data, port, socket: dir }
}

function stopCluster(bin, cluster) {
  try {
    run(...serverCommand(path.join(bin, 'pg_ctl'), ['-D', cluster.data, '-m', 'fast', '-w', 'stop']), { quiet: true })
  } finally {
    rmSync(cluster.dir, { recursive: true, force: true })
  }
}

// ── psql ────────────────────────────────────────────────────────────────────

function psqlArgs(cluster, database, extra) {
  return ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-h', cluster.socket, '-p', String(cluster.port), '-U', 'postgres', '-d', database, ...extra]
}

function psqlFile(cluster, database, file) {
  run('psql', psqlArgs(cluster, database, ['-f', file]), { quiet: true })
}

/** Minimal RFC-4180 CSV parser — enough for psql --csv output. */
export function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i += 1 }
      else if (ch === '"') quoted = false
      else field += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') { row.push(field); field = '' }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = '' }
    else if (ch !== '\r') field += ch
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  if (rows.length === 0) return []
  const [header, ...body] = rows
  return body.map((values) => Object.fromEntries(header.map((key, index) => [key, values[index]])))
}

/**
 * One chunk through psql, as db-test's `execute` contract wants: result rows
 * of the last statement, or a throw. psql -c runs a multi-statement string as
 * one implicit transaction and prints only the last result — the same
 * semantics the Management API gives the live runner.
 */
function psqlExecutor(cluster) {
  return async (sql) => {
    const result = spawnSync('psql', psqlArgs(cluster, DB, ['--csv', '-c', sql]), {
      encoding: 'utf8',
      env: { ...process.env, PGOPTIONS: '-c client_min_messages=warning' },
      maxBuffer: 64 * 1024 * 1024,
    })
    if (result.status !== 0) throw new Error((result.stderr || 'psql failed').trim().split('\n')[0])
    return parseCsv(result.stdout).map((row) =>
      'passed' in row ? { ...row, passed: row.passed === 't' ? true : row.passed === 'f' ? false : null } : row
    )
  }
}

// ── Suite ───────────────────────────────────────────────────────────────────

function report(results, tally) {
  for (const result of results) {
    if (result.passed) {
      tally.passed += 1
      log(`    ✓ ${result.name}`)
    } else {
      tally.failed += 1
      log(`    ✖ ${result.name}${result.error ? `\n        ${result.error}` : ''}`)
    }
  }
  if (results.length === 0) log('    (no checks reported a passed column)')
}

async function runSuite(cluster, fileFilter) {
  const execute = psqlExecutor(cluster)
  const tally = { passed: 0, failed: 0 }

  for (const household of HOUSEHOLDS) {
    log(`\nHousehold ${household.label} — ${household.id}`)
    for (const file of testFiles(fileFilter)) {
      const directives = fileDirectives(readFileSync(`supabase/tests/${file}`, 'utf8'))
      if (directives['run-as'] === 'non-member') {
        // The strong case (a user with a household of their own) and the plain
        // one (a signed-in user with none).
        for (const [who, user] of [['other household owner', household.otherOwner], ['user with no household', USERS.outsider]]) {
          log(`  ${file}  (as ${who})`)
          report(await runFile(execute, file, household.id, user), tally)
        }
      } else {
        log(`  ${file}`)
        report(await runFile(execute, file, household.id, household.member), tally)
      }
    }
  }

  if (!fileFilter || EXPECTATIONS.includes(fileFilter)) {
    log(`\nFixture expectations — ${EXPECTATIONS}`)
    report(await runFile(execute, `../local/${path.basename(EXPECTATIONS)}`, HOUSEHOLDS[0].id, null), tally)
  }

  return tally
}

// ── Bench ───────────────────────────────────────────────────────────────────

const BENCH_SQL = `
set client_min_messages = warning;
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"${USERS.a1}","role":"authenticated"}', true) \\g /dev/null
create temp table bench (fn text, ms numeric) on commit drop;
do $$
declare
  hh constant uuid := '${HOUSEHOLDS[0].id}';
  probes text[] := array[
    'get_monthly_dashboard_summary§select count(*) from public.get_monthly_dashboard_summary($1, date ''2026-09-01'')',
    'get_account_balances§select count(*) from public.get_account_balances($1)',
    'get_account_balances_as_of_many (13 dates)§select count(*) from public.get_account_balances_as_of_many($1, array(select (date ''2025-09-30'' + (g || '' month'')::interval)::date from generate_series(0, 12) g), false)',
    'get_monthly_expenses_by_category§select count(*) from public.get_monthly_expenses_by_category($1, date ''2026-09-01'')',
    'get_monthly_budget_details§select count(*) from public.get_monthly_budget_details($1, date ''2026-09-01'')',
    'search_household_transactions (month, 50)§select count(*) from public.search_household_transactions($1, date ''2026-09-01'', date ''2026-09-30'', null, null, null, null, null, null, null, null, 50, 0)',
    'search_household_transactions (all time, 50)§select count(*) from public.search_household_transactions($1, null, null, null, null, null, null, null, null, null, null, 50, 0)'
  ];
  probe text;
  started timestamptz;
  n bigint;
begin
  foreach probe in array probes loop
    execute split_part(probe, '§', 2) into n using hh; -- warm-up, not recorded
    for i in 1..25 loop
      started := clock_timestamp();
      execute split_part(probe, '§', 2) into n using hh;
      insert into bench values (split_part(probe, '§', 1), extract(epoch from clock_timestamp() - started) * 1000);
    end loop;
  end loop;
end $$;
select fn as rpc,
       round(percentile_cont(0.5) within group (order by ms)::numeric, 2) as p50_ms,
       round(percentile_cont(0.75) within group (order by ms)::numeric, 2) as p75_ms,
       round(percentile_cont(0.95) within group (order by ms)::numeric, 2) as p95_ms
from bench group by fn order by fn;
commit;
`

function bench(cluster) {
  log('\nRPC timings on fixture household A (as authenticated, RLS on; 25 runs after 1 warm-up)')
  const out = run('psql', psqlArgs(cluster, DB, ['-P', 'footer=off']), { input: BENCH_SQL })
  log(out.trimEnd())
}

// ── Entry point ─────────────────────────────────────────────────────────────

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const port = Number(options.port ?? 54329)
  const bin = pgBinDir()

  const started = Date.now()
  const cluster = startCluster(bin, port)
  let tally = { passed: 0, failed: 0 }
  try {
    run('psql', psqlArgs(cluster, 'postgres', ['-c', `create database ${DB}`]), { quiet: true })
    process.env.PGOPTIONS = '-c client_min_messages=warning'

    psqlFile(cluster, DB, SHIM)
    const migrations = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()
    for (const migration of migrations) psqlFile(cluster, DB, path.join(MIGRATIONS_DIR, migration))
    log(`Applied shim + ${migrations.length} migrations (${((Date.now() - started) / 1000).toFixed(1)}s)`)

    const fixturesStarted = Date.now()
    psqlFile(cluster, DB, FIXTURES)
    const counts = parseCsv(run('psql', psqlArgs(cluster, DB, ['--csv', '-c',
      `select (select count(*) from public.households) as households,
              (select count(*) from public.accounts) as accounts,
              (select count(*) from public.transactions) as transactions,
              (select count(*) from public.transaction_entries) as entries,
              (select count(*) from public.transaction_allocations) as allocations`]), { quiet: true }))[0]
    log(`Loaded fixtures (${((Date.now() - fixturesStarted) / 1000).toFixed(1)}s): ` +
      `${counts.households} households, ${counts.accounts} accounts, ${counts.transactions} transactions, ` +
      `${counts.entries} entries, ${counts.allocations} allocations`)

    tally = await runSuite(cluster, typeof options.file === 'string' ? options.file : undefined)
    if (options.bench) bench(cluster)
  } catch (error) {
    console.error(`\n${error.message}`)
    tally.failed += 1
  } finally {
    if (options.keep) {
      log(`\nCluster left running. Connect with:\n  psql -h ${cluster.socket} -p ${cluster.port} -U postgres -d ${DB}`)
      log(`Stop it with:\n  ${serverCommand(path.join(bin, 'pg_ctl'), ['-D', cluster.data, 'stop']).flat().join(' ')} && rm -rf ${cluster.dir}`)
    } else {
      stopCluster(bin, cluster)
    }
  }

  log(`\n${tally.passed} passed, ${tally.failed} failed. (${((Date.now() - started) / 1000).toFixed(1)}s)`)
  if (tally.failed > 0) process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
