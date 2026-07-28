# Pending Work

> Documentation only. Single index of everything still open across the
> project: features not yet implemented, the BR/BF backlog, and Open
> Decisions tables scattered across individual feature docs. Each row is a
> pointer to its source of truth, not a duplicate — update the linked doc
> first, then update this index to match. Kept in sync by the
> `app-finanzas-state-sync` skill at sprint close.
>
> **Last refreshed 2026-07-27** — added the BR-030…BR-041 mobile-capture-parity
> block from [benchmark-review-mobile-money-managers.md](./benchmark-review-mobile-money-managers.md).
> Documentation only; no code or migrations changed.
>
> **2026-07-25.** PR #37 merged the hard backlog into `main`.
> BR-007, BR-008, BR-010, BR-014, BR-023 and BR-024 are shipped; their
> production migrations are applied. Recurring auto-post is operational with
> `pg_cron`. Full English, Spanish, and Canadian French UI coverage is
> implemented, and language preference persists in `profiles.locale`. The
> remaining closure gates are authenticated QA of PR #37 and installed-PWA
> verification.

Authenticated QA progress is recorded in
[alpha/pr-37-authenticated-qa.md](./alpha/pr-37-authenticated-qa.md):
pagination and combined Reports filters passed; CSV-rule application,
transaction-creating transfer/cost cases, and installed-PWA behavior still need
fixture/device execution.

---

## Features blocked or not yet built

| Feature | Status | Blocked by | Doc |
|---|---|---|---|
| ~~Navbar redesign~~ ✅ | **Shipped — Opción D (collapsible sidebar).** `AppSidebar` (desktop, grouped, collapsible w/ localStorage) + `MobileNav`/`MobileBottomNav`/`/dashboard/more` (mobile) + bottom user-avatar block → settings. | — | [features/navbar-redesign.md](./features/navbar-redesign.md) |
| ~~User Settings page (`/dashboard/settings`)~~ ✅ | **Shipped.** Profile, email change + pending confirmation, password, household name/base-currency policy, theme, language and global sign-out. | — | [features/user-settings.md](./features/user-settings.md) |
| ~~Recurring — Sprint B (auto-posting)~~ ✅ | **Operational.** `run_recurring_autopost()` + failure log/badges and aggregate health alert. Migration applied; `pg_cron` extension enabled; daily job scheduled and working. FX = last known ledger rate. | — | [features/recurring-transactions.md](./features/recurring-transactions.md) |
| Recurring — Sprint C: recurring transfers (UC-9) | Pending — the "due soon" widget (UC-8) already shipped | Needs a `to_account_id` migration + transfer support in the form, manual post, and the auto-post job | [features/recurring-transactions.md](./features/recurring-transactions.md) |
| Recurring transactions — inline create from the transaction form (UC-10) | 🟢 **Merged to `main`.** Frequency posts the first transaction and creates a template. The user can enable auto-post on that template; automation infrastructure is operational. | — | [features/recurring-transactions.md](./features/recurring-transactions.md) |

## Open bugs / friction (Alpha real usage)

Source of truth: [alpha/bug-friction-log.md](./alpha/bug-friction-log.md).

| ID | Priority | Area | One-line |
|---|---|---|---|
| BF-022 | P3 | Transactions | Reconciliation flow (mark transactions "cleared") — deferred to Beta v0.13. |

> ✅ Merged to `main` (PR #17): **BF-024** (P1, date-filter Apply-reset) and
> **BF-025** (P2, mobile nav Plan → Accounts).

## BR backlog — near-term

Full detail, "why soon," and acceptance criteria live in
[alpha/benchmark-follow-up-issues.md](./alpha/benchmark-follow-up-issues.md).

| ID | Area | One-line |
|---|---|---|
| ~~BR-007~~ ✅ | Transfers / debts / FX | Shipped in PR #37: cross-currency transfers, transfer cost visibility and optional same-currency fees. |
| ~~BR-008~~ ✅ | Transactions | Shipped in PR #37: server-side search/filtering with pagination. |
| ~~BR-010~~ ✅ | Rules / automation | Shipped in PR #37: `categorization_rules` migration, CRUD and application flow. |
| BR-011 | Review workflow | ✅ Core already shipped (Sprint 4 + PR #17): `review_status` column, filter chips, bulk "Mark reviewed"/categorize, per-row control, dashboard "N to review" pill. Polished on branch `feat/br-011-review-queue-polish` (no migration): activated the "Review queue" nav entry (was locked "coming soon") → `/dashboard/transactions?review=unreviewed`, added bulk **Flag** / **Mark unreviewed**, and an "all caught up" empty state |

## BR backlog — mobile capture parity (BR-030…BR-041, not started)

Added 2026-07-27 from the mobile-app benchmark. Full rows (priority, first
slice, DB impact, verification) live in
[alpha/benchmark-follow-up-issues.md](./alpha/benchmark-follow-up-issues.md);
the observation record is
[benchmark-review-mobile-money-managers.md](./benchmark-review-mobile-money-managers.md).
All twelve were verified absent from the codebase on 2026-07-27 — that doc's
§5.1 lists what we already ship, so nothing here is a duplicate.

| ID | Priority | Area | One-line |
|---|---:|---|---|
| BR-030 | P1 | Accounts / credit cards | Statement cycle (statement day, payment day, billing account) → Balance Payable vs Outstanding, then a `Pay` settlement action |
| BR-031 | P1 | Multi-currency entry | Bidirectional dual-currency amount field with explicit rate re-fetch |
| BR-032 | P2 | UX speed / settings | User-configurable transaction-form fields (which optional fields render) |
| BR-033 | P2 | UX speed | Relative date chips (today / yesterday / two days ago) |
| BR-034 | P2 | Transactions | Duplicate ("Copy") an existing transaction — preferred over a bookmark/template entity |
| BR-035 | P2 | Transactions / cards | Installment purchases (fixed count + total, *n of N*) |
| BR-036 | P3 | Periods / budgets | Configurable month start day (payday-aligned period) — high blast radius |
| BR-037 | P3 | Reports | Calendar month view of per-day income/expense/net |
| BR-038 | P3 | Settings / display | Default landing scope + period, compact list, hide balance adjustments |
| BR-039 | P3 | Accounts / reporting | Per-account "transfer as expense" opt-in |
| BR-040 | P3 | Modelling | Refunds/rebates as a negative amount in the same category — decision first |
| BR-041 | P3 | Export | `.xlsx` export alongside CSV |

> Attachments/receipts stayed **BR-D01 (deferred)** on purpose — see the
> Deferred table below; the benchmark only added a reference implementation.

## BR backlog — not started (P2/P3)

| ID | Area | One-line |
|---|---|---|
| ~~BR-014~~ ✅ | Recurring | Operational auto-post scheduler, failure log and visible health state. |
| BR-017 | Accounts | ✅ Built on branch `feat/br-017-balance-adjustment` (migration `20260716130000`): `create_balance_adjustment` RPC + "Adjust balance" action on the accounts edit dialog — posts a ledger-safe `adjustment` entry to reconcile the posted balance, no allocation (excluded from reports/budgets), history preserved |
| BR-018 | Budgeting | ✅ Built on branch `feat/br-018-budget-rollover` (migration `20260716140000`): per-line `rollover_enabled` toggle + `get_budget_line_carryovers` RPC (accumulated planned−actual of prior rollover months). "Available = planned + carryover" folds into line remaining/progress and budget totals when enabled |
| ~~BR-023~~ ✅ | Tags | Shipped and migration applied: tags CRUD, transaction assignment/chips and tag filtering. |
| ~~BR-024~~ ✅ | CSV import | Shipped and migration applied: saved mapping presets and confirm-gated batch revert. |
| ~~BR-029~~ ✅ | Transactions filters | **Merged to `main`** (PR #17) — broadened date presets + fixed the Apply-resets regression (BF-024) |

## Partially resolved (shipped, with a known gap)

| ID / Feature | What shipped | What's still missing | Doc |
|---|---|---|---|
| BR-021 | `/dashboard/month-review` recap + (branch `feat/br-021-health-score-close-month`, migration `20260716150000`) a **real** documented health score (`lib/health/score.ts`: savings rate 65% + budget adherence 35%, shared by dashboard + month-review, "Demo" labels removed) and a **light Close month** (`month_closures` marker + snapshot; reopenable; does NOT lock the ledger) | Close month is a soft marker only — no month-locking of transactions (deliberate, per product decision) | [alpha/benchmark-follow-up-issues.md](./alpha/benchmark-follow-up-issues.md) |
| BR-009 | ✅ **Fully resolved.** Payee picker, CRUD, search, filtering and merge are shipped. This sprint adds multi-source bulk merge through atomic `merge_payees_bulk`; the migration is prepared locally. | Run `npx supabase db push`, then QA selection, survivor labels and archived sources. | [alpha/benchmark-follow-up-issues.md](./alpha/benchmark-follow-up-issues.md) |
| BR-015 | Reusable `AlertDialog` now also adopted for account/category archive (previously fired with **zero** confirmation, not "no archive action" as this doc used to say — both actions already existed, just unguarded); toast+Undo added via the existing `ToastProvider` (PR #23, merged to `main`) | ✅ Void now has **Undo** (`unvoid_transaction` RPC, migration `20260720120000`); archive+undo generalized to goals and recurring templates (Tier-1). Nothing outstanding. | [alpha/benchmark-follow-up-issues.md](./alpha/benchmark-follow-up-issues.md) |
| BR-025 | ✅ Full UI localization is implemented for `en`, `es`, and `fr`, including deep leaf components, UTC-safe daily dates/date ranges, dynamic dialogs, loading states, and accessible labels. Coverage is enforced by `npm run i18n:check`. | Nothing outstanding. | [features/localization.md](./features/localization.md) |
| BR-028 | PWA manifest `shortcuts` (Quick add / Transactions / Recurring) added; Quick add deep-links via a new `quick_add` URL param the transaction dialog provider recognizes (PR #21, merged to `main`) | ✅ Manifest `share_target` added (Tier-1) — a PWA share opens the expense quick-add prefilled. Remaining: shortcut/share behavior not yet verified in a real installed PWA. | [alpha/benchmark-follow-up-issues.md](./alpha/benchmark-follow-up-issues.md) |
| Goals — linked-account progress | Manual `current_amount`, contribute/withdraw via atomic RPC | Could eventually derive progress from the linked account's real ledger balance instead of manual entry — deliberately deferred | [features/goals.md](./features/goals.md) (Open Decisions) |

## Open decisions across feature docs

| Doc | Question |
|---|---|
| [features/recurring-transactions.md](./features/recurring-transactions.md) | UC-9 recurring-transfer schema and posting design; auto-post FX (`last known`) and cron infrastructure (`pg_cron`) are resolved. |
| [features/goals.md](./features/goals.md) | Whether a linked goal should derive progress from the account's real ledger balance instead of a manually-tracked `current_amount` |

## Deferred / parked (revisit only when triggered)

| ID | Area | Revisit when |
|---|---|---|
| BR-D01 | Attachments / receipts | Real usage proves receipt capture is needed, or OCR becomes a priority. Reference implementation recorded in the mobile benchmark (3 photo slots on entry + thumbnail on detail); still deferred, no BR-ID assigned |
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
