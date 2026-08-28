#!/usr/bin/env node
// ============================================================
// Rumbo — db-test.mjs
// Runs the ledger invariants in supabase/tests/ against the linked database.
//
// Those files existed for a year with nothing to execute them: they were
// written to be pasted into the Supabase SQL editor by hand, so in practice
// nobody ran them. They are the only real test coverage this repo has — they
// assert the ledger rules where the ledger actually lives — so this makes them
// a command.
//
// Each file is a sequence of statements shaped
//   select '<check name>' as check_name, <boolean> as passed;
// and every row must report passed = true. A file may also contain a
// `begin; do $$ ... assert ... $$; rollback;` block that exercises an RPC and
// undoes itself; a failed assert raises, which this reports as a failure.
//
// Read-only against your data. Nothing here writes: the one file that creates
// anything wraps it in a transaction it rolls back itself, and this runner
// sends that block intact so the rollback still applies.
//
// Usage:
//   node scripts/db-test.mjs                       # every file in supabase/tests/
//   node scripts/db-test.mjs --household=<uuid>    # pick the household to test
//   node scripts/db-test.mjs --file=br_040         # only files matching a substring
//
// Env: SUPABASE_ACCESS_TOKEN (personal access token, sbp_…)
//      SUPABASE_PROJECT_REF  (optional; defaults to supabase/.temp/project-ref)
//      SUPABASE_TEST_HOUSEHOLD_ID (optional; same as --household)
//
// This runs against production. There is no staging copy of this database.
// ============================================================

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { apiContext, fail, log, runScript, runSql } from './lib/supabase-api.mjs'

const TESTS_DIR = 'supabase/tests'
const HOUSEHOLD_PLACEHOLDER = '__HOUSEHOLD_ID__'

// ── CLI plumbing ────────────────────────────────────────────────────────────

const KNOWN_FLAGS = new Set(['household', 'file'])

function parseArgs(argv) {
  const options = {}
  for (const token of argv) {
    const match = token.match(/^--([a-z-]+)(?:=(.*))?$/)
    if (!match || !KNOWN_FLAGS.has(match[1])) {
      fail(`Unrecognised argument: ${token}\n  Usage: node scripts/db-test.mjs [--household=<uuid>] [--file=<substring>]`)
    }
    options[match[1]] = match[2] ?? true
  }
  return options
}

/** The check's own name, so a failure reads as a check and not as raw SQL. */
function checkName(chunk) {
  const named = chunk.match(/'([^']+)'\s*(?:::text\s*)?as\s+check_name/i)
  if (named) return named[1]
  return leadingVerb(chunk).replace(/\s+/g, ' ').trim() || '(unnamed statement)'
}

// ── SQL splitting ───────────────────────────────────────────────────────────

/** Whitespace and comments in front of a statement, so we can read its verb. */
function leadingVerb(statement) {
  return statement
    .replace(/^(?:\s|--[^\n]*\n?|\/\*[\s\S]*?\*\/)*/, '')
    .slice(0, 40)
    .toLowerCase()
}

/**
 * Splits a file into the chunks to send, one request each.
 *
 * The Management API answers with the rows of the *last* statement in a
 * request, so each check has to travel alone for its result to come back. The
 * one thing that must not be split is an explicit transaction: sending
 * `begin;`, the body, and `rollback;` as three requests would put the body in
 * its own committed transaction and leave the test data behind. So a
 * begin…commit/rollback run is collected into a single chunk and sent whole.
 *
 * Comments, single-quoted strings and dollar-quoted bodies are skipped over
 * rather than parsed — a `;` inside any of them is not a statement boundary.
 */
export function splitStatements(sql) {
  const chunks = []
  let statement = ''
  let group = ''
  let inTransaction = false
  let i = 0

  const flush = () => {
    const verb = leadingVerb(statement)

    if (!inTransaction && /^(begin|start\s+transaction)\b/.test(verb)) {
      inTransaction = true
      group = statement
      statement = ''
      return
    }

    if (inTransaction) {
      group += statement
      if (/^(commit|rollback)\b/.test(verb)) {
        chunks.push(group.trim())
        group = ''
        inTransaction = false
      }
      statement = ''
      return
    }

    chunks.push(statement.trim())
    statement = ''
  }

  while (i < sql.length) {
    const rest = sql.slice(i)

    if (rest.startsWith('--')) {
      const newline = sql.indexOf('\n', i)
      const end = newline === -1 ? sql.length : newline + 1
      statement += sql.slice(i, end)
      i = end
      continue
    }

    if (rest.startsWith('/*')) {
      const close = sql.indexOf('*/', i + 2)
      const end = close === -1 ? sql.length : close + 2
      statement += sql.slice(i, end)
      i = end
      continue
    }

    if (sql[i] === "'") {
      let j = i + 1
      while (j < sql.length) {
        if (sql[j] === "'" && sql[j + 1] === "'") j += 2
        else if (sql[j] === "'") break
        else j += 1
      }
      const end = Math.min(j + 1, sql.length)
      statement += sql.slice(i, end)
      i = end
      continue
    }

    const dollarTag = rest.match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/)
    if (dollarTag) {
      const tag = dollarTag[0]
      const close = sql.indexOf(tag, i + tag.length)
      const end = close === -1 ? sql.length : close + tag.length
      statement += sql.slice(i, end)
      i = end
      continue
    }

    if (sql[i] === ';') {
      statement += ';'
      i += 1
      flush()
      continue
    }

    statement += sql[i]
    i += 1
  }

  // A trailing statement with no terminating semicolon, or an unterminated
  // transaction, is still worth sending — better a clear SQL error than a
  // silently skipped check.
  if (inTransaction && (group.trim() || statement.trim())) chunks.push((group + statement).trim())
  else if (statement.trim()) chunks.push(statement.trim())

  return chunks.filter((chunk) => leadingVerb(chunk).length > 0)
}

// ── Household ───────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Which household to assert against. Explicit wins; otherwise, if the project
 * holds exactly one, that is unambiguous enough to use. More than one and the
 * runner refuses rather than guessing which one the invariants are about.
 */
async function resolveHousehold(context, requested) {
  const given = requested ?? process.env.SUPABASE_TEST_HOUSEHOLD_ID

  if (given) {
    if (!UUID_RE.test(given)) fail(`--household must be a uuid, got: ${given}`)
    return given
  }

  // Ids only, never names: a household name is somebody's family, and this
  // prints to a terminal and to CI logs.
  const rows = await runSql(context, 'select id from public.households order by id limit 20;')

  if (!Array.isArray(rows) || rows.length === 0) {
    fail('No households in this project. Pass --household=<uuid> if that is wrong.')
  }

  if (rows.length > 1) {
    fail(
      'This project has more than one household, so there is no obvious one to test.\n' +
        '  Re-run with --household=<uuid>, one of:\n' +
        rows.map((row) => `    ${row.id}`).join('\n')
    )
  }

  return rows[0].id
}

// ── Running ─────────────────────────────────────────────────────────────────

function testFiles(filter) {
  if (!existsSync(TESTS_DIR)) fail(`No ${TESTS_DIR} directory.`)

  const files = readdirSync(TESTS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .filter((file) => (typeof filter === 'string' ? file.includes(filter) : true))
    .sort()

  if (files.length === 0) fail(`No matching .sql files in ${TESTS_DIR}.`)
  return files
}

async function runFile(context, file, householdId) {
  const raw = readFileSync(`${TESTS_DIR}/${file}`, 'utf8')

  if (!raw.includes(HOUSEHOLD_PLACEHOLDER)) {
    log(`  ⚠ ${file} has no ${HOUSEHOLD_PLACEHOLDER} placeholder — running as written.`)
  }

  const sql = raw.split(HOUSEHOLD_PLACEHOLDER).join(householdId)
  const results = []

  for (const chunk of splitStatements(sql)) {
    let rows
    try {
      rows = await runSql(context, chunk, { throwOnError: true })
    } catch (error) {
      // A raised assert inside a `do` block lands here, and so does a genuine
      // SQL error. Both are failures; the message says which.
      results.push({ name: checkName(chunk), passed: false, error: error.message })
      continue
    }

    if (!Array.isArray(rows)) continue

    for (const row of rows) {
      if (typeof row?.passed !== 'boolean') continue
      results.push({ name: row.check_name ?? '(unnamed check)', passed: row.passed })
    }
  }

  return results
}

// ── Entry point ─────────────────────────────────────────────────────────────

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const context = apiContext()
  const householdId = await resolveHousehold(context, options.household)

  log(`\nLedger invariants — project ${context.ref}, household ${householdId}\n`)

  let failed = 0
  let passed = 0

  for (const file of testFiles(options.file)) {
    log(file)
    const results = await runFile(context, file, householdId)

    if (results.length === 0) {
      log('  (no checks reported a passed column)')
    }

    for (const result of results) {
      if (result.passed) {
        passed += 1
        log(`  ✓ ${result.name}`)
      } else {
        failed += 1
        log(`  ✖ ${result.name}${result.error ? `\n      ${result.error}` : ''}`)
      }
    }

    log()
  }

  log(`${passed} passed, ${failed} failed.`)

  // Not `fail()`: the report above is the message, and a banner would bury it.
  if (failed > 0) process.exitCode = 1
}

// Only when run as a command. `splitStatements` is exported so the chunking —
// the one part of this script with logic worth checking — can be exercised
// without touching the network.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runScript(main)
}
