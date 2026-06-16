# Sprint 5 — Accounts: "Total balance" hero + real per-row meta

Copy everything below the line into Claude Code.

---

You are working on my project "App Finanzas", a personal/family finance PWA built with Next.js, TypeScript, Tailwind, shadcn/ui, Supabase Auth, Supabase/PostgreSQL, GitHub, Vercel, Recharts, and Zod.

Keep the implementation aligned with the Product Brief, Roadmap, PRD, and Data Model. Read the design handoff first: `docs/design/handoff-2026-06/project/App Finanzas.dc.html` (the `isCuentas` block, ~line 748, and its mock data in `cuentasView()`, ~line 1254) and `IMPLEMENTATION-PLAN.md` (Sprint 5).

Current status:
- Sprints 1–4 (nav, mobile bottom-nav, dashboard, transactions) are merged.
- `/dashboard/accounts` is fully functional today (create/edit/archive, opening
  balance, drag-to-reorder, list/grouped view toggle, summary KPI cards) but
  uses the pre-redesign visual style (shadcn `Card` wrapper, no hero, balance
  details hidden behind expand).
- Current branch: `feature/redesign-s5-accounts`.
- Sprint goal: bring the page to the "calm modern fintech" visual language from
  Sprints 3–4 (hero total, `rounded-xl border bg-card shadow-sm shadow-black/[0.03]`
  list container, `SectionHeading`) and surface real per-account meta
  (institution · last 4, available/owed label) in the collapsed row — without
  changing any data model or write paths.

## Design → implementation mapping (decided, do not re-derive)

| Design piece (`isCuentas`) | Implementation |
|---|---|
| Hero "Balance total · {{ monthLabel }}" big number | New hero card above the KPI row: signed total of `baseAmount` across the **displayed** active accounts (all of them, not just `include_in_net_worth`), using `BalanceAmount` styling. No month scoping — balances are a snapshot, not monthly. |
| "Conectar cuenta" button in the hero | **Do not add.** Maps to the existing "Create account" action already in `PageHeader`. Bank-sync/connect is out of MVP scope. |
| `cuentasGroups` (grouped list with colored subtotal) | Already implemented via `groupAccountsByType` + `AccountGroup` — keep as is. Keep **one group per `account_type`** (current behavior); do not merge checking+savings into a combined "Corriente y ahorros" group like the mock — that's a bigger taxonomy change out of scope. |
| Row: icon + name + `{{ ac.bank }} · ···· {{ ac.last4 }}` | Add a muted meta line under the account name in the **collapsed** summary row, showing `institutionName` and `···· {lastFour}` when present. This data already exists on `AccountRowVM` (today only shown after expanding). |
| `{{ ac.balLabel }}` under the balance (e.g. "Disponible", "Saldo a pagar") | Add a small label under `BalanceAmount` in the row: `"Available"` for `accountClass === 'asset'`, `"Owed"` for `'liability'`. Derived, not mock. |
| `{{ ac.lastSync }}` ("Hace 2 min", "Cierre ayer", "Al vencimiento") | **Do not implement.** Implies live bank sync we don't have; there is no real timestamp to back it and faking one would be undisclosed mock data. |
| Card/list container styling | Replace the `<Card><CardContent>` wrapper for the accounts list with `rounded-xl border bg-card shadow-sm shadow-black/[0.03]` + `SectionHeading` (title + description + `AccountsViewToggle` action), matching dashboard/transactions/debts/recurring. |

Scope:
- Do:
  1. Add the "Total balance" hero card (signed, colored via `BalanceAmount`/tone
     convention) above the existing 4 `MetricCard`s.
  2. Restyle the list container with `SectionHeading` + the
     `rounded-xl border bg-card shadow-sm shadow-black/[0.03]` convention,
     keeping `AccountsViewToggle` as the section action.
  3. In `AccountCardDetails` (or `AccountRowBody`), add the institution/last-4
     meta line and the available/owed sublabel to the collapsed summary row.
     Keep the existing expand/collapse detail (posted/pending/projected
     breakdown) unchanged.
  4. Verify responsive behavior: hero + KPI grid to 1 column on mobile, account
     rows truncate name/meta and never overflow with COP amounts (large
     numbers) or CAD/USD.
  5. Keep all existing badges (currency, account type, liability, archived).
- Do not:
  1. Touch the create/edit/archive/opening-balance forms, server actions, drag
     reordering, or the list/grouped view toggle logic.
  2. Add bank-sync, "Conectar cuenta", or any sync-timestamp UI.
  3. Change `groupAccountsByType` grouping granularity.
  4. Add migrations or change RLS — this is a visual-only sprint.
  5. Touch nav, dashboard, or transactions from prior sprints.

Architecture rules:
- Household-first. Preserve RLS.
- Account balances stay derived from `transaction_entries` via the existing
  RPC/derivation — display only.
- Use server actions for writes (none expected this sprint).

Workflow rules:
- Inspect before editing. Concise plan before changes. Keep scope tight.
- Do not run git add/commit/push/merge/tag/reset/clean/rebase.
- No `npx supabase db push` — no migrations expected.

Validation:
- Run or tell me to run `npm run lint`, `npx tsc --noEmit`, and `npm run build`.
- Manual tests:
  1. Hero total matches the sum of displayed account balances and is colored
     correctly (green positive / red negative / neutral zero).
  2. Account rows show institution · last 4 (when set) and Available/Owed
     without affecting the expand/collapse detail panel.
  3. List/grouped view toggle, drag-to-reorder, create/edit/archive, and
     opening balance flows all still work.
  4. COP/CAD/USD amounts (incl. large COP values) don't overflow on mobile;
     light/dark themes both look correct.
  5. Sidebar (desktop) and "More → Accounts" (mobile) both reach the page.

Final response:
- Files changed
- Database impact
- Commands run
- Manual tests
- Manual Supabase commands
- Manual Git commands
