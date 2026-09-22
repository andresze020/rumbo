/**
 * RUM-003 — the one `roundToCents`.
 *
 * Previously duplicated: this exact rounding lived in `calc.ts` (the keypad
 * expression evaluator, unrelated to money by purpose) and, separately and
 * slightly differently, as a private, unexported copy inside
 * `installments/shared.ts` (missing the `Number.EPSILON` guard below). No JS
 * decimal type (`decimal.js`/`big.js`) is needed for Rumbo: every money and
 * rate column in the schema is already Postgres `numeric(18,4)`/`numeric(18,8)`
 * (never `float`/`double precision`), and every JS-side sum in this codebase
 * is a small, bounded number of household-scale amounts — well within what an
 * IEEE-754 double represents exactly. The one real gap was this duplication,
 * not a missing numeric type.
 */
export function roundToCents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}
