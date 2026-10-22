'use client'

import { useEffect, useState } from 'react'
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
 * Rendered only while timing is on for this device, so nobody else ever sees
 * it. A strip at the top edge, out of the way of the form's own actions at
 * the bottom; collapsible to a single line.
 */
export function EntryTimingReadout() {
  const ui = useUiTranslation()
  const [rows, setRows] = useState<EntrySummaryRow[]>([])
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    const refresh = () => setRows(summarizeEntrySamples(readEntrySamples()))
    refresh()
    window.addEventListener(ENTRY_TIMING_SAMPLES_KEY, refresh)
    return () => window.removeEventListener(ENTRY_TIMING_SAMPLES_KEY, refresh)
  }, [])

  return (
    <div className="pointer-events-auto fixed top-[max(0.5rem,env(safe-area-inset-top))] left-1/2 z-[60] w-[min(22rem,calc(100vw-1rem))] -translate-x-1/2 rounded-xl border bg-card/95 px-3 py-2 text-xs shadow-sm backdrop-blur">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          aria-expanded={!collapsed}
          className="font-medium text-card-foreground"
        >
          {ui('Entry timing')}
        </button>
        <div className="flex items-center gap-3">
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
      </div>
      {collapsed ? null : rows.length === 0 ? (
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
  )
}
