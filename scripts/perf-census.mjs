#!/usr/bin/env node
// ============================================================
// Rumbo — perf-census.mjs  (RUM-001)
//
// Counts the server-side Supabase round-trips each dashboard route makes, and
// how many of them are strictly sequential.
//
// This is a STATIC count, not a measurement: it reads source, never runs the
// app and never touches the database. Its job is the half of the baseline that
// does not need credentials — how many round-trips a route costs and how they
// are ordered — so that the measured half (scripts/perf-baseline.mjs, and the
// browser numbers) has something to be checked against.
//
// Method, and its limits:
//   - `await supabase.<something>` at a statement position is counted as a
//     SEQUENTIAL round-trip: control does not continue until it resolves.
//   - a `supabase.` call with no immediate `await` is counted as CONCURRENT:
//     in this codebase those are the builders handed to `Promise.all`.
//   - a call inside a helper the route calls is attributed to the helper's
//     file, not the route. Totals per route are therefore a floor, not a
//     ceiling. `RUMBO_PERF=1` is what counts them for real, at runtime.
//
// Usage:
//   node scripts/perf-census.mjs            # every dashboard route
//   node scripts/perf-census.mjs --json     # machine-readable
//   node scripts/perf-census.mjs --path=net-worth
// ============================================================

import { readFileSync } from 'node:fs'
import { glob } from 'node:fs/promises'
import { relative } from 'node:path'

const ROOT = 'src/app/dashboard'

// Every dashboard page renders inside this layout and the helpers it calls, so
// their round-trips are paid on EVERY navigation, on top of the route's own.
// Counting them with the routes would hide that; counting them not at all
// would understate every route by the same amount.
const SHARED = [
  'src/app/dashboard/layout.tsx',
  'src/lib/households/server.ts',
  'src/lib/preferences/server.ts',
]

// `await supabase.rpc(`, `await supabase.from(`, `await supabase.auth.getUser(`
const SEQUENTIAL = /await\s+(\w+)\s*\.\s*(rpc|from|auth)\b/g
// Any call on a client-shaped identifier, awaited or not.
const ANY_CALL = /(?<!\.)\b(supabase|client|db)\s*\.\s*(rpc|from|auth)\b/g

function parseArgs(argv) {
  const options = { json: false, path: null }
  for (const token of argv) {
    if (token === '--json') options.json = true
    else if (token.startsWith('--path=')) options.path = token.slice('--path='.length)
    else {
      console.error(`Unrecognised argument: ${token}`)
      console.error('  Usage: node scripts/perf-census.mjs [--json] [--path=<substring>]')
      process.exit(2)
    }
  }
  return options
}

/** Names of the RPCs and tables a file touches, in source order, with repeats. */
function callTargets(source) {
  const targets = []
  const pattern = /\b(?:supabase|client|db)\s*\.\s*(rpc|from)\s*\(\s*['"`]([\w.]+)['"`]/g
  let match
  while ((match = pattern.exec(source)) !== null) {
    targets.push(`${match[1] === 'rpc' ? 'rpc' : 'from'}:${match[2]}`)
  }
  return targets
}

function countMatches(source, pattern) {
  pattern.lastIndex = 0
  let count = 0
  while (pattern.exec(source) !== null) count += 1
  return count
}

function censusFor(file) {
  const source = readFileSync(file, 'utf8')
  const total = countMatches(source, ANY_CALL)
  const sequential = countMatches(source, SEQUENTIAL)
  const targets = callTargets(source)

  const repeats = {}
  for (const target of targets) repeats[target] = (repeats[target] ?? 0) + 1

  return {
    auth: countMatches(source, /\.\s*auth\s*\.\s*getUser\s*\(/g),
    file: relative(process.cwd(), file),
    route: `/${relative('src/app', file).replace(/\/page\.tsx$/, '')}`,
    total,
    sequential,
    concurrent: Math.max(0, total - sequential),
    repeated: Object.entries(repeats)
      .filter(([, count]) => count > 1)
      .map(([target, count]) => ({ target, count }))
      .sort((a, b) => b.count - a.count),
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))

  const files = []
  for await (const entry of glob(`${ROOT}/**/page.tsx`)) files.push(entry)
  files.sort()

  const rows = files
    .map(censusFor)
    .filter((row) => row.total > 0)
    .filter((row) => !options.path || row.file.includes(options.path))
    .sort((a, b) => b.sequential - a.sequential || b.total - a.total)

  if (options.json) {
    console.log(JSON.stringify({ routes: rows, shared: SHARED.map(censusFor) }, null, 2))
    return
  }

  console.log('Server-side Supabase round-trips per dashboard route (static count)\n')
  console.log('route'.padEnd(42) + 'total'.padStart(6) + 'seq'.padStart(6) + 'conc'.padStart(6))
  console.log('-'.repeat(60))
  for (const row of rows) {
    console.log(
      row.route.padEnd(42) +
        String(row.total).padStart(6) +
        String(row.sequential).padStart(6) +
        String(row.concurrent).padStart(6),
    )
  }

  const shared = SHARED.map(censusFor).filter((row) => row.total > 0)
  if (shared.length > 0) {
    const sharedTotal = shared.reduce((sum, row) => sum + row.total, 0)
    console.log(`\nPaid once per navigation by every route above (layout chain):\n`)
    for (const row of shared) {
      console.log(
        `  ${row.file.padEnd(42)}${String(row.total).padStart(6)}${String(row.sequential).padStart(6)}`,
      )
    }
    console.log(`  ${'subtotal'.padEnd(42)}${String(sharedTotal).padStart(6)}`)
  }

  const repeated = rows.filter((row) => row.repeated.length > 0)
  if (repeated.length > 0) {
    console.log('\nSame call made more than once in one route:\n')
    for (const row of repeated) {
      for (const { target, count } of row.repeated) {
        console.log(`  ${row.route.padEnd(40)} ${target} ×${count}`)
      }
    }
  }

  const authCalls = [...rows, ...shared].reduce(
    (sum, row) => sum + (row.auth ?? 0),
    0,
  )
  if (authCalls > 0) {
    console.log(
      `\nauth.getUser() call sites across the routes above plus the layout chain: ${authCalls}.`,
    )
    console.log(
      '  Each is its own network round-trip: getUser() always revalidates against',
    )
    console.log('  the Auth server, and each createClient() is a separate instance.')
  }

  const totals = rows.reduce(
    (sum, row) => ({ total: sum.total + row.total, sequential: sum.sequential + row.sequential }),
    { total: 0, sequential: 0 },
  )
  console.log(
    `\n${rows.length} routes · ${totals.total} round-trips · ${totals.sequential} sequential`,
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
