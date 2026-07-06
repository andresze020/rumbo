/**
 * Tiny arithmetic evaluator for the amount calculator keypad.
 *
 * Supports + − × ÷ (also accepts * and /) with standard precedence and a
 * leading minus sign. Returns null for anything invalid (bad characters,
 * malformed numbers, division by zero) instead of throwing, so callers can
 * simply hide the preview.
 */

const OPERATOR_CHARS = '+-*/'

function normalize(expression: string) {
  return expression
    .replaceAll('×', '*')
    .replaceAll('÷', '/')
    .replaceAll('−', '-')
    .replace(/[\s,]/g, '')
}

/** Strips trailing operators/dots so a partial expression like "12+" previews as 12. */
export function trimIncompleteExpression(expression: string) {
  let normalized = normalize(expression)
  while (normalized && (OPERATOR_CHARS.includes(normalized.at(-1)!) || normalized.endsWith('.'))) {
    normalized = normalized.slice(0, -1)
  }
  return normalized
}

/** True when the expression contains an operator between numbers (i.e. is a calculation). */
export function hasPendingOperation(expression: string) {
  const normalized = normalize(expression)
  return /[0-9.][*/+-]/.test(normalized)
}

export function evaluateAmountExpression(expression: string): number | null {
  const src = normalize(expression)
  if (!src || !/^[0-9.+\-*/]+$/.test(src)) return null

  let pos = 0

  function parseNumber(): number | null {
    let negative = false
    while (src[pos] === '+' || src[pos] === '-') {
      if (src[pos] === '-') negative = !negative
      pos += 1
    }
    const start = pos
    while (pos < src.length && /[0-9.]/.test(src[pos])) pos += 1
    if (start === pos) return null
    const value = Number(src.slice(start, pos))
    if (!Number.isFinite(value)) return null
    return negative ? -value : value
  }

  function parseTerm(): number | null {
    let value = parseNumber()
    if (value === null) return null
    while (src[pos] === '*' || src[pos] === '/') {
      const operator = src[pos]
      pos += 1
      const rhs = parseNumber()
      if (rhs === null) return null
      if (operator === '/') {
        if (rhs === 0) return null
        value /= rhs
      } else {
        value *= rhs
      }
    }
    return value
  }

  let value = parseTerm()
  if (value === null) return null
  while (pos < src.length) {
    const operator = src[pos]
    if (operator !== '+' && operator !== '-') return null
    pos += 1
    const rhs = parseTerm()
    if (rhs === null) return null
    value = operator === '+' ? value + rhs : value - rhs
  }

  return Number.isFinite(value) ? value : null
}

/** Rounds to 2 decimals for money amounts, avoiding float artifacts like 0.1+0.2. */
export function roundToCents(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}
