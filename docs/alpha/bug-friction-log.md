# Bug / Friction Log

> Documentation only. Log every bug and friction found during Alpha real usage.
> Classify the **Type** and **Priority** using
> [alpha-finding-triage-rules.md](./alpha-finding-triage-rules.md).
>
> **Privacy:** describe issues structurally and **redact real amounts/account
> numbers**. Do not paste real financial figures into this file.

## Field guide

- **ID** — short stable id, e.g. `BF-001`.
- **Date found** — YYYY-MM-DD.
- **Area** — Accounts / Categories / Transactions / Transfers / Budgets / Debts /
  Net worth / Dashboard / CSV import / CSV export / Auth / Navigation / Other.
- **Type** — one of: `Alpha blocker` / `Important bug` / `UX friction` /
  `Nice-to-have` / `Post-MVP`.
- **Description** — what's wrong, in one or two sentences.
- **Steps to reproduce** — numbered, minimal steps.
- **Expected result** — what should happen.
- **Actual result** — what actually happened.
- **Financial impact** — does it produce a wrong number you rely on? (None / Display
  only / Wrong balance / Wrong report / Data loss / Duplicate data).
- **Frequency** — Always / Often / Sometimes / Once.
- **Workaround** — any way to get around it, or "None".
- **Priority** — P0 (blocker) / P1 (important) / P2 (nice) / P3 (later).
- **Status** — Open / Investigating / Fixed / Deferred / Won't fix.
- **Notes** — anything else, links to log entries, batch ids, related sprint/tag. Do not include real amounts.

## Log

| ID | Date found | Area | Type | Description | Steps to reproduce | Expected result | Actual result | Financial impact | Frequency | Workaround | Priority | Status | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| BF-001 | 2026-06-03 | Other / Multi-currency | UX friction | Entering exchange-rate conversion factors manually during setup was cumbersome and created high friction. Debts also needed clearer exchange-rate handling when debt currency differed from household base currency. | 1. Create/edit non-base-currency account, transaction, or debt. 2. Try to enter conversion factor manually. 3. Repeat during setup. | Multi-currency setup should be understandable, low-friction, and consistent across accounts, transactions, and debts. | Before fix, user had to manually reason about conversion factors. Debt opening entries also defaulted to base conversion = 1 in the debt RPC. | Wrong report | Often | Before fix: manually calculate and verify rates. | P2 | Fixed | Fixed in `v0.12.5-alpha-ux-friction-fixes`. Implemented shared `src/lib/fx.ts`, auto-fetch FX, base→account user-facing rate (`rate_base_to_account`), and server-side inversion to `exchange_rate_to_base`. Also fixed debt RPC exchange-rate handling via migration `20260603000100_debt_opening_balance_exchange_rate.sql`. |
| BF-002 | 2026-06-03 | Accounts | Important bug | On mobile, the opening balance input did not allow typing a negative value directly, while pasting a negative value worked. | 1. Open app on mobile. 2. Create/edit account. 3. Try to type a negative opening balance. | The input should allow valid negative values where supported by the account/setup flow. | Mobile keyboard/input blocked typing the negative sign. | Wrong balance | Often | Before fix: copy/paste the negative value. | P1 | Fixed | Fixed in `v0.12.4-alpha-critical-fixes`. Opening balance input changed from `type="number"` to `type="text"` with `inputMode="decimal"`. |
| BF-003 | 2026-06-03 | Accounts / Net worth | Alpha blocker | Liability account opening balance sign/display needed validation. Liability balances must be stored/displayed consistently so balances and net worth are correct. | 1. Create liability account. 2. Enter owed opening balance. 3. Review account balance, total liabilities, and net worth. | User should enter/understand the owed amount clearly; ledger should store signed value correctly; net worth should decrease by liability amount. | DB RPC already used `-abs()` correctly, but UI displayed confusing negative values for liabilities. | Wrong balance | Sometimes | Before fix: manually verify liability balances/net worth. | P0 | Fixed | Fixed in `v0.12.4-alpha-critical-fixes`. UI now displays liability balances as absolute owed values with “balance owed” / “Posted (owed)” labels. No DB change needed for this specific issue. |
| BF-004 | 2026-06-03 | Accounts | UX friction | When editing an account lower on the Accounts page, the edit form opened but was not visually obvious. | 1. Go to Accounts. 2. Scroll to lower account. 3. Click Edit. 4. Observe edit form position. | UI should clearly move the user to the edit form or open an obvious editing surface. | User could miss that the form opened. | None | Often | Before fix: scroll manually and look for form. | P2 | Fixed | Fixed in `v0.12.5-alpha-ux-friction-fixes`. Added `id="account-edit-form"` to the edit card and `#account-edit-form` fragment to Edit links so browser scrolls to the form. This did not implement a drawer/modal; it used the lower-risk URL fragment approach. |
| BF-005 | 2026-06-03 | Accounts | UX friction | It is unclear what should happen if a Cash account has a negative opening balance. User wondered whether it should automatically become a liability. | 1. Create Cash account. 2. Enter negative opening balance. 3. Review account class, balance, net worth. | App should explain what a negative cash balance means and guide the user to create a liability/debt account if it represents money owed. | Current behavior after BF-002 fix: app accepts negative value; Cash remains Asset with negative balance, which is technically possible but may confuse users. | Wrong report | Once | Create a debt/liability account manually if the negative value represents money owed. | P2 | Open | Deferred during 12.4/12.5. Recommendation: do **not** auto-convert to liability. Add warning/helper text or validation guidance. Architect decision pending: warn vs block cash negatives vs leave as-is. |
| BF-006 | 2026-06-03 | Categories | Important bug | When creating a category, changing category type/reporting type did not refresh compatible parent category options. | 1. Go to Categories. 2. Start creating category. 3. Change category type/reporting type. 4. Open parent category selector. | Parent category options should refresh immediately and show only compatible parents. | Parent options stayed stale. | Wrong report | Often | Before fix: filter by type first, then create category. | P1 | Fixed | Fixed in `v0.12.4-alpha-critical-fixes`. Extracted `CategoryForm` into a client component with `useState` for `categoryType`, `reportingType`, and `parentId`; page passes `categoriesByIdRecord` as a serializable plain object. |
| BF-007 | 2026-06-03 | Accounts / Transactions | UX friction | From Accounts page, there is no shortcut to add a transaction with the selected account pre-populated. | 1. Go to Accounts. 2. Identify target account. 3. Try to add transaction from that account row. | Account row should have “Add transaction” action that opens/navigates to the transaction form with account preselected. | User must navigate to Transactions and select the account manually. | None | Often | Go to Transactions manually and select account. | P2 | Open | Deferred during 12.4/12.5. Proposed implementation: `/dashboard/transactions?mode=create&account_id={id}` if staying URL-state-driven, or drawer/modal if Sprint 12.6 action form UX adopts that pattern. |
| BF-008 | 2026-06-03 | Transactions | Nice-to-have | A “Save and add next” action would help when entering multiple similar transactions in a row. | 1. Add a transaction. 2. Need to add another similar transaction. 3. Observe repeated manual input. | Optional “Save and add next” should save and keep useful context such as date/account/category where appropriate. | Form resets completely after submission. | None | Sometimes | Add each transaction manually. | P3 | Open | Deferred. Do not build until daily usage logs show repeated high-frequency friction. |
| BF-009 | 2026-06-03 | Auth | Important bug | Creating an account with a weak password showed a misleading/generic error. | 1. Go to sign up. 2. Enter valid email and weak password. 3. Submit. | Error should clearly explain the password requirement that failed. | Error message did not clearly tell the user how to fix password. | None | Once | Before fix: try a stronger password manually. | P1 | Fixed | Fixed in `v0.12.4-alpha-critical-fixes`. `src/app/login/actions.ts` now inspects Supabase auth error message and surfaces password-specific messages verbatim. |
| BF-010 | 2026-06-03 | Navigation / Transactions | UX friction | A tester suggested adding a global Add Transaction action available from any main screen. | 1. Navigate to different app screens. 2. Try to create a transaction quickly without going to Transactions first. | User should be able to start adding a transaction quickly from anywhere. | Add Transaction was not globally accessible enough; nav button also risked crowding the navbar. | None | Often | Before fix: navigate to Transactions, then Add. | P2 | Fixed | Fixed in `v0.12.5-alpha-ux-friction-fixes`. Replaced crowded nav button with fixed circular FAB at bottom-right in dashboard layout. Mobile menu keeps text link. Added `pb-20` wrapper spacing so FAB does not cover content. |

## Additional implementation work discovered/documented

These changes were made during Sprint 12.4/12.5 and should be kept in project documentation even though they are broader than the original bug rows.

| ID | Sprint | Area | Description | Status | Documentation note |
|---|---|---|---|---|---|
| AD-001 | 12.5 | FX architecture | Added shared FX utility `src/lib/fx.ts` using the free historical currency API served through jsDelivr. It supports historical lookup, latest fallback, future-date latest handling, and explicit error return. | Implemented | Documented in `real-data-import-plan.md`, `reconciliation-checklist.md`, and `sprint-12-alpha-plan.md`. |
| AD-002 | 12.5 | FX convention | Changed user-facing exchange-rate direction to base→account, e.g. `1 CAD = X COP`; server actions invert before writing `exchange_rate_to_base`. | Implemented | Critical convention for future forms, docs, and tests. |
| AD-003 | 12.5 | Debts / DB RPC | Added `p_exchange_rate_to_base` to `create_debt_with_account` via migration; debt opening entries now store correct base-currency amount instead of hardcoded `exchange_rate_to_base = 1`. | Implemented | This is the only DB/migration change in 12.4/12.5. Requires manual Supabase push if not already applied. |
| AD-004 | 12.4/12.5 | Client components | Extracted server-rendered forms that needed interactivity into client components: `CategoryForm`, `OpeningBalanceForm`, and `DebtCreateForm`. | Implemented | Pattern: keep server page, pass serializable props, move dynamic state/effects into dedicated client component. |
| AD-005 | 12.5 | Navigation UX | Implemented global Add Transaction as fixed FAB instead of a crowded nav button. | Implemented | The app is still URL-state-driven; forms were not converted to drawer/modal in 12.5. |

## Summary counts

| Type | Count | P0 | P1 | P2 | P3 | Fixed | Open |
|---|---:|---:|---:|---:|---:|---:|---:|
| Alpha blocker | 1 | 1 | 0 | 0 | 0 | 1 | 0 |
| Important bug | 4 | 0 | 4 | 0 | 0 | 4 | 0 |
| UX friction | 4 | 0 | 0 | 4 | 0 | 3 | 1 |
| Nice-to-have | 1 | 0 | 0 | 0 | 1 | 0 | 1 |
| Post-MVP | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Additional documented work | 5 | 0 | 0 | 0 | 0 | 5 | 0 |

## Current remaining open issues after v0.12.5

1. `BF-005` — Cash account with negative opening balance: needs product/UX decision and likely warning/helper text.
2. `BF-007` — Add Transaction from account row/detail with account preselected.
3. `BF-008` — Save and add next: keep deferred until daily usage evidence justifies it.

## Suggested next implementation batch

Recommended next sprint if continuing UX fixes:

**Sprint 12.6 — Action Forms UX**

Focus:

1. `BF-007` — Add transaction from account with account preselected.
2. Consider drawer/dialog pattern for global Add Transaction and Edit Account if the project decides to move away from URL-state-driven inline forms.
3. Keep `BF-008` deferred unless usage logs prove high friction.
4. Decide `BF-005` warning/helper text vs blocking cash negatives.

Do not include:

- Full automatic FX redesign beyond what already exists.
- New post-MVP functionality.
- Financial calculation rewrites.
- Broad DB schema changes.

## Related documents

- [alpha-finding-triage-rules.md](./alpha-finding-triage-rules.md)
- [alpha-daily-usage-log.md](./alpha-daily-usage-log.md)
- [reconciliation-checklist.md](./reconciliation-checklist.md)
- [sprint-12-4-12-5-architect-handoff.md](./sprint-12-4-12-5-architect-handoff.md)
