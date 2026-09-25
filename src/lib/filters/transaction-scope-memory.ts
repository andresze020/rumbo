/**
 * The transactions screen keeps its filters in the URL, which makes a view
 * shareable but also makes it evaporate the moment you leave: the bottom nav,
 * the sidebar, and the redirect that follows creating a transaction all point
 * at a bare `/dashboard/transactions`, which lands on the default month with
 * every filter dropped.
 *
 * So the last applied scope is remembered in a cookie — a cookie rather than
 * `localStorage` because the server component has to read it before it renders
 * to decide where a bare landing should go.
 *
 * It expires after 30 minutes on purpose. Filters should survive "I created a
 * transaction and came back", not the next time the app is opened: a scope
 * remembered for 12 hours meant a morning's first open still landed on last
 * night's "Last 6 months" (reported 2026-09-25).
 */
export const TRANSACTION_SCOPE_COOKIE = 'af_tx_scope'

/** 30 minutes: covers a round trip to another screen, not the next app open. */
export const TRANSACTION_SCOPE_MAX_AGE = 60 * 30

/** Cookies are sent on every request; a runaway filter list is not worth that. */
export const TRANSACTION_SCOPE_MAX_LENGTH = 1200

/**
 * The query params that describe *what is being looked at*. Deliberately not
 * `page` (a restored view starts at the top) and none of the transient params
 * — `created`, `error`, `edit`, `mode` — which belong to one navigation only.
 */
export const TRANSACTION_SCOPE_KEYS = [
  'period',
  'month',
  'date_from',
  'date_to',
  'type',
  'status',
  'review',
  'account_id',
  'category_id',
  'payee_id',
  'tag_id',
  'search',
] as const

export function isTransactionScopeKey(key: string): boolean {
  return (TRANSACTION_SCOPE_KEYS as readonly string[]).includes(key)
}

/**
 * Keep only the scope params out of a remembered query string. The cookie is
 * client-written, so treat it as untrusted input: unknown keys are dropped and
 * nothing but these params can reach the page's URL.
 */
export function parseTransactionScope(rawQuery: string): URLSearchParams {
  const scope = new URLSearchParams()
  if (!rawQuery || rawQuery.length > TRANSACTION_SCOPE_MAX_LENGTH) return scope

  let source: URLSearchParams
  try {
    source = new URLSearchParams(decodeURIComponent(rawQuery))
  } catch {
    return scope
  }

  for (const key of TRANSACTION_SCOPE_KEYS) {
    for (const value of source.getAll(key)) {
      const trimmed = value.trim()
      if (trimmed) scope.append(key, trimmed)
    }
  }
  return scope
}
