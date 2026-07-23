# Pending Work

> Documentation only. Single index of everything still open across the
> project: features not yet implemented, the BR/BF backlog, and Open
> Decisions tables scattered across individual feature docs. Each row is a
> pointer to its source of truth, not a duplicate — update the linked doc
> first, then update this index to match. Kept in sync by the
> `app-finanzas-state-sync` skill at sprint close.
>
> **Last refreshed 2026-07-22.** Since the previous refresh: the Tier-1
> easy-wins sprint and the transaction-form mobile redesign (PR #33) merged
> to `main`, and BR-023 (tags) + BR-024 (CSV presets/revert) are now in
> review as PR #34 / PR #35 (migrations pending `db push`).

---

## Features blocked or not yet built

| Feature | Status | Blocked by | Doc |
|---|---|---|---|
| ~~Navbar redesign~~ ✅ | **Shipped — Opción D (collapsible sidebar).** `AppSidebar` (desktop, grouped, collapsible w/ localStorage) + `MobileNav`/`MobileBottomNav`/`/dashboard/more` (mobile) + bottom user-avatar block → settings. | — | [features/navbar-redesign.md](./features/navbar-redesign.md) |
| User Settings page (`/dashboard/settings`) | Pending | Entry point exists (sidebar Settings group + bottom avatar block) | [features/user-settings.md](./features/user-settings.md) |
| Recurring transactions — Sprint B (auto-posting) | Pending | Multi-currency FX strategy must be reliable first | [features/recurring-transactions.md](./features/recurring-transactions.md) |
| Recurring transactions — Sprint C (dashboard widget + recurring transfers) | Pending | Needs a `to_account_id` schema migration | [features/recurring-transactions.md](./features/recurring-transactions.md) |
| Recurring transactions — inline create from the transaction form (UC-10) | 🟢 Inline-create **merged to `main`** (PR #17): frequency field posts the first + creates the template, `auto_post=false`. "repeats **automatically**" half still pending = Sprint B auto-posting | Auto-post half blocked by Sprint B (cron infra + FX-at-post) | [features/recurring-transactions.md](./features/recurring-transactions.md) |

## Open bugs / friction (Alpha real usage)

Source of truth: [alpha/bug-friction-log.md](./alpha/bug-friction-log.md).

| ID | Priority | Area | One-line |
|---|---|---|---|
| BF-022 | P3 | Transactions | Reconciliation flow (mark transactions "cleared") — deferred to Beta v0.13. |

> ✅ Merged to `main` (PR #17): **BF-024** (P1, date-filter Apply-reset) and
> **BF-025** (P2, mobile nav Plan → Accounts).

## BR backlog — not started (P1, near-term)

Full detail, "why soon," and acceptance criteria live in
[alpha/benchmark-follow-up-issues.md](./alpha/benchmark-follow-up-issues.md).

| ID | Area | One-line |
|---|---|---|
| BR-007 | Transfers / debts / FX | Cross-currency transfers and debt payments |
| BR-008 | Transactions | Pagination + server-side filters (list has no pagination today) |
| BR-010 | Rules / automation | `categorization_rules` designed but not migrated |
| BR-011 | Review workflow | ✅ Core already shipped (Sprint 4 + PR #17): `review_status` column, filter chips, bulk "Mark reviewed"/categorize, per-row control, dashboard "N to review" pill. Polished on branch `feat/br-011-review-queue-polish` (no migration): activated the "Review queue" nav entry (was locked "coming soon") → `/dashboard/transactions?review=unreviewed`, added bulk **Flag** / **Mark unreviewed**, and an "all caught up" empty state |

## BR backlog — not started (P2/P3)

| ID | Area | One-line |
|---|---|---|
| BR-014 | Recurring | Auto-post scheduler + failure log (depends on BR-002 reliability) |
| BR-017 | Accounts | ✅ Built on branch `feat/br-017-balance-adjustment` (migration `20260716130000`): `create_balance_adjustment` RPC + "Adjust balance" action on the accounts edit dialog — posts a ledger-safe `adjustment` entry to reconcile the posted balance, no allocation (excluded from reports/budgets), history preserved |
| BR-018 | Budgeting | ✅ Built on branch `feat/br-018-budget-rollover` (migration `20260716140000`): per-line `rollover_enabled` toggle + `get_budget_line_carryovers` RPC (accumulated planned−actual of prior rollover months). "Available = planned + carryover" folds into line remaining/progress and budget totals when enabled |
| ~~BR-023~~ 🟡 | Tags | **In review (PR #34, `feat/br-023-tags`).** `tags` + `transaction_tags` junction, `/dashboard/tags` CRUD, `TagMultiSelect` in add/edit forms, tag chips on rows, `tag_id` filter. Migration `20260722120000` pending `db push`. |
| ~~BR-024~~ 🟡 | CSV import | **In review (PR #35, `feat/br-024-csv-presets-revert`).** Saved column-mapping presets (`csv_import_presets`) + confirm-gated import revert (`revert_csv_import` soft-deletes a batch). Migration `20260722130000` pending `db push`. |
| ~~BR-029~~ ✅ | Transactions filters | **Merged to `main`** (PR #17) — broadened date presets + fixed the Apply-resets regression (BF-024) |

## Partially resolved (shipped, with a known gap)

| ID / Feature | What shipped | What's still missing | Doc |
|---|---|---|---|
| BR-021 | `/dashboard/month-review` recap + (branch `feat/br-021-health-score-close-month`, migration `20260716150000`) a **real** documented health score (`lib/health/score.ts`: savings rate 65% + budget adherence 35%, shared by dashboard + month-review, "Demo" labels removed) and a **light Close month** (`month_closures` marker + snapshot; reopenable; does NOT lock the ledger) | Close month is a soft marker only — no month-locking of transactions (deliberate, per product decision) | [alpha/benchmark-follow-up-issues.md](./alpha/benchmark-follow-up-issues.md) |
| BR-009 | ✅ **Fully resolved.** Slice 1 (payee picker, migration `20260716120000`) + Slice 2 (payees CRUD + search + filter, migration `20260717120000`). Slice 1: `create_manual_transaction`/`update_manual_transaction` take `p_payee_name` (+ `get_or_create_payee`) to write `payee_id`, merchant_name kept in sync; covers add/edit/inline/assistant forms. Slice 2: (a) `/dashboard/payees` management page — list with usage stats, create, rename → propagates to linked `merchant_name`, archive/restore, and **merge** duplicates via `merge_payees` RPC (reassign transactions, archive source); added `payees.is_archived` + `get_payees_with_stats` RPC + Money-group nav entry; (b) payee field is now a **searchable combobox** on Base UI Autocomplete (floating portal, no dialog clipping) across add/edit/inline; (c) transactions list takes a `payee_id` filter (all-time default + dismissible chip) reached from each payee's "View transactions" button; (d) field labeled **Payer** on income vs **Payee** on expense (`transactionForm.payer`, en/es/fr). | ✅ CSV import + recurring templates now carry a payee (Tier-1 residuals, migration `20260720130000`). Remaining: no **bulk** merge (one source at a time). | [alpha/benchmark-follow-up-issues.md](./alpha/benchmark-follow-up-issues.md) |
| BR-015 | Reusable `AlertDialog` now also adopted for account/category archive (previously fired with **zero** confirmation, not "no archive action" as this doc used to say — both actions already existed, just unguarded); toast+Undo added via the existing `ToastProvider` (PR #23, merged to `main`) | ✅ Void now has **Undo** (`unvoid_transaction` RPC, migration `20260720120000`); archive+undo generalized to goals and recurring templates (Tier-1). Nothing outstanding. | [alpha/benchmark-follow-up-issues.md](./alpha/benchmark-follow-up-issues.md) |
| BR-025 | ~20 files' duplicated `formatCurrency`/`formatMonthLabel`/label-casing helpers consolidated into `lib/format.ts` imports (PR #22, merged to `main`) | `formatPercent` still duplicated with diverging digit options per file (needs case-by-case verification before centralizing); day-level date formatters have no shared helper yet; ✅ locale now threads through dashboard/plan/budgets/transactions via `localeToBcp47(locale)` and `formatPercent` is deduped (Tier-1). Remaining: deep leaf cards still default to `'en'`; day-level date formatters have no shared helper yet | [alpha/benchmark-follow-up-issues.md](./alpha/benchmark-follow-up-issues.md) |
| BR-028 | PWA manifest `shortcuts` (Quick add / Transactions / Recurring) added; Quick add deep-links via a new `quick_add` URL param the transaction dialog provider recognizes (PR #21, merged to `main`) | ✅ Manifest `share_target` added (Tier-1) — a PWA share opens the expense quick-add prefilled. Remaining: shortcut/share behavior not yet verified in a real installed PWA. | [alpha/benchmark-follow-up-issues.md](./alpha/benchmark-follow-up-issues.md) |
| Goals — linked-account progress | Manual `current_amount`, contribute/withdraw via atomic RPC | Could eventually derive progress from the linked account's real ledger balance instead of manual entry — deliberately deferred | [features/goals.md](./features/goals.md) (Open Decisions) |

## Open decisions across feature docs

| Doc | Question |
|---|---|
| [features/recurring-transactions.md](./features/recurring-transactions.md) | Exchange rate to use at auto-post time (last known rate vs. API vs. fixed); cron infra (`pg_cron` vs. Vercel Cron) |
| [features/goals.md](./features/goals.md) | Whether a linked goal should derive progress from the account's real ledger balance instead of a manually-tracked `current_amount` |

## Deferred / parked (revisit only when triggered)

| ID | Area | Revisit when |
|---|---|---|
| BR-D01 | Attachments / receipts | Real usage proves receipt capture is needed, or OCR becomes a priority |
| BR-D02 | Investment performance | Core household cash/debt/budget flows are stable |
| BR-D03 | Bill split / reimbursements | Multi-member household usage creates real split/reimbursement needs |
| BR-D04 | Advisor / external access | Household invite/member management is shipped and used |
| BR-D05 | Advanced charts (Sankey, saved reports) | Users ask for deeper analysis than the BR-022 reports hub gives |
| BR-D06 | OCR / bank sync / billing | Explicit product decision; kept out of Alpha correctness work |
| BF-022 (Sprint 12 alpha plan) | Reconciliation flow (mark transactions "cleared") | Deferred to Beta; candidate for v0.13 |
| Beginner-friendly UX, idea #6 | AI assistant as the primary interface (vs. a supplementary drawer) | Out of scope of [features/beginner-friendly-ux.md](./features/beginner-friendly-ux.md); revisit if assistant usage data supports it |

---

## What's already done (so this list doesn't get re-proposed)

Everything in [alpha/benchmark-follow-up-issues.md](./alpha/benchmark-follow-up-issues.md)'s
"Resolved implementation issues" table, plus, shipped without a dedicated BR-ID:
analysis & planning screens (`/dashboard/reports`, `/dashboard/trends`,
`/dashboard/cash-flow`, `/dashboard/debt-planner`, and the non-mock parts of
`/dashboard/month-review`), active nav highlighting (desktop + mobile), and
the recurring "due soon" dashboard tile. Sprint 13 (quick wins) closed
BR-026 (middleware → proxy rename), BR-027 (removed 5 duplicate root-level
route stubs), and BR-012 (needs-review dashboard count); it also made partial
progress on BR-009 (`payees` table + backfill, no autocomplete yet) and
BR-015 (reusable `AlertDialog`, adopted for void only). PR #17 merged the
add-transaction form redesign, the amount calculator, category/account icon
fixes, and the transaction-filter/recurring/nav cluster (BF-024, BF-025,
BR-029, UC-10 inline recurring); PR #18 merged the native-form-design rollout
(shared `form-field.tsx` / `form-styles.ts` primitives) to every other entry
form — see [features/native-form-design.md](./features/native-form-design.md).
The **Tier-1 easy-wins** sprint (merged `3517c4b`) then landed BR-025 locale
threading, BR-028 `share_target`, BR-015 void Undo + goals/recurring archive,
and the BR-009 CSV/recurring payee residuals; and the **transaction-form
mobile redesign** (PR #33 + the `transaction-form-mobile-rows` / `-dense-mobile`
/ `-single-screen` merges) reworked the add/edit form into a mobile row-list +
full-screen `SelectorSheet` with a desktop popover-combobox grid.
See `AGENTS.md` → Current status for the up-to-date shipped-feature summary.
