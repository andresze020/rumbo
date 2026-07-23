// Shared tag chip palette. Imported by both the client form (swatches) and the
// server action (validation) so a color picked in the UI always round-trips.
// null color = a neutral chip.
export const TAG_COLORS = [
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#14b8a6', // teal
  '#3b82f6', // blue
  '#6366f1', // indigo
  '#a855f7', // purple
  '#ec4899', // pink
  '#64748b', // slate
] as const

export type TagColor = (typeof TAG_COLORS)[number]

export function isTagColor(value: string | null | undefined): value is TagColor {
  return !!value && (TAG_COLORS as readonly string[]).includes(value)
}
