# Sprint 4 — Transactions: inline + bulk editing

Copy everything below the line into Claude Code.

---

You are working on my project "App Finanzas", a personal/family finance PWA built with Next.js, TypeScript, Tailwind, shadcn/ui, Supabase Auth, Supabase/PostgreSQL, GitHub, Vercel, Recharts, and Zod.

Keep the implementation aligned with the Product Brief, Roadmap, PRD, and Data Model. Read the design handoff first: `docs/design/handoff-2026-06/project/App Finanzas.dc.html` (the `isTx` block) and `IMPLEMENTATION-PLAN.md` (Sprint 4).

Current status:
- Sprints 1–3 (nav, mobile bottom-nav, dashboard) are merged.
- Transactions today are date-grouped (Today/Yesterday) and edited via `FormDialog`.
- Current branch: create and work on `feature/redesign-s4-transactions`.
- Sprint goal: low-friction editing — inline row edit, bulk selection, filter chips, and review-status badges — reusing existing server actions.

Scope:
- Do:
  1. Inline quick-edit per row (merchant with autocomplete, category, amount)
     without opening a dialog. Reuse existing server actions in
     `transactions/actions.ts`; do not create new write paths unless required.
  2. Bulk selection with an action bar (mark reviewed, categorize).
  3. Filter chips + review-status badges (To review / Reviewed / Flagged).
  4. Keep the existing date grouping (Today/Yesterday) and existing filters in
     `transaction-filters.tsx`.
  5. Keep color-blind-safe signed amounts and tabular numbers; no overflow.
- Do not:
  1. Add backend/tables/migrations unless a status field is genuinely missing —
     if so, STOP and propose a small additive migration first; do not apply it.
  2. Break CSV import or the transfer/void flows.
  3. Touch nav/dashboard from prior sprints.

Architecture rules:
- Household-first. Preserve RLS.
- Simplified ledger: transactions, transaction_entries, transaction_allocations.
- Reports/budgets from allocations; balances from entries; transfers not income/expense.
- No physical delete for critical financial records (void/archive only).
- Use server actions for writes.

Workflow rules:
- Inspect before editing. Concise plan before changes. Keep scope tight.
- Do not run git add/commit/push/merge/tag/reset/clean/rebase.
- Do not run npx supabase db push. If a migration is needed, create it and list
  the exact manual Supabase command — do not run it.

Validation:
- Run or tell me to run `npm run lint`, `npx tsc --noEmit`, and `npm run build`.
- Manual tests:
  1. Inline edit saves merchant/category/amount and persists.
  2. Bulk select + mark reviewed + categorize work on multiple rows.
  3. Filter chips and review-status badges behave correctly.
  4. Date grouping and existing filters still work.
  5. CSV import, transfer, and void flows still work.
  6. COP/CAD/USD no overflow; ES/EN/FR; light/dark.

Final response:
- Files changed
- Database impact
- Commands run
- Manual tests
- Manual Supabase commands
- Manual Git commands
