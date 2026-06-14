# AGENTS.md — App Finanzas

> Canonical project-state document. Keep this in sync at every sprint close
> (see the `app-finanzas-state-sync` skill). If this file and the code disagree,
> the code wins — and this file is the bug.

## Project context

This is App Finanzas, a personal/family finance PWA.

Stack:
- Next.js (App Router) + React 19
- TypeScript
- Tailwind CSS v4
- shadcn/ui + Base UI + Recharts
- @dnd-kit (drag-and-drop account sorting)
- Supabase Auth + Supabase/PostgreSQL (SSR configured)
- Zod for validation
- @anthropic-ai/sdk (AI assistant feature)
- GitHub + Vercel

The product is household-first. All financial data must belong to a household.

## Current status

- Phase: **MVP Alpha — personal/family real-data usage (Sprint 12.x)**.
- The MVP is feature-complete for personal use. Sprint 12 deliberately delays
  post-MVP work until real Alpha usage proves what is actually missing or broken.
- Recent sprints (12.4–12.7+) addressed alpha findings and UX friction:
  date-grouped transaction list, toast feedback, smart form defaults, month
  navigation, loading skeletons, PWA install hint, ES/EN localization foundation,
  and the `FormDialog` migration for all create/edit/action forms.
- `AmountInput` (PR #8): shared component + `formatAmountForDisplay`/
  `sanitizeAmountInput`/`getCurrencySymbol` helpers in `lib/format.ts`. Adopted in
  budget line, debt, opening balance, and transaction/transfer edit forms, and the
  AI assistant draft card now renders extracted amounts as currency.
- Wealthsimple-style account **List/Group(by type) view toggle** across
  accounts, dashboard, and net-worth (cookie `af_accounts_view`, default group),
  plus **drag-and-drop reordering** on the accounts page via `@dnd-kit` (writes
  `accounts.sort_order`). Balances now use the shared `BalanceAmount` component
  (green positive / red negative + minus sign — color-blind-aware). New code:
  `lib/accounts-view/*`, `components/{accounts-view-toggle,account-group,balance-amount}`,
  `accounts/sortable-accounts-list`.
- **Categories drag-and-drop + style picker**. Siblings-only reorder
  (roots within a type, children within a parent) via `@dnd-kit` +
  `reorderCategoriesAction` (`categories/sortable-category-list.tsx`,
  `CategoryRow` gained an optional `dragHandle`). New `CategoryStylePicker`
  (color swatches + finance-emoji grid, with a custom hex/emoji escape hatch)
  replaces the old free-text color/icon inputs. System default categories now
  seed with a fitting **icon only** (no default color — kept clean) via
  `create_default_categories_for_household`; category icons also show in every
  category dropdown (transaction picker, category form parent selector,
  transaction filters, budget line selector). New code:
  `lib/categories/style.ts`, `components/category-style-picker`,
  `categories/sortable-category-list`.
- Latest: **BR-001 CSV import FX correctness / BR-002 FX rate foundation**.
  CSV imports now resolve per-row FX from account currency to household base
  currency instead of defaulting to 1:1. New `exchange_rates` table plus
  `get_exchange_rate(...)` support same-currency `1`, latest-prior lookup, and
  inverse-pair fallback. Missing non-base rates make rows invalid rather than
  creating incorrect ledger entries. See `docs/features/csv-import-fx.md`.
- **Recurring transactions — manual posting MVP (Sprint A)** shipped earlier in
  Sprint 12.x. `/dashboard/recurring` has Due/Upcoming/Inactive sections,
  income/expense template CRUD, lifecycle (activate/deactivate/delete), and
  one-click **Post**. **Auto-posting (Sprint B) and the dashboard widget +
  recurring transfers (Sprint C) are still pending** — see
  `docs/features/recurring-transactions.md`.
- See `docs/alpha/sprint-12-alpha-plan.md` for the live Alpha plan and
  `docs/alpha-readiness-checklist.md` for the readiness gate.

## Real Supabase tables (public schema)

- profiles
- households
- household_members
- currencies
- accounts
- categories
- transactions
- transaction_entries
- transaction_allocations
- budgets
- budget_lines
- debts
- exchange_rates
- recurring_transactions
- import_batches
- import_rows

Migrations live in `supabase/migrations/` (timestamped `YYYYMMDDHHmmss_*.sql`).

## Key areas of the app

- `src/app/dashboard/` — accounts, categories, transactions, budgets, debts,
  net-worth, recurring, export, settings, assistant (AI).
- `src/lib/supabase/{client,server,middleware}.ts` + `src/middleware.ts` — auth/SSR.
- `src/lib/` — `format.ts`, `fx.ts`, `account-display.ts`, `recurring/`, `imports/`, `exports/`.
- `src/components/` — shared design system (PageHeader, SectionHeading, Callout,
  Money, BalanceAmount, AccountAvatar, AccountGroup, AccountsViewToggle,
  CategoryStylePicker, FormDialog, AmountInput, etc.). Reuse these; do not
  re-roll primitives.

## Technical rules

- Use small, safe, additive SQL migrations. Do not apply a big-bang schema.
- Do not introduce Java.
- Do not bypass RLS. Do not use the Supabase service-role key in app code.
- Use server actions for writes.
- Prefer simple, readable code over abstractions.
- Use TypeScript types where practical.
- Run checks before final answer (see the `app-finanzas-verify` skill):
  - `npm run lint`
  - `npx tsc --noEmit`  (there is no `typecheck` npm script)
  - `npm run build` when feasible

## Git rules

- Work on a branch, not directly on main.
- Use small, logically separable commits.
- Before making code changes, explain the plan.
- Before committing, show the diff summary.
- Never run destructive git commands (`reset --hard`, `push --force`, `clean -f`,
  `branch -D`) without explicit confirmation.
- Only create branches, commit, push, merge, or tag when the user explicitly asks.

## Database/Supabase rules

- Do not run `npx supabase db push` automatically.
- Prepare migrations only and list the exact manual Supabase command for the user.
