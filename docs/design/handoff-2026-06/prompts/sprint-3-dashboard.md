# Sprint 3 — Dashboard "Financial Control Center"

Copy everything below the line into Claude Code.

---

You are working on my project "App Finanzas", a personal/family finance PWA built with Next.js, TypeScript, Tailwind, shadcn/ui, Supabase Auth, Supabase/PostgreSQL, GitHub, Vercel, Recharts, and Zod.

Keep the implementation aligned with the Product Brief, Roadmap, PRD, and Data Model. Read the design handoff first: `docs/design/handoff-2026-06/project/App Finanzas.dc.html` (the `isDashboard` block) and `IMPLEMENTATION-PLAN.md` (Sprint 3). Follow `app-finanzas-ledger-rules`.

Current status:
- Sprints 1 (grouped nav) and 2 (mobile bottom-nav + FAB) are merged.
- Current branch: create and work on `feature/redesign-s3-dashboard`.
- Sprint goal: rebuild the desktop dashboard as a scannable "Financial Control Center" with a main column + 304px right rail, using existing real data. No empty right-side gap.

Scope:
- Do:
  1. Rebuild `src/app/dashboard/page.tsx` + `src/components/dashboard-summary.tsx`
     to the layout: net-worth hero, 4 monthly metrics, budget-vs-actual bars,
     category donut, upcoming payments, and a right rail (insights, debt mini,
     goals mini), then recent activity.
  2. New `src/components/financial-hero-card.tsx`: net worth (real) + sparkline +
     a month health score. THE HEALTH SCORE IS MOCK — mark it clearly in code
     and UI (e.g. a "demo" tooltip) until a real metric exists.
  3. New `src/components/insight-card.tsx`: insights DERIVED from real data only
     (category over budget, positive cash flow, debt decreased, N upcoming
     payments). Non-regulated, no investment advice.
  4. Metrics use `metric-card.tsx`; amounts use `money.tsx`/`balance-amount.tsx`;
     banners use `callout.tsx`; charts use `trend-chart.tsx`/Recharts.
  5. Right rail Goals = locked Beta card (`locked-feature-card.tsx`).
  6. Upcoming payments = real recurring Due/Upcoming data.
  7. Ensure long COP amounts never overflow; keep tabular numbers and the minus
     sign (color-blind-safe).
- Do not:
  1. Add new backend, tables, or migrations.
  2. Build Goals/Reports as real features (Goals mini stays locked).
  3. Touch Transactions internals (Sprint 4).

Architecture rules:
- Household-first. Preserve RLS.
- Dashboards/category breakdowns/budgets read from `transaction_allocations`.
- Account balances derive from `transaction_entries`. Transfers are not income/expense.
- No physical delete for critical financial records.

Workflow rules:
- Inspect before editing. Concise plan before changes. Keep scope tight.
- Do not run git add/commit/push/merge/tag/reset/clean/rebase.
- Do not run npx supabase db push. No migrations expected this sprint.

Validation:
- Run or tell me to run `npm run lint`, `npx tsc --noEmit`, and `npm run build`.
- Manual tests:
  1. Hero shows real net worth; health score is visibly marked as demo.
  2. 4 metrics show real month values with deltas vs previous month.
  3. Budget bars, donut, upcoming payments match real data.
  4. Insights reflect real data; no investment advice.
  5. Right rail full (no empty gap); Goals card is locked Beta.
  6. COP/CAD/USD with no overflow; ES/EN/FR; light/dark.

Final response:
- Files changed
- Database impact
- Commands run
- Manual tests
- Manual Supabase commands
- Manual Git commands
