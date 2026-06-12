/**
 * Curated palette + icon set for the category color/icon picker. Hex values
 * mirror the app's muted-but-scannable palette (see `lib/account-display`).
 * Presentation only.
 */

export const CATEGORY_COLORS = [
  '#10b981', // emerald
  '#0ea5e9', // sky
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#f43f5e', // rose
  '#ef4444', // red
  '#f97316', // orange
  '#f59e0b', // amber
  '#14b8a6', // teal
  '#84cc16', // lime
  '#64748b', // slate
] as const

export const CATEGORY_ICONS = [
  '💰', '💼', '💵', '📈', '🏠', '🛒',
  '🍽️', '🚗', '⛽', '🛡️', '💡', '🌐',
  '📱', '🏥', '💊', '🐾', '✈️', '🛍️',
  '🎬', '🎮', '🔁', '🧾', '🏦', '💳',
  '🐷', '📊', '🔄', '⚖️', '🎓', '🎁',
  '☕', '🏋️',
] as const
