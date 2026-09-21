/**
 * RUM-001 — turning a Supabase URL into a label that is safe to log.
 *
 * Every server-side query leaves as an HTTP request to PostgREST, so the URL is
 * the cheapest place to learn *what* ran. It is also where user data leaks: a
 * filter like `payee_name=ilike.*rent*` or `description=ilike.*divorce*` puts
 * the household's own words in the query string.
 *
 * So the rule here is an allowlist, not a blocklist: a parameter's **value** is
 * kept only when it describes the query's shape (which columns, what order, how
 * many rows) and can never carry user content. Every other parameter
 * contributes its key and nothing else — enough to tell two queries apart,
 * never enough to read anyone's finances.
 *
 * RPC arguments never appear here at all: PostgREST sends them in the POST
 * body, which the instrumentation does not read. That is deliberate --
 * `search_household_transactions` takes `p_search`, the user's own search text.
 */

/**
 * Parameters whose values are schema or pagination, never user content.
 * `select` names columns, `order` names columns plus asc/desc, and the rest are
 * integers. Nothing a household typed can reach any of them.
 */
const SHAPE_PARAMS = new Set(['select', 'order', 'limit', 'offset', 'columns', 'on_conflict'])

/** A `select=` can run to hundreds of characters on a wide join. */
const MAX_SHAPE_VALUE = 160

export type QueryKind = 'rpc' | 'table' | 'auth' | 'storage' | 'other'

export type QueryLabel = {
  kind: QueryKind
  /** The RPC name, the table name, or the auth/storage sub-path. */
  name: string
  /** Stable display form, e.g. `rpc:get_account_balances` or `from:transactions`. */
  label: string
  /** Every query-string key, sorted. Values excluded. */
  paramKeys: string[]
  /** Only the allowlisted parameters, with values. Safe to log verbatim. */
  shape: Record<string, string>
}

function truncate(value: string): string {
  return value.length > MAX_SHAPE_VALUE ? `${value.slice(0, MAX_SHAPE_VALUE)}…` : value
}

/**
 * Splits a Supabase REST/auth/storage URL into a safe label.
 *
 * Accepts anything `fetch` accepts as a URL string; an unparseable value yields
 * an `other`/`unknown` label rather than throwing, because instrumentation must
 * never be the reason a request fails.
 */
export function labelFromUrl(rawUrl: string): QueryLabel {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return { kind: 'other', name: 'unknown', label: 'other:unknown', paramKeys: [], shape: {} }
  }

  const paramKeys = [...new Set([...url.searchParams.keys()])].sort()

  const shape: Record<string, string> = {}
  for (const key of paramKeys) {
    if (!SHAPE_PARAMS.has(key)) continue
    const value = url.searchParams.get(key)
    if (value != null) shape[key] = truncate(value)
  }

  const segments = url.pathname.split('/').filter(Boolean)

  // /rest/v1/rpc/<fn>
  if (segments[0] === 'rest' && segments[2] === 'rpc' && segments[3]) {
    const name = segments[3]
    return { kind: 'rpc', name, label: `rpc:${name}`, paramKeys, shape }
  }

  // /rest/v1/<table>
  if (segments[0] === 'rest' && segments[2]) {
    const name = segments[2]
    return { kind: 'table', name, label: `from:${name}`, paramKeys, shape }
  }

  // /auth/v1/<action> — getUser(), token refresh. Real round-trips, worth counting.
  if (segments[0] === 'auth') {
    const name = segments.slice(2).join('/') || 'auth'
    return { kind: 'auth', name, label: `auth:${name}`, paramKeys, shape }
  }

  if (segments[0] === 'storage') {
    // A storage path is a file path, which can carry a user-chosen filename.
    return { kind: 'storage', name: 'object', label: 'storage:object', paramKeys, shape }
  }

  return { kind: 'other', name: url.pathname, label: `other:${url.pathname}`, paramKeys, shape }
}

/**
 * Rows served, parsed from PostgREST's `content-range` header (`0-49/1234`; a
 * bare `*` before the slash means an empty result). Returns null when the
 * header is absent or unparseable.
 */
export function rowsFromContentRange(header: string | null): number | null {
  if (!header) return null
  const range = header.split('/')[0]?.trim()
  if (!range || range === '*') return 0
  const [from, to] = range.split('-').map((part) => Number.parseInt(part, 10))
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null
  return to - from + 1
}

/**
 * Total matching rows, parsed from the other half of `content-range`. Null when
 * PostgREST reports `*` (no count requested), which is the common case.
 */
export function totalFromContentRange(header: string | null): number | null {
  if (!header) return null
  const total = header.split('/')[1]?.trim()
  if (!total || total === '*') return null
  const parsed = Number.parseInt(total, 10)
  return Number.isFinite(parsed) ? parsed : null
}
