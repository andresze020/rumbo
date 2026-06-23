# Goals & Funds

## Status

**Implemented.**
Migration `20260618000100_create_goals.sql` adds the `goals` table, RLS
policies, and the `apply_goal_adjustment` RPC. Applied to the remote project
(`karbhlstwxhjdnepglza`).

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

`public.goals`: `household_id`, `name`, `goal_type`, `target_amount`
(`> 0`), `current_amount` (`>= 0`, default 0), `currency_code`,
`target_date`, `linked_account_id` (FK to `accounts`, `on delete set null`,
indexed), `status`, `created_by`, timestamps. Check constraints enforce
`goal_type` and `status` enums. RLS allows any household member to select,
and household **editors** (member/admin/owner — same bar as
`transactions`/`budgets`) to insert/update. There is deliberately **no
delete policy** — goals use the soft `archived` status instead of physical
deletion, consistent with the project's archive-over-delete rule.

`current_amount` is plain metadata maintained by the contribute/withdraw
flow below — it is **not derived from `transaction_entries`**. Contributions
and withdrawals are not posted to the ledger; goals track savings progress
independently of account balances, even when a `linked_account_id` is set.
This is a deliberate scope decision for the MVP (see Open Decisions below),
not an oversight.

Contribute/withdraw go through `public.apply_goal_adjustment(p_goal_id,
p_household_id, p_delta)`, a `security invoker` RPC that locks the goal row
(`select ... for update`) before computing the new `current_amount`/`status`
and writing it in the same statement. Earlier versions of this feature did a
plain `select` + JS math + `update` from the server action, which let two
concurrent contributions silently clobber each other (lost update). The RPC
also re-checks `is_household_editor` and raises on an archived goal or an
over-withdrawal, so the server action only has to surface the Postgres error
message via `cleanSupabaseActionError`.

### Pages and actions

- `src/app/dashboard/goals/page.tsx` — server page: summary `MetricCard`s
  (active count, completed count, total saved vs. target for base-currency
  goals), and goals grouped into Active/Completed/Paused/Archived sections.
- `src/app/dashboard/goals/actions.ts` — server actions: `createGoalAction`,
  `updateGoalAction`, `contributeGoalAction`, `withdrawGoalAction`,
  `setGoalStatusAction`. Contribute/withdraw call `apply_goal_adjustment`
  (status `completed`/`active` is computed in Postgres, not in the action).
  `updateGoalAction`/`setGoalStatusAction` `.select('id')` after their
  `update()` and treat an empty result as a failure, since a Postgres
  `UPDATE` blocked by RLS returns no error by default — only an empty row
  set.
- `src/app/dashboard/goals/{goal-card,goal-form,goal-progress-form}.tsx` —
  presentational card, create/edit form, and a single contribute-or-withdraw
  form selected by a `mode` prop (one form-level `action`, matching the
  single-action-per-form convention used elsewhere in the app — no
  per-button `formAction` precedent exists in this codebase). `StatusBadge`
  (`src/components/status-badge.tsx`) has explicit styles for `paused`
  (amber), `completed` (emerald), and `archived` (muted) so the four goal
  statuses are visually distinct.
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
  goals instead of mock data; list items are keyed by `g.id` (not `g.name`),
  since two goals can share a name.
- `src/app/dashboard/plan/page.tsx` — Goals card now shows real active-goal
  count and total saved instead of a locked placeholder. "Total saved"
  includes `active`/`paused`/`completed` goals in the household's base
  currency (only `archived` is excluded), matching the same total on
  `/dashboard/goals` — it does not filter to `active` only, which would make
  the figure drop the moment a goal is reached.

---

## Open Decisions

| # | Question | Options | Decision |
|---|----------|---------|----------|
| 1 | Should a linked goal's progress be derived from the account's real ledger balance instead of a manually-tracked `current_amount`? | Manual `current_amount` (current) / Derive from `get_account_balances` for the linked account | Keep manual for now. Revisit if linked goals drift from their account balance in practice — deriving from the ledger would remove the double-entry (record the transfer *and* click Add funds) but raises open questions: what if the account funds more than one goal, or holds money outside any goal? |

---

## Verification

1. Migration is already applied (`npx supabase db push` was run against
   `karbhlstwxhjdnepglza`). `supabase/tests/br_019_goals_invariants.sql`
   has read-only invariant checks (Section A) plus a transactional exercise
   of `apply_goal_adjustment` that rolls back without leaving data (Section
   B) — both passed against real household data.
2. Open `/dashboard/goals`, create a goal with a target amount and an
   optional linked account.
3. Add funds, then withdraw funds; confirm the progress bar and status badge
   update, and that the goal auto-flips to "Completed" once
   `current_amount >= target_amount`.
4. Pause, resume, archive, and restore the goal; confirm it moves between
   sections correctly.
5. Confirm the dashboard goals-mini widget and `/dashboard/plan`'s Goals
   card reflect the same data.
6. Concurrency: submit two contributions to the same goal at nearly the same
   time (e.g. two browser tabs); the final `current_amount` must be the sum
   of both — `apply_goal_adjustment`'s row lock serializes them instead of
   one clobbering the other.
7. Permissions: a household member with the `member` role (not
   admin/owner) should be able to create/edit/contribute to a goal — the
   RLS policies use `is_household_editor`, not `is_household_admin`.
