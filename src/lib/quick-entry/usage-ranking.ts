/**
 * "Frequently used" for the entry form's one-tap chips (categories, tags),
 * ranked by frequency *and* recency.
 *
 * Until the premium-entry sprint this was a bare counter: top four by count.
 * A category used forty times last year and never since outranked the one
 * used every day this week, and a new habit took weeks to surface — in the
 * 2026-10-14 recording two of the entries walked the tree (Entertainment →
 * Salidas, Transporte → Subway) instead of hitting a chip. A use now weighs
 * less the longer ago it happened (half-life `HALF_LIFE_DAYS`), so the chips
 * follow what this household spends on now.
 *
 * Storage stays per device, in `localStorage`, holding nothing but ids,
 * counts and a timestamp: no amounts, no names. Pure functions only, so the
 * ranking is testable without a browser.
 */

export const CATEGORY_USAGE_KEY = 'af_category_usage'
export const TAG_USAGE_KEY = 'af_tag_usage'

export const HALF_LIFE_DAYS = 21
const DAY_MS = 24 * 60 * 60 * 1000
/** Entries kept per key; the least recently used are dropped first. */
export const MAX_TRACKED = 200
/**
 * Weight of a count written before timestamps existed (the old format was a
 * bare number). Its age is unknown, so it counts as about three weeks old:
 * it still ranks, and a few fresh uses overtake it.
 */
const LEGACY_WEIGHT = 0.5

export type UsageEntry = {
  count: number
  /** Epoch ms of the last use; 0 when unknown (migrated from a bare count). */
  lastUsedAt: number
}

export type UsageMap = Record<string, UsageEntry>

/** Reads either format — `{ id: number }` (legacy) or `{ id: UsageEntry }`. Never throws. */
export function parseUsage(raw: string | null): UsageMap {
  if (!raw) return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return {}
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}

  const usage: UsageMap = {}
  for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      usage[id] = { count: value, lastUsedAt: 0 }
    } else if (value && typeof value === 'object') {
      const { count, lastUsedAt } = value as Partial<UsageEntry>
      if (typeof count === 'number' && Number.isFinite(count) && count > 0) {
        usage[id] = {
          count,
          lastUsedAt:
            typeof lastUsedAt === 'number' && Number.isFinite(lastUsedAt) && lastUsedAt > 0
              ? lastUsedAt
              : 0,
        }
      }
    }
  }
  return usage
}

/**
 * One more use of each id, stamped `now`; trims to `MAX_TRACKED`.
 *
 * Legacy entries (no date) are dated on the way through to `HALF_LIFE_DAYS`
 * ago — the same weight `usageScore` already gives them — so from the first
 * save after the upgrade they age like everything else instead of keeping
 * that weight forever.
 */
export function recordUsage(usage: UsageMap, ids: readonly string[], now: number): UsageMap {
  const next: UsageMap = {}
  for (const [id, entry] of Object.entries(usage)) {
    next[id] = entry.lastUsedAt > 0 ? entry : { ...entry, lastUsedAt: now - HALF_LIFE_DAYS * DAY_MS }
  }
  for (const id of new Set(ids)) {
    next[id] = { count: (next[id]?.count ?? 0) + 1, lastUsedAt: now }
  }
  const tracked = Object.keys(next)
  if (tracked.length <= MAX_TRACKED) return next

  const keep = tracked
    .sort((a, b) => next[b].lastUsedAt - next[a].lastUsedAt)
    .slice(0, MAX_TRACKED)
  return Object.fromEntries(keep.map((id) => [id, next[id]]))
}

export function usageScore(entry: UsageEntry | undefined, now: number): number {
  if (!entry || entry.count <= 0) return 0
  if (entry.lastUsedAt <= 0) return entry.count * LEGACY_WEIGHT
  const ageDays = Math.max(0, now - entry.lastUsedAt) / DAY_MS
  return entry.count * 0.5 ** (ageDays / HALF_LIFE_DAYS)
}

/**
 * The `limit` items with the highest score, best first. Items never used are
 * left out rather than padded in, so an empty list means "no history yet".
 * Ties keep the order of `items` (the caller's sort, e.g. the tree order).
 */
export function rankByUsage<T extends { id: string }>(
  items: readonly T[],
  usage: UsageMap,
  now: number,
  limit: number
): T[] {
  return items
    .map((item, index) => ({ item, index, score: usageScore(usage[item.id], now) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((row) => row.item)
}
