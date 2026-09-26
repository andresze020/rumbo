/** Evenly-spaced indices into a 0..n-1 domain, always including both ends, capped at `max` labels so a long timeframe doesn't crowd the x-axis. */
export function pickTickIndices(n: number, max = 6): number[] {
  if (n <= 0) return []
  if (n <= max) return Array.from({ length: n }, (_, i) => i)
  const step = (n - 1) / (max - 1)
  const indices = new Set<number>()
  for (let i = 0; i < max; i++) indices.add(Math.round(i * step))
  return [...indices].sort((a, b) => a - b)
}
