#!/usr/bin/env node
// ============================================================
// Rumbo — perf-nav.mjs (RUM-010b; the browser half RUM-001 left pending)
//
// Times the navigation flows of backlog §3.1 in a real browser against a
// running app, cold and warm, and reports p50/p75/p95 per flow:
//
//   Dashboard → Transactions         (first visit in the session: cold)
//   Transactions → Dashboard
//   Dashboard → Transactions (2nd)   (warm: already visited)
//   Dashboard → Accounts
//   Accounts → Transactions
//   Month change (Dashboard, ‹ previous month)
//   Dashboard full load              (hard navigation, new browser context)
//
// "Done" means the destination is really usable, not merely routed: the URL is
// the destination's AND no skeleton (`.animate-pulse`) is left on the page —
// streamed sections included. An optimisation that only swaps a blank screen
// for a skeleton cannot make these numbers better (backlog: "No se aprueba una
// optimización que solo oculte la demora").
//
// Each run starts from a fresh browser context (cold HTTP cache and router
// cache), signed in with a saved session, so runs are independent.
//
// Numbers from `next dev` are not representative (on-demand compilation).
// Measure against `npm run build && npm start`, or a deployment.
//
// Usage:
//   PERF_EMAIL=… PERF_PASSWORD=… node scripts/perf-nav.mjs --base=http://localhost:3000
//   node scripts/perf-nav.mjs --base=… --runs=10 --json > perf.json
//   node scripts/perf-nav.mjs --base=… --viewport=mobile
//
// Needs Playwright (not a project dependency): `npm install --no-save playwright`.
// Uses PLAYWRIGHT_CHROMIUM_EXECUTABLE if set (e.g. /opt/pw-browsers/chromium).
// Read-only: it signs in and navigates; it never submits a form.
// ============================================================

import { performance } from 'node:perf_hooks'
import { pathToFileURL } from 'node:url'

function parseArgs(argv) {
  const options = { base: 'http://localhost:3000', runs: 7, viewport: 'desktop', json: false }
  for (const token of argv) {
    const match = token.match(/^--([a-z]+)(?:=(.*))?$/)
    if (!match) throw new Error(`Unrecognised argument: ${token}`)
    const [, key, value] = match
    if (key === 'json') options.json = true
    else if (key === 'runs') options.runs = Number(value)
    else if (key === 'base' || key === 'viewport') options[key] = value
    else throw new Error(`Unrecognised argument: ${token}`)
  }
  return options
}

/** Nearest-rank percentile over a small sample (what p75/p95 of 7–10 runs can honestly mean). */
export function percentile(values, p) {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const rank = Math.ceil((p / 100) * sorted.length)
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1]
}

async function loadPlaywright() {
  try {
    return await import('playwright')
  } catch {
    console.error('Playwright is not installed. Run: npm install --no-save playwright')
    process.exit(2)
  }
}

// Generous for a slow screen, short enough that a lost click (the router
// dropped the navigation) is reported as lost instead of stalling the run.
const READY_TIMEOUT_MS = 10_000

/** Resolves once the page shows `pathname` (and `search`, if given) with no skeleton left. */
async function waitUntilReady(page, pathname, search) {
  await page.waitForFunction(
    ([path, query]) =>
      window.location.pathname === path &&
      (query === null || window.location.search.includes(query)) &&
      document.querySelector('main') !== null &&
      document.querySelector('.animate-pulse') === null,
    [pathname, search ?? null],
    { timeout: READY_TIMEOUT_MS, polling: 25 }
  )
}

/**
 * Times one flow. A flow that never reaches "ready" within the timeout is a
 * LOST navigation — recorded separately, never averaged into the timings (a
 * lost click is not a slow click) — and the run recovers with a hard reload
 * so the remaining flows still measure something.
 */
async function timed(label, results, action, page, recoverTo) {
  const started = performance.now()
  try {
    await action()
  } catch (error) {
    if (error?.name !== 'TimeoutError') throw error
    ;(results.lost[label] ??= 0)
    results.lost[label] += 1
    await page.goto(recoverTo)
    await waitUntilReady(page, new URL(recoverTo).pathname)
    return
  }
  const ms = performance.now() - started
  ;(results.samples[label] ??= []).push(ms)
}

async function clickNav(page, href) {
  // The desktop sidebar and the mobile bottom bar both render real <a href>s;
  // click the first visible one, as a person would.
  await page.locator(`a[href="${href}"]:visible`).first().click()
}

async function signIn(browser, base, email, password) {
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto(`${base}/login`, { waitUntil: 'networkidle' })
  await page.locator('input[name="email"]').fill(email)
  await page.locator('input[name="password"]').fill(password)
  await page.locator('button[type="submit"]').first().click()
  await page.waitForURL('**/dashboard**', { timeout: 30_000 })
  const state = await context.storageState()
  await context.close()
  return state
}

async function oneRun(browser, options, storageState, results) {
  const viewport = options.viewport === 'mobile' ? { width: 390, height: 844 } : { width: 1366, height: 900 }
  const context = await browser.newContext({ storageState, viewport })
  const page = await context.newPage()
  const base = options.base

  await timed('Dashboard full load (hard)', results, async () => {
    await page.goto(`${base}/dashboard`)
    await waitUntilReady(page, '/dashboard')
  }, page, `${base}/dashboard`)
  await timed('Dashboard → Transactions (cold)', results, async () => {
    await clickNav(page, '/dashboard/transactions')
    await waitUntilReady(page, '/dashboard/transactions')
  }, page, `${base}/dashboard/transactions`)
  await timed('Transactions → Dashboard', results, async () => {
    await clickNav(page, '/dashboard')
    await waitUntilReady(page, '/dashboard')
  }, page, `${base}/dashboard`)
  await timed('Dashboard → Transactions (2nd visit)', results, async () => {
    await clickNav(page, '/dashboard/transactions')
    await waitUntilReady(page, '/dashboard/transactions')
  }, page, `${base}/dashboard/transactions`)
  await clickNav(page, '/dashboard')
  await waitUntilReady(page, '/dashboard')
  await timed('Dashboard → Accounts', results, async () => {
    await clickNav(page, '/dashboard/accounts')
    await waitUntilReady(page, '/dashboard/accounts')
  }, page, `${base}/dashboard/accounts`)
  await timed('Accounts → Transactions', results, async () => {
    await clickNav(page, '/dashboard/transactions')
    await waitUntilReady(page, '/dashboard/transactions')
  }, page, `${base}/dashboard/transactions`)
  await clickNav(page, '/dashboard')
  await waitUntilReady(page, '/dashboard')
  await timed('Month change (Dashboard)', results, async () => {
    const previous = page.locator('a[href^="/dashboard?month="]:visible').first()
    const href = await previous.getAttribute('href')
    await previous.click()
    await waitUntilReady(page, '/dashboard', href.slice(href.indexOf('month=')))
  }, page, `${base}/dashboard`)

  await context.close()
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const email = process.env.PERF_EMAIL
  const password = process.env.PERF_PASSWORD
  if (!email || !password) {
    console.error('Set PERF_EMAIL and PERF_PASSWORD (a test account, never a real user\'s).')
    process.exit(2)
  }

  const { chromium } = await loadPlaywright()
  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
    args: ['--no-sandbox'],
  })

  const results = { samples: {}, lost: {} }
  try {
    const storageState = await signIn(browser, options.base, email, password)
    // One discarded warm-up run: first requests after a server start pay for
    // things (module init, connection pools) no user would.
    await oneRun(browser, options, storageState, { samples: {}, lost: {} })
    for (let run = 0; run < options.runs; run += 1) {
      await oneRun(browser, options, storageState, results)
    }
  } finally {
    await browser.close()
  }

  const flows = [...new Set([...Object.keys(results.samples), ...Object.keys(results.lost)])]
  const summary = flows.map((flow) => ({
    flow,
    runs: options.runs,
    lost: results.lost[flow] ?? 0,
    ...stats(results.samples[flow] ?? []),
  }))
  const lostTotal = summary.reduce((sum, row) => sum + row.lost, 0)
  // A lost navigation fails the run: the release gate treats "the click did
  // nothing" as a defect, not as noise to average away.
  if (lostTotal > 0) process.exitCode = 1

  if (options.json) {
    console.log(JSON.stringify({ base: options.base, viewport: options.viewport, runs: options.runs, lostTotal, summary }, null, 2))
    return
  }
  console.log(`\nNavigation timings — ${options.base} (${options.viewport}, ${options.runs} runs + 1 warm-up)`)
  console.log('flow'.padEnd(40), 'p50'.padStart(7), 'p75'.padStart(7), 'p95'.padStart(7), 'lost'.padStart(7))
  for (const row of summary) {
    const cell = (value) => `${value ?? '—'}`.padStart(7)
    console.log(row.flow.padEnd(40), cell(row.p50_ms), cell(row.p75_ms), cell(row.p95_ms), `${row.lost}/${row.runs}`.padStart(7))
  }
  if (lostTotal > 0) {
    console.log(`\n✖ ${lostTotal} navigation(s) never completed within ${READY_TIMEOUT_MS / 1000}s (click registered, route never committed).`)
  }
}

function stats(samples) {
  return {
    p50_ms: samples.length ? Math.round(percentile(samples, 50)) : null,
    p75_ms: samples.length ? Math.round(percentile(samples, 75)) : null,
    p95_ms: samples.length ? Math.round(percentile(samples, 95)) : null,
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
