/**
 * Chart palette shared between server-rendered analysis screens
 * (lib/analysis/server.ts, which re-exports these) and client chart
 * components (components/dashboard/line-chart.tsx), which cannot import
 * anything marked `server-only`.
 */

/** Calm fintech palette aligned with the dashboard donut/budget colors. */
export const SERIES_PALETTE = [
  'oklch(0.62 0.19 255)', // blue
  'oklch(0.70 0.15 165)', // teal
  'oklch(0.72 0.17 70)', // amber
  'oklch(0.65 0.20 25)', // rose
  'oklch(0.62 0.18 300)', // violet
  'oklch(0.68 0.14 145)', // green
  'oklch(0.60 0.02 260)', // slate (Other)
] as const

export const POSITIVE_COLOR = 'oklch(0.70 0.15 165)'
export const NEGATIVE_COLOR = 'oklch(0.65 0.20 25)'
export const ACCENT_COLOR = 'oklch(0.62 0.19 255)'
