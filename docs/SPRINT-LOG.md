# Sprint Log — App Finanzas

Append-only record of closed sprints. One entry per sprint, newest at the top.
Maintained at sprint close by the `app-finanzas-state-sync` skill.

History before this log (Sprints 2.x–12.x) lives in `docs/alpha/` and
`docs/alpha-readiness-checklist.md`. Start logging here going forward.

<!-- Template:
## Sprint <X.Y> — <short name>  (<YYYY-MM-DD>)
- Goal:
- Shipped:
- Migrations added:
- Tables changed:
- Follow-ups / known gaps:
-->

## Sprint 12.x — Amount input & currency formatting fix (2026-06-12)
- Goal: fix raw/unformatted monetary values shown to the user (assistant draft
  card and budget line amount fields).
- Shipped: new shared `AmountInput` component (`src/components/amount-input.tsx`)
  with currency-symbol prefix and live thousands grouping; new `lib/format.ts`
  helpers (`getCurrencySymbol`, `formatAmountForDisplay`, `sanitizeAmountInput`);
  adopted across budget line, debt, opening balance, and transaction/transfer
  edit forms; AI assistant draft card now formats extracted amounts as currency
  (PR #8).
- Migrations added: none.
- Tables changed: none.
- Follow-ups / known gaps: exchange-rate, due-day, and sort-order inputs remain
  plain numerics by design (not money).
