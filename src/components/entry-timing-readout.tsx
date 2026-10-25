'use client'

import { useEffect, useState } from 'react'
import { Timer } from 'lucide-react'
import { useUiTranslation } from '@/lib/i18n/use-ui-translation'
import {
  ENTRY_TIMING_SAMPLES_KEY,
  clearEntrySamples,
  formatEntryRowFigures,
  formatEntrySummary,
  readEntrySamples,
  summarizeEntrySamples,
  type EntrySummaryRow,
} from '@/lib/perf/entry-timing'

/**
 * The on-phone readout for `?entry_timing=on` (see `lib/perf/entry-timing`).
 * Rendered only while timing is on for this device, and only while the entry
 * form is closed (the provider unmounts it while the form is open): the first
 * version sat over the top of the form and covered its controls.
 *
 * Collapsed, it is a small pill in the bottom-left corner, above the phone's
 * bottom nav; tapping it opens the figures with Copy and Clear.
 */
export function EntryTimingReadout() {
  const ui = useUiTranslation()
  const [rows, setRows] = useState<EntrySummaryRow[]>([])
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    const refresh = () => setRows(summarizeEntrySamples(readEntrySamples()))
    refresh()
    window.addEventListener(ENTRY_TIMING_SAMPLES_KEY, refresh)
    return () => window.removeEventListener(ENTRY_TIMING_SAMPLES_KEY, refresh)
  }, [])

  const total = rows.reduce((sum, row) => sum + row.n, 0)

  return (
    <div className="pointer-events-auto fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-2 z-40 max-w-[calc(100vw-1rem)] text-xs lg:bottom-6 lg:left-6">
      {expanded ? (
        <div className="mb-2 w-[min(22rem,calc(100vw-1rem))] rounded-xl border bg-card px-3 py-2 shadow-sm">
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => void navigator.clipboard?.writeText(formatEntrySummary(rows))}
              disabled={rows.length === 0}
              className="font-medium text-primary disabled:opacity-40"
            >
              {ui('Copy results')}
            </button>
            <button
              type="button"
              onClick={() => {
                clearEntrySamples()
                setRows([])
              }}
              className="text-muted-foreground"
            >
              {ui('Clear')}
            </button>
          </div>
          {rows.length === 0 ? (
            <p className="mt-1 text-muted-foreground">
              {ui('No samples yet. Open the form and save a few entries.')}
            </p>
          ) : (
            <table className="mt-1 w-full tabular-nums">
              <tbody>
                {rows.map((row) => (
                  <tr key={`${row.event}.${row.variant}`} className="text-muted-foreground">
                    <td className="py-0.5 pr-2 font-medium text-card-foreground">
                      {`${row.event}.${row.variant}`}
                    </td>
                    <td>{formatEntryRowFigures(row)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        className="flex h-8 items-center gap-1.5 rounded-full border bg-card px-3 font-medium text-card-foreground shadow-sm"
      >
        <Timer className="size-3.5" aria-hidden="true" />
        {ui('Entry timing')}
        <span className="tabular-nums text-muted-foreground">{total}</span>
      </button>
    </div>
  )
}
