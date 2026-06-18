# Goals & Funds

## Status

**Implemented.**
Migration `20260618000100_create_goals.sql` adds the `goals` table. **Not yet
applied** — run `npx supabase db push`.

---

## Context

BR-019 (`docs/alpha/benchmark-follow-up-issues.md`) noted that goals/sinking
funds were designed in the initial schema doc
(`Documentation/3_1_app_finanzas_001_initial_schema.sql`) but never migrated,
and the nav entry pointed at a locked coming-soon page (`phase: 'beta'`).
This feature lets a household set savings targets (emergency fund, debt
payoff, down payment, travel, retirement, or custom), track progress against
an optional linked account, and record manual contributions/withdrawals.

Automation (e.g. auto-contributing from recurring transactions) is
explicitly out of scope for this MVP — manual-first, per project principles.

---

## Architecture

### Schema

`public.goals`: `household_id`, `name`, `goal_type`, `target_amount`,
`current_amount` (default 0), `currency_code`, `target_date`,
`linked_account_id`, `status`, `created_by`, timestamps. Check constraints
enforce `goal_type` and `status` enums and non-negative amounts. RLS allows
any household member to select, and only household admins to insert/update.
There is deliberately **no delete policy** — goals use the soft `archived`
status instead of physical deletion, consistent with the project's
archive-over-delete rule.

`current_amount` is plain metadata maintained by the contribute/withdraw
actions below — it is not derived from `transaction_entries`. Contributions
and withdrawals are not posted to the ledger; goals track savings progress
independently of account balances.

### Pages and actions

- `src/app/dashboard/goals/page.tsx` — server page: summary `MetricCard`s
  (active count, completed count, total saved vs. target for base-currency
  goals), and goals grouped into Active/Completed/Paused/Archived sections.
- `src/app/dashboard/goals/actions.ts` — server actions: `createGoalAction`,
  `updateGoalAction`, `contributeGoalAction`, `withdrawGoalAction`,
  `setGoalStatusAction`. Contribute/withdraw recompute `status` to
  `completed`/`active` based on whether `current_amount >= target_amount`.
- `src/app/dashboard/goals/{goal-card,goal-form,goal-progress-form}.tsx` —
  presentational card, create/edit form, and a single contribute-or-withdraw
  form selected by a `mode` prop (one form-level `action`, matching the
  single-action-per-form convention used elsewhere in the app — no
  per-button `formAction` precedent exists in this codebase).
- `src/lib/goals/shared.ts` — `GOAL_TYPES`, `GOAL_STATUSES`, type guards,
  `goalTypeLabel`, `goalProgress`, `isGoalReached`.

### Status lifecycle

`active` → `paused` (manual) → `active` (resume). `active` → `completed`
(automatic, computed on contribute/withdraw). Any non-archived status →
`archived` (manual soft-delete) → `active` (restore).

### Surfaces updated

- `src/lib/nav/config.ts` — nav entry moved from `phase: 'beta'` (locked) to
  `phase: 'alpha'`, pointing at `/dashboard/goals`.
- `src/app/dashboard/page.tsx` — goals-mini widget now reads real active
  goals instead of mock data.
- `src/app/dashboard/plan/page.tsx` — Goals card now shows real active-goal
  count and total saved instead of a locked placeholder.

---

## Verification

1. Apply the migration: `npx supabase db push`.
2. Open `/dashboard/goals`, create a goal with a target amount and an
   optional linked account.
3. Add funds, then withdraw funds; confirm the progress bar and status badge
   update, and that the goal auto-flips to "Completed" once
   `current_amount >= target_amount`.
4. Pause, resume, archive, and restore the goal; confirm it moves between
   sections correctly.
5. Confirm the dashboard goals-mini widget and `/dashboard/plan`'s Goals
   card reflect the same data.
