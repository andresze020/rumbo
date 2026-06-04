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
  `Nice-to-have` / `Post-MVP` (see triage rules).
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
- **Notes** — anything else, links to log entries, batch ids (no real amounts).

## Log

| ID | Date found | Area | Type | Description | Steps to reproduce | Expected result | Actual result | Financial impact | Frequency | Workaround | Priority | Status | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| BF-001 | 2026-06-03 | Other / Multi-currency | UX friction | Entering exchange-rate conversion factors manually during setup is cumbersome and creates high friction. Debts may also need a clearer exchange value / exchange-rate field when debt currency differs from the household base currency. | 1. Create or edit an account/debt in a non-base currency. 2. Try to enter or validate the conversion factor manually. 3. Repeat for multiple accounts/debts. | Multi-currency setup should be understandable and low-friction, with clear labels for exchange rate/value and how it affects base-currency totals. | User must manually reason about and type conversion factors, which is error-prone and slows setup. Debts do not make the exchange value obvious enough. | Wrong report | Often | Manually calculate and enter the conversion factor carefully; verify totals after setup. | P2 | Open | Do not build full automatic FX yet. First clarify labels/helper text and debt FX handling if low-risk. If automatic FX/API is required, classify that part as Post-MVP. |
| BF-002 | 2026-06-03 | Accounts | Important bug | On mobile, the opening balance input does not allow typing a negative value directly, but pasting a negative value works. | 1. Open the app on mobile. 2. Create or edit an account. 3. Tap the opening balance field. 4. Try to type a negative value manually. 5. Paste the same negative value instead. | The input should allow valid negative values when the account/setup flow supports them, especially for liabilities or corrections. | Mobile keyboard/input blocks typing the negative sign, but pasted negative values are accepted. | Wrong balance | Often | Copy/paste the negative value into the field. | P1 | Open | Likely an input type/inputMode/pattern issue. Verify on mobile browsers. |
| BF-003 | 2026-06-03 | Accounts / Net worth | Alpha blocker | Opening balance sign handling for liability accounts needs validation. Liability accounts must store/display owed balances consistently so account balances and net worth are correct. | 1. Create a liability account such as credit card or debt. 2. Enter an opening balance representing the amount owed. 3. Save the account. 4. Review account balance, total liabilities, and net worth. | The app should clearly accept the owed amount and convert/store it with the correct internal sign for liabilities. Net worth should decrease by the liability amount. | Needs verification; current behavior is unclear and may lead to wrong liability signs or wrong net worth. | Wrong balance | Sometimes | Manually verify liability balances and net worth after each liability setup. | P0 | Open | Treat as P0 until confirmed safe. If current behavior is correct, improve helper text/validation and downgrade to P1/P2. |
| BF-004 | 2026-06-03 | Accounts | UX friction | When editing an account located lower on the accounts page, the edit form opens but the user does not notice it opened. | 1. Go to Accounts. 2. Scroll to an account lower on the page. 3. Click Edit. 4. Observe where the edit form appears. | The UI should clearly move focus to the edit form, open a modal/drawer, or otherwise make it obvious that edit mode started. | The form opens, but it is not visually obvious; user may think nothing happened. | None | Often | Scroll manually and look for the form. | P2 | Open | Consider scroll-to-form, focus management, modal, drawer, or inline editing depending on current layout. |
| BF-005 | 2026-06-03 | Accounts | UX friction | It is unclear what should happen if a cash account has a negative opening balance. User wonders whether it should automatically become a liability. | 1. Create a Cash account. 2. Enter a negative opening balance. 3. Review account class, balance, and net worth behavior. | The app should explain the meaning of a negative cash balance and guide the user to create a liability/debt account if the negative balance represents money owed. | Behavior/product rule is unclear. Auto-changing the account to liability could be confusing or dangerous. | Wrong report | Once | Manually create a liability/debt account if the negative cash value represents money owed. | P2 | Open | Recommended: do not auto-convert cash to liability. Add warning/helper text or validation guidance. |
| BF-006 | 2026-06-03 | Categories | Important bug | When creating a category, changing category type/reporting type does not refresh the available parent category options. | 1. Go to Categories. 2. Start creating a category. 3. Change the category type/reporting type, for example between income and expense. 4. Open the parent category selector. | Parent category options should refresh immediately and only show compatible parent categories for the selected type/reporting type. | Parent category options stay stale. Workaround is to filter income/expense first and then create the category. | Wrong report | Often | Filter by the desired type first, then create the category. | P1 | Open | Could lead to categories being created under the wrong parent/type and later affecting reporting/budget grouping. |
| BF-007 | 2026-06-03 | Accounts / Transactions | UX friction | From an account detail/list item, there is no quick Add Transaction action that opens the transaction form with that account preselected. | 1. Go to Accounts. 2. Identify the account where a transaction should be added. 3. Try to add a transaction directly from that account. | There should be an Add Transaction action from the account context, prepopulating the selected account in the transaction form. | User must navigate manually to Transactions/Add Transaction and select the account again. | None | Often | Go to Transactions manually and select the account. | P2 | Open | Strong candidate for quick-capture improvement if low-risk. Preserve existing transaction logic. |
| BF-008 | 2026-06-03 | Transactions | Nice-to-have | A new “Add next” action would help when entering multiple transactions in a row by saving the current transaction and keeping useful fields from the previous one. | 1. Add a transaction. 2. Need to add another similar transaction. 3. Observe that the form resets or requires repeated manual input. | Optional Add Next should save and keep useful context such as date, category, merchant, account, or selected transaction type where appropriate. | User must repeatedly re-enter common fields. | None | Sometimes | Add each transaction manually. | P3 | Open | Useful but can wait. Avoid building until real daily usage proves batch/manual entry friction is high. |
| BF-009 | 2026-06-03 | Auth | Important bug | Creating an account with a weak password shows a misleading error message. | 1. Go to sign up. 2. Enter valid email and weak password. 3. Submit. 4. Read the error message. | The app should clearly explain the password requirement that failed, without confusing the user. | Error message is misleading and does not clearly tell the user how to fix the password. | None | Once | Try a stronger password manually. | P1 | Open | Important for onboarding, especially for first external testers. Check Supabase auth error mapping. |
| BF-010 | 2026-06-03 | Navigation / Transactions | UX friction | A tester suggested adding a global Add Transaction button available from any screen. | 1. Navigate to different app screens. 2. Try to quickly create a transaction without first going to the Transactions page. | User should be able to start adding a transaction quickly from anywhere, ideally via a global action in navigation/header/mobile layout. | Add Transaction is not globally accessible. | None | Often | Navigate to Transactions, then add. | P2 | Open | Strong candidate because fast transaction entry is an MVP success metric. Avoid changing transaction creation logic. |

## Summary counts (update as you go)

| Type | Count | P0 | P1 | P2 | P3 |
|---|---:|---:|---:|---:|---:|
| Alpha blocker | 1 | 1 | 0 | 0 | 0 |
| Important bug | 4 | 0 | 4 | 0 | 0 |
| UX friction | 4 | 0 | 0 | 4 | 0 |
| Nice-to-have | 1 | 0 | 0 | 0 | 1 |
| Post-MVP | 0 | 0 | 0 | 0 | 0 |

## Suggested first fix batch

Recommended next implementation batch:

**Sprint 12.2.1 — Alpha setup blockers and high-friction fixes**

Focus only on:

1. `BF-003` — Validate/fix liability opening balance sign behavior.
2. `BF-002` — Allow valid negative opening balance entry on mobile where appropriate.
3. `BF-006` — Refresh parent category options when category/reporting type changes.
4. `BF-009` — Improve weak password error message.
5. `BF-004` — Make account edit form opening obvious.
6. Optionally `BF-010` — Add global Add Transaction entry point if small and low-risk.

Do not include in the first fix batch:

- Full automatic exchange-rate integration/API.
- Full multi-currency redesign.
- `Add next` transaction flow.
- New post-MVP functionality.
- Database schema changes unless strictly required to fix an Alpha blocker.

## Related documents

- [alpha-finding-triage-rules.md](./alpha-finding-triage-rules.md)
- [alpha-daily-usage-log.md](./alpha-daily-usage-log.md)
- [reconciliation-checklist.md](./reconciliation-checklist.md)
