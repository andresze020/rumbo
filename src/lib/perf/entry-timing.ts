/**
 * T4 of the premium entry sprint: how long the add-transaction flow takes on
 * the user's own phone, measured in the browser.
 *
 * Off by default and opt-in per device: visit any dashboard URL with
 * `?entry_timing=on` (and `=off` to stop). While on, each open and each save
 * records one sample, and a small readout shows p50/p75 per event so the
 * numbers can be read off the phone itself, before and after a change.
 *
 * What a sample holds is the whole privacy contract: an event name, a
 * variant, a duration and a timestamp. No amount, description, account,
 * category, payee, tag, UUID or household — nothing about the transaction.
 * Samples live in `sessionStorage`, so they survive the tab being discarded
 * while the user checks another app (which the 2026-10-14 recordings did
 * constantly) and go away with the tab.
 *
 * Events:
 * - `open`  — tap on "+" → the form on screen. `cold` = no lists in memory
 *   (first open, or a reloaded tab), `warm` = cached lists shown at once.
 * - `save`  — submit → the result on screen. `next` = "Save & Add Next" (the
 *   next draft is up), `close` = a plain create (the redirect has landed).
 */
import { percentile } from './stats'

export const ENTRY_TIMING_FLAG_KEY = 'rumbo:entry-timing'
export const ENTRY_TIMING_SAMPLES_KEY = 'rumbo:entry-timing-samples'
export const MAX_SAMPLES = 200
export const ENTRY_TIMING_PENDING_SAVE_KEY = 'rumbo:entry-timing-pending-save'
/** A save that has not landed after this long never will (validation error, abandoned). */
export const MAX_SAVE_MS = 30_000

export type EntryEvent = 'open' | 'save'
export type EntryVariant = 'cold' | 'warm' | 'next' | 'close'

export type EntrySample = {
  event: EntryEvent
  variant: EntryVariant
  ms: number
  /** Epoch ms when the sample was recorded. */
  at: number
}

export type EntrySummaryRow = {
  event: EntryEvent
  variant: EntryVariant
  n: number
  p50: number | null
  p75: number | null
}

const ORDER: Array<[EntryEvent, EntryVariant]> = [
  ['open', 'cold'],
  ['open', 'warm'],
  ['save', 'next'],
  ['save', 'close'],
]

/** p50/p75 per (event, variant), in a fixed order, skipping empty groups. */
export function summarizeEntrySamples(samples: readonly EntrySample[]): EntrySummaryRow[] {
  return ORDER.flatMap(([event, variant]) => {
    const values = samples
      .filter((s) => s.event === event && s.variant === variant)
      .map((s) => s.ms)
    if (values.length === 0) return []
    const round = (v: number | null) => (v === null ? null : Math.round(v))
    return [
      {
        event,
        variant,
        n: values.length,
        p50: round(percentile(values, 0.5)),
        p75: round(percentile(values, 0.75)),
      },
    ]
  })
}

/** One row as numbers only, e.g. `n=3 · p50 900 ms · p75 1100 ms`. */
export function formatEntryRowFigures(row: EntrySummaryRow): string {
  return `n=${row.n} · p50 ${row.p50} ms · p75 ${row.p75} ms`
}

/** Plain-text table, for the readout's Copy button. */
export function formatEntrySummary(rows: readonly EntrySummaryRow[]): string {
  if (rows.length === 0) return ''
  return rows
    .map((r) => `${r.event}.${r.variant}\tn=${r.n}\tp50=${r.p50}ms\tp75=${r.p75}ms`)
    .join('\n')
}

const VARIANTS: Record<EntryEvent, readonly EntryVariant[]> = {
  open: ['cold', 'warm'],
  save: ['next', 'close'],
}

/** Reads stored samples, dropping anything that is not exactly a sample. Never throws. */
export function parseEntrySamples(raw: string | null): EntrySample[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((value): EntrySample[] => {
      if (!value || typeof value !== 'object') return []
      const { event, variant, ms, at } = value as Record<string, unknown>
      if (event !== 'open' && event !== 'save') return []
      if (!VARIANTS[event].includes(variant as EntryVariant)) return []
      if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return []
      if (typeof at !== 'number' || !Number.isFinite(at)) return []
      // Rebuilt, not passed through: nothing else stored can leak back out.
      return [{ event, variant: variant as EntryVariant, ms, at }]
    })
  } catch {
    return []
  }
}

export function appendEntrySample(
  samples: readonly EntrySample[],
  sample: EntrySample
): EntrySample[] {
  return [...samples, sample].slice(-MAX_SAMPLES)
}

export type PendingSave = { variant: 'next' | 'close'; startedAt: number }

/**
 * Reads the pending-save marker: the submit's wall-clock start and variant.
 * Null when absent, malformed, from the future, or older than `MAX_SAVE_MS`.
 * Never throws.
 */
export function parsePendingSave(raw: string | null, now: number): PendingSave | null {
  if (!raw) return null
  try {
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object') return null
    const { variant, startedAt } = value as Record<string, unknown>
    if (variant !== 'next' && variant !== 'close') return null
    if (typeof startedAt !== 'number' || !Number.isFinite(startedAt)) return null
    const age = now - startedAt
    if (age < 0 || age > MAX_SAVE_MS) return null
    return { variant, startedAt }
  } catch {
    return null
  }
}

// ── Browser side ────────────────────────────────────────────────────────────

function storage(kind: 'local' | 'session'): Storage | null {
  try {
    if (typeof window === 'undefined') return null
    return kind === 'local' ? window.localStorage : window.sessionStorage
  } catch {
    return null
  }
}

export function isEntryTimingEnabled(): boolean {
  return storage('local')?.getItem(ENTRY_TIMING_FLAG_KEY) === '1'
}

export function setEntryTimingEnabled(enabled: boolean) {
  const local = storage('local')
  try {
    if (enabled) local?.setItem(ENTRY_TIMING_FLAG_KEY, '1')
    else local?.removeItem(ENTRY_TIMING_FLAG_KEY)
  } catch {
    // Blocked storage: timing simply stays off.
  }
}

export function readEntrySamples(): EntrySample[] {
  return parseEntrySamples(storage('session')?.getItem(ENTRY_TIMING_SAMPLES_KEY) ?? null)
}

export function clearEntrySamples() {
  try {
    storage('session')?.removeItem(ENTRY_TIMING_SAMPLES_KEY)
  } catch {
    // Nothing to clear.
  }
}

/** Records one sample when timing is on; a no-op otherwise. */
export function recordEntrySample(event: EntryEvent, variant: EntryVariant, ms: number) {
  if (!isEntryTimingEnabled()) return
  const session = storage('session')
  if (!session) return
  try {
    const next = appendEntrySample(readEntrySamples(), {
      event,
      variant,
      ms: Math.round(ms),
      at: Date.now(),
    })
    session.setItem(ENTRY_TIMING_SAMPLES_KEY, JSON.stringify(next))
    window.dispatchEvent(new Event(ENTRY_TIMING_SAMPLES_KEY))
  } catch {
    // Storage full: drop the sample rather than disturb the form.
  }
}

/**
 * Starts the save timer at submit. Kept in `sessionStorage`, not in component
 * state: the first device runs recorded no save at all, because whatever held
 * the start in memory did not survive the redirect that lands the save. A
 * marker in the tab's storage survives a remount and even a reload.
 */
export function markSaveStart(variant: 'next' | 'close') {
  if (!isEntryTimingEnabled()) return
  try {
    storage('session')?.setItem(
      ENTRY_TIMING_PENDING_SAVE_KEY,
      JSON.stringify({ variant, startedAt: Date.now() } satisfies PendingSave)
    )
  } catch {
    // Storage blocked: this save simply goes unmeasured.
  }
}

/** Ends the save timer, if one is pending, and records the sample. */
export function finishPendingSave() {
  const session = storage('session')
  if (!session) return
  let pending: PendingSave | null = null
  try {
    pending = parsePendingSave(session.getItem(ENTRY_TIMING_PENDING_SAVE_KEY), Date.now())
    session.removeItem(ENTRY_TIMING_PENDING_SAVE_KEY)
  } catch {
    return
  }
  if (pending) recordEntrySample('save', pending.variant, Date.now() - pending.startedAt)
}
