// ============================================================
// Rumbo — Supabase Management API plumbing
//
// Shared by `db-push.mjs` (applies migrations) and `db-test.mjs` (runs the
// ledger invariants). Both need the same three things: find a personal access
// token, find the linked project ref, and POST SQL to
// /v1/projects/{ref}/database/query — the one route into this database that
// survives a cloud session, where TCP 5432 is unreachable. See
// `docs/db-push-over-https.md` for why that matters.
//
// This module knows nothing about migrations or tests. Keep it that way.
// ============================================================

import { readFileSync, existsSync } from 'node:fs'

export const API_ORIGIN = 'https://api.supabase.com'
export const REQUEST_TIMEOUT_MS = 120_000

/**
 * Thrown by `fail`. `runScript` swallows it — the message is already printed —
 * so the only thing it carries is "stop here".
 */
export class ExitError extends Error {}

/**
 * Reports a fatal problem and unwinds.
 *
 * Deliberately not `process.exit()`. Exiting mid-flight while `fetch` still
 * holds a keep-alive socket trips a libuv assertion on Windows
 * (`!(handle->flags & UV_HANDLE_CLOSING)`), and the process dies with 0xC0000409
 * instead of 1 — a caller, CI included, then sees a crash rather than a clean
 * failure. Setting the code and throwing lets the loop drain first.
 */
export function fail(message) {
  console.error(`\n✖ ${message}\n`)
  process.exitCode = 1
  throw new ExitError(message)
}

/** Entry-point wrapper: every script's `main` goes through here. */
export function runScript(main) {
  main().catch((error) => {
    if (error instanceof ExitError) return
    console.error(error)
    process.exitCode = 1
  })
}

export function log(message = '') {
  console.log(message)
}

/** Node's --env-file is the happy path; this is the fallback when it is absent. */
export function loadEnvFallback() {
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

export function readProjectRef() {
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

/** Token + project ref, or a useful error. Every command starts here. */
export function apiContext() {
  loadEnvFallback()

  const token = process.env.SUPABASE_ACCESS_TOKEN
  if (!token) {
    fail(
      'SUPABASE_ACCESS_TOKEN is missing. Create a personal access token at\n' +
        '  https://supabase.com/dashboard/account/tokens\n' +
        '  and set it in the environment this session runs in.'
    )
  }

  return { ref: readProjectRef(), token }
}

/**
 * Runs SQL through the Management API. Every statement in `sql` travels in one
 * request, so PostgreSQL runs them in a single implicit transaction: a
 * migration and the row recording it either both land or neither does.
 *
 * By default a failure ends the process, which is what a migration run wants.
 * Pass `throwOnError` when the caller has more work to do after a bad
 * statement — a test run reports every failing check, not just the first.
 */
export async function runSql(context, sql, { throwOnError = false } = {}) {
  const abort = (message) => {
    if (throwOnError) throw new Error(message)
    fail(message)
  }

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
    abort(
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
    abort(`Supabase API returned ${response.status}: ${detail}`)
  }

  try {
    return JSON.parse(body)
  } catch {
    return []
  }
}
