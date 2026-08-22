#!/usr/bin/env node
// ============================================================
// App Finanzas — db-push.mjs
// Applies pending migrations over HTTPS, from anywhere.
//
// `npx supabase db push` speaks the PostgreSQL wire protocol on TCP 5432.
// That works from a laptop and nowhere else: a Claude Code cloud session (the
// thing behind a phone-started task) routes *all* egress through an HTTP/HTTPS
// proxy, and `db.<ref>.supabase.co` resolves IPv6-only while the session VM is
// IPv4. Both the direct host and the IPv4 pooler are therefore unreachable, so
// the CLI can never push from there no matter which credentials it is given.
//
// Supabase's Management API exposes the same database over plain HTTPS
// (POST /v1/projects/{ref}/database/query), which does traverse the proxy. This
// script reimplements the small part of `db push` that matters: diff
// supabase/migrations/ against supabase_migrations.schema_migrations, then send
// each pending file, recording it in the same tracking table the CLI uses. A
// migration applied through here is indistinguishable from one applied by the
// CLI, so the two stay interchangeable and the repo keeps describing the base.
//
// It is deliberately narrow: it runs files from supabase/migrations/ and
// nothing else. There is no way to hand it arbitrary SQL.
//
// Usage:
//   node scripts/db-push.mjs status           # what is applied / pending / drifted
//   node scripts/db-push.mjs push             # dry run — prints the plan, writes nothing
//   node scripts/db-push.mjs push --apply     # actually applies the pending migrations
//
// Flags:
//   --apply                 required to write; without it `push` is a dry run
//   --allow-out-of-order    apply a pending file older than the newest applied one
//   --force                 apply a file containing explicit BEGIN/COMMIT (see below)
//
// Env: SUPABASE_ACCESS_TOKEN (personal access token, sbp_…)
//      SUPABASE_PROJECT_REF  (optional; defaults to supabase/.temp/project-ref)
//
// This is production. There is no staging copy of this database.
// ============================================================

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

const MIGRATIONS_DIR = 'supabase/migrations'
const API_ORIGIN = 'https://api.supabase.com'
const REQUEST_TIMEOUT_MS = 120_000
const TRACKING_TABLE = 'supabase_migrations.schema_migrations'

// ── CLI plumbing ────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const [command, ...rest] = argv
  const flags = new Set(rest.filter((token) => token.startsWith('--')).map((t) => t.slice(2)))
  return { command, flags }
}

function fail(message) {
  console.error(`\n✖ ${message}\n`)
  process.exit(1)
}

function log(message = '') {
  console.log(message)
}

/** Node's --env-file is the happy path; this is the fallback when it is absent. */
function loadEnvFallback() {
  if (process.env.SUPABASE_ACCESS_TOKEN) return

  for (const candidate of ['.env.local', '.env']) {
    if (!existsSync(candidate)) continue
    for (const line of readFileSync(candidate, 'utf8').split('\n')) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (!match) continue
      const value = match[2].replace(/^['"]|['"]$/g, '')
      if (!process.env[match[1]]) process.env[match[1]] = value
    }
  }
}

// ── Management API ──────────────────────────────────────────────────────────

function readProjectRef() {
  if (process.env.SUPABASE_PROJECT_REF) return process.env.SUPABASE_PROJECT_REF

  const linked = 'supabase/.temp/project-ref'
  if (!existsSync(linked)) {
    fail(
      `No project ref. Expected ${linked} (written by \`npx supabase link\`) ` +
        'or a SUPABASE_PROJECT_REF environment variable.'
    )
  }

  return readFileSync(linked, 'utf8').trim()
}

/**
 * Runs SQL through the Management API. Every statement in `sql` travels in one
 * request, so PostgreSQL runs them in a single implicit transaction: a
 * migration and the row recording it either both land or neither does.
 */
async function runSql(context, sql) {
  let response

  try {
    response = await fetch(`${API_ORIGIN}/v1/projects/${context.ref}/database/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${context.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch (error) {
    // The usual cause in a cloud session is the environment's network policy:
    // api.supabase.com is not on the default allowlist, so the proxy answers
    // 403 to CONNECT and fetch reports a transport failure.
    fail(
      `Could not reach ${API_ORIGIN}: ${error.message}\n` +
        '  If this is a Claude Code cloud session, the environment needs Network access\n' +
        '  set to Custom with *.supabase.com and *.supabase.co allowed.'
    )
  }

  const body = await response.text()

  if (!response.ok) {
    let detail = body
    try {
      detail = JSON.parse(body).message ?? body
    } catch {
      // Not JSON — the raw body is the best detail available.
    }
    fail(`Supabase API returned ${response.status}: ${detail}`)
  }

  try {
    return JSON.parse(body)
  } catch {
    return []
  }
}

// ── Migration state ─────────────────────────────────────────────────────────

function localMigrations() {
  if (!existsSync(MIGRATIONS_DIR)) fail(`${MIGRATIONS_DIR} does not exist.`)

  return readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .map((file) => {
      const match = file.match(/^(\d+)_(.*)\.sql$/)
      if (!match) fail(`${file} does not follow the <version>_<name>.sql convention.`)
      return { file, version: match[1], name: match[2] }
    })
    .sort((a, b) => a.version.localeCompare(b.version))
}

async function appliedVersions(context) {
  const rows = await runSql(
    context,
    `select version from ${TRACKING_TABLE} order by version`
  )
  return rows.map((row) => String(row.version))
}

/**
 * The tracking table gained columns over the CLI's life (`name`, `statements`),
 * and which ones exist depends on when the project was created. Ask, rather
 * than assume, so the insert matches this project's table.
 */
async function trackingColumns(context) {
  const [schema, table] = TRACKING_TABLE.split('.')
  const rows = await runSql(
    context,
    `select column_name from information_schema.columns
       where table_schema = '${schema}' and table_name = '${table}'`
  )
  return new Set(rows.map((row) => String(row.column_name)))
}

/** Dollar-quoting with a tag the payload cannot contain keeps the SQL verbatim. */
function dollarQuote(value) {
  const tag = `mig_${randomUUID().replace(/-/g, '')}`
  return `$${tag}$${value}$${tag}$`
}

function recordStatement(migration, sql, columns) {
  const values = [['version', dollarQuote(migration.version)]]

  if (columns.has('name')) values.push(['name', dollarQuote(migration.name)])
  if (columns.has('statements')) values.push(['statements', `array[${dollarQuote(sql)}]`])

  return (
    `insert into ${TRACKING_TABLE} (${values.map(([column]) => column).join(', ')})\n` +
    `values (${values.map(([, value]) => value).join(', ')});`
  )
}

// ── Commands ────────────────────────────────────────────────────────────────

async function loadState(context) {
  const local = localMigrations()
  const applied = await appliedVersions(context)
  const appliedSet = new Set(applied)
  // Read here rather than at apply time so a dry run — and `status`, even with
  // nothing pending — exercises everything the write path needs except the
  // INSERT itself.
  const columns = await trackingColumns(context)

  return {
    local,
    applied,
    columns,
    pending: local.filter((migration) => !appliedSet.has(migration.version)),
    // Applied remotely with no file here: the repo no longer describes the base.
    orphans: applied.filter((version) => !local.some((m) => m.version === version)),
  }
}

async function status(context) {
  const { local, applied, pending, orphans, columns } = await loadState(context)

  log(`\nProject ${context.ref}`)
  log(`  local migrations : ${local.length}`)
  log(`  applied remotely : ${applied.length}`)
  log(`  pending          : ${pending.length}`)
  log(`  records with     : ${[...columns].join(', ')}`)

  if (pending.length) {
    log('\nPending:')
    for (const migration of pending) log(`  • ${migration.file}`)
  }

  if (orphans.length) {
    log('\n⚠ Applied remotely with no local file — the repo is behind the database:')
    for (const version of orphans) log(`  • ${version}`)
  }

  log()
}

async function push(context, flags) {
  const { applied, pending, columns } = await loadState(context)

  if (!pending.length) {
    log('\nNothing to push — the database is up to date.\n')
    return
  }

  const newestApplied = applied.length ? applied[applied.length - 1] : ''
  const outOfOrder = pending.filter((migration) => migration.version < newestApplied)

  if (outOfOrder.length && !flags.has('allow-out-of-order')) {
    fail(
      `${outOfOrder.map((m) => m.file).join(', ')} predates the newest applied ` +
        `migration (${newestApplied}). Applying it now runs it against a schema it ` +
        'was never written for. Re-run with --allow-out-of-order if that is intended.'
    )
  }

  const plan = pending.map((migration) => ({
    ...migration,
    sql: readFileSync(`${MIGRATIONS_DIR}/${migration.file}`, 'utf8'),
  }))

  // Each migration shares one implicit transaction with the row that records
  // it. An explicit BEGIN/COMMIT inside the file would end that transaction
  // early and could leave the migration applied but unrecorded.
  const explicitTransaction = plan.filter((migration) =>
    /^\s*(begin|commit|rollback)\s*;/im.test(migration.sql)
  )

  if (explicitTransaction.length && !flags.has('force')) {
    fail(
      `${explicitTransaction.map((m) => m.file).join(', ')} contains explicit ` +
        'transaction control, which breaks the all-or-nothing guarantee here. ' +
        'Remove it, or re-run with --force if you have checked it is safe.'
    )
  }

  log(`\n${flags.has('apply') ? 'Applying' : 'Would apply'} ${plan.length} migration(s) to ${context.ref}:`)
  for (const migration of plan) {
    const lines = migration.sql.split('\n').length
    log(`  • ${migration.file} (${lines} lines)`)
  }

  if (!flags.has('apply')) {
    log(`\nEach would be recorded in ${TRACKING_TABLE} (${[...columns].join(', ')}).`)
    log('Dry run — nothing was applied. Re-run with --apply to push.\n')
    return
  }

  for (const migration of plan) {
    process.stdout.write(`  → ${migration.file} … `)
    await runSql(context, `${migration.sql}\n\n${recordStatement(migration, migration.sql, columns)}`)
    log('ok')
  }

  log(`\n✔ Applied ${plan.length} migration(s).\n`)
}

// ── Entry point ─────────────────────────────────────────────────────────────

async function main() {
  const { command, flags } = parseArgs(process.argv.slice(2))

  if (!['status', 'push'].includes(command)) {
    fail('Usage: node scripts/db-push.mjs <status|push> [--apply] [--allow-out-of-order] [--force]')
  }

  loadEnvFallback()

  const token = process.env.SUPABASE_ACCESS_TOKEN
  if (!token) {
    fail(
      'SUPABASE_ACCESS_TOKEN is missing. Create a personal access token at\n' +
        '  https://supabase.com/dashboard/account/tokens\n' +
        '  and set it in the environment this session runs in.'
    )
  }

  const context = { ref: readProjectRef(), token }

  if (command === 'status') await status(context)
  else await push(context, flags)
}

main()
