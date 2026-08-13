import Link from 'next/link'
import { formatCurrency } from '@/lib/format'

export type DonutSlice = {
  name: string
  value: number
  categoryId: string | null
}

type CategoryDonutProps = {
  data: DonutSlice[]
  currency: string
  total: number
  totalLabel: string
  /** Selected month (YYYY-MM) used to build "view transactions" links. */
  month: string
}

function categoryHref(categoryId: string | null, month: string) {
  return categoryId
    ? `/dashboard/transactions?category_id=${categoryId}&month=${month}&type=expense`
    : null
}

// Calm fintech palette — readable in light + dark, no loud gradients.
const PALETTE = [
  'oklch(0.62 0.19 255)', // blue
  'oklch(0.70 0.15 165)', // teal
  'oklch(0.72 0.17 70)', // amber
  'oklch(0.65 0.20 25)', // rose
  'oklch(0.62 0.18 300)', // violet
  'oklch(0.68 0.14 145)', // green
  'oklch(0.60 0.02 260)', // slate (Other)
]

const RADIUS = 46
const CIRC = 2 * Math.PI * RADIUS

/** Pure-SVG donut: stroke-dasharray arcs over a track circle. Server-safe. */
export function CategoryDonut({ data, currency, total, totalLabel, month }: CategoryDonutProps) {
  // BR-040: a category whose refunds in a month exceed its spend nets negative.
  // The listed figure below stays the true net, but a wedge has no meaningful
  // negative area — and a negative `stroke-dasharray` is invalid SVG — so the
  // arc geometry clamps at zero.
  const fractions = data.map((slice) =>
    total > 0 ? Math.max(slice.value, 0) / total : 0
  )
  const segments = fractions.map((fraction, i) => {
    const dash = fraction * CIRC
    // Offset = sum of preceding fractions (clockwise, opposite to accumulation).
    const preceding = fractions.slice(0, i).reduce((sum, f) => sum + f, 0)
    return {
      color: PALETTE[i % PALETTE.length],
      dashArray: `${dash} ${CIRC - dash}`,
      dashOffset: -preceding * CIRC,
    }
  })

  return (
    <div className="flex items-center gap-4">
      <div className="relative shrink-0">
        <svg width="118" height="118" viewBox="0 0 120 120" aria-hidden="true">
          <circle cx="60" cy="60" r={RADIUS} fill="none" stroke="var(--muted)" strokeWidth="14" />
          {segments.map((seg, i) => (
            <circle
              key={i}
              cx="60"
              cy="60"
              r={RADIUS}
              fill="none"
              stroke={seg.color}
              strokeWidth="14"
              strokeDasharray={seg.dashArray}
              strokeDashoffset={seg.dashOffset}
              transform="rotate(-90 60 60)"
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-[9.5px] text-muted-foreground">{totalLabel}</span>
          <span className="px-2 text-xs font-bold tabular-nums">{formatCurrency(total, currency)}</span>
        </div>
      </div>

      <ul className="flex min-w-0 flex-1 flex-col gap-1.5">
        {data.map((slice, i) => {
          const href = categoryHref(slice.categoryId, month)
          const row = (
            <>
              <span
                className="size-[7px] shrink-0 rounded-sm"
                style={{ backgroundColor: PALETTE[i % PALETTE.length] }}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{slice.name}</span>
              <span className="shrink-0 font-semibold tabular-nums">
                {formatCurrency(slice.value, currency)}
              </span>
            </>
          )
          return (
            <li key={slice.name} className="text-[11px]">
              {href ? (
                <Link href={href} className="flex items-center gap-2 hover:underline">
                  {row}
                </Link>
              ) : (
                <div className="flex items-center gap-2">{row}</div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
