# Reconciliation Checklist

> Documentation only. Use this to verify that App Finanzas matches your current system
> of record (AndroMoney and/or bank/credit-card statements) after each import slice.
>
> **Privacy:** when filling in the Pass/Fail and Notes fields, describe issues
> structurally and **redact real amounts/account numbers**. Do not commit real figures.

## How to use this checklist

1. Reconcile **one area at a time**, in roughly the order below.
2. For each row, compare the App Finanzas value to the system-of-record value.
3. Mark **Pass/Fail** and capture anything surprising in **Notes**.
4. Any **Fail** that affects a number you rely on → log it in
   [bug-friction-log.md](./bug-friction-log.md) and classify with
   [alpha-finding-triage-rules.md](./alpha-finding-triage-rules.md).
5. Fix **inputs** (mappings, opening balances, cutoff date), not app logic.

**Tolerance legend:**
- *Exact* = must match to the cent (0.00 difference).
- *FX tolerance* = small difference acceptable, attributable to exchange-rate choice.
- *Manual tolerance* = small difference acceptable for manually-counted values (cash)
  or market movement (investments).

---

## 1. Accounts

| Field | Detail |
|---|---|
| Compare in App Finanzas | Account list: every active account, its type, class, currency, and `include_in_net_worth` flag. |
| Compare in system of record | Your real list of accounts in AndroMoney / bank portals. |
| Expected tolerance | Exact (structure must match — every real account exists once, no extras, no missing). |
| Common causes of differences | Account created twice; wrong class (asset vs. liability); wrong currency; archived account still expected; account missing. |
| Pass / Fail | |
| Notes | |

## 2. Opening balances

| Field | Detail |
|---|---|
| Compare in App Finanzas | Each account's posted balance **with zero transactions imported** = its opening balance at the cutoff date. |
| Compare in system of record | Statement/snapshot balance for each account **at the cutoff date**. |
| Expected tolerance | Exact for bank/card accounts; Manual tolerance for cash; FX tolerance for non-base currency. |
| Common causes of differences | Opening balance date not set to cutoff; wrong sign on a liability; wrong exchange rate to base; used today's balance instead of cutoff balance. |
| Pass / Fail | |
| Notes | |

## 3. Transactions

| Field | Detail |
|---|---|
| Compare in App Finanzas | Transactions list for the reconciled month: count, dates, descriptions, amounts, categories. |
| Compare in system of record | Same month's transactions in AndroMoney / bank statement. |
| Expected tolerance | Exact (count and per-row amount); FX tolerance only for base-currency conversion. |
| Common causes of differences | Duplicate or dropped rows on import; wrong amount sign; date parsed in wrong order; transaction posted to wrong account; invalid rows silently expected to post. |
| Pass / Fail | |
| Notes | |

## 4. Transfers

| Field | Detail |
|---|---|
| Compare in App Finanzas | Transfers appear once as a movement between two accounts (not as income/expense), reducing one and increasing the other. |
| Compare in system of record | Same transfers in AndroMoney / statements. |
| Expected tolerance | Exact within a currency. Cross-currency transfers are **not supported** — confirm none were attempted. |
| Common causes of differences | Transfer imported as two categorized transactions (double counted in spending); transfer counted as expense; cross-currency transfer attempted. |
| Pass / Fail | |
| Notes | |

## 5. Credit cards

| Field | Detail |
|---|---|
| Compare in App Finanzas | Card account outstanding (liability) balance, displayed as amount owed; purchases increase it, payments decrease it. |
| Compare in system of record | Credit-card statement balance at the cutoff and month-end. |
| Expected tolerance | Exact (to the cent) for the statement balance. |
| Common causes of differences | Payment recorded as expense instead of transfer; sign convention reversed; opening owed amount wrong; pending vs. posted timing. |
| Pass / Fail | |
| Notes | |

## 6. Debt payments

| Field | Detail |
|---|---|
| Compare in App Finanzas | Debt outstanding balance after principal payments; principal paydown progress; payments recorded via the debt payment flow (not as expenses). |
| Compare in system of record | Loan/debt statement: outstanding principal and payments made. |
| Expected tolerance | Exact for principal balance; interest fields are reference metadata (not reconciled to the cent). |
| Common causes of differences | Principal payment logged as a normal expense; payment posted to wrong account; opening outstanding balance wrong; interest portion mixed into principal. |
| Pass / Fail | |
| Notes | |

## 7. Budgets

| Field | Detail |
|---|---|
| Compare in App Finanzas | For the reconciled month: planned vs. actual per category, remaining, and percent used; over/near/on-track status. |
| Compare in system of record | Your expected budget for that month and actual spend per category from AndroMoney. |
| Expected tolerance | Exact for actuals (they derive from posted expenses); planned amounts are your own inputs. |
| Common causes of differences | Category excluded from budget unexpectedly; transaction categorized differently than in AndroMoney; transfers/debt payments leaking into spending; archived category. |
| Pass / Fail | |
| Notes | |

## 8. Dashboard

| Field | Detail |
|---|---|
| Compare in App Finanzas | Monthly income, monthly expenses, monthly savings, savings rate, and expenses-by-category for the reconciled month. |
| Compare in system of record | Independent recomputation from AndroMoney / statements for the same month. |
| Expected tolerance | Exact for income/expense/savings; savings rate within rounding. |
| Common causes of differences | Transfers or debt payments counted as income/expense; pending vs. posted differences; month boundary (timezone) edge cases; category type misassigned. |
| Pass / Fail | |
| Notes | |

## 9. Net worth

| Field | Detail |
|---|---|
| Compare in App Finanzas | Total assets, total liabilities, and net worth at the chosen month-end (included accounts only). |
| Compare in system of record | Sum of real account balances (assets − liabilities) at the same month-end. |
| Expected tolerance | Exact for single-currency; FX tolerance when CAD/USD/COP are combined into base currency. |
| Common causes of differences | Account wrongly included/excluded from net worth; liability sign; exchange rate choice; an account's opening balance wrong. |
| Pass / Fail | |
| Notes | |

## 10. CSV import

| Field | Detail |
|---|---|
| Compare in App Finanzas | Import preview counts (valid/invalid/duplicate) vs. what actually posted; only valid rows become transactions. |
| Compare in system of record | The source CSV row count and contents for the month. |
| Expected tolerance | Exact: posted transactions = valid rows; no duplicates; invalid/duplicate rows logged, not posted. |
| Common causes of differences | Re-running an import and duplicating rows; valid rows dropped due to mapping; duplicate detection too strict/loose; header/encoding issues. |
| Pass / Fail | |
| Notes | |

## 11. CSV export

| Field | Detail |
|---|---|
| Compare in App Finanzas | Exported transactions/accounts/categories CSVs vs. what the app displays. |
| Compare in system of record | The in-app ledger (export should faithfully represent it; one row per entry/allocation combination). |
| Expected tolerance | Exact: totals rebuilt from the export match the app; transfers/opening balances/principal-only debt payments export with blank allocation fields; voided transactions included with status. |
| Common causes of differences | Misread sign/column; assuming one row per transaction instead of per entry/allocation; locale/encoding when reopening the CSV. |
| Pass / Fail | |
| Notes | |

---

## Sign-off

| Area | Pass/Fail | Reconciled month | Date | Notes |
|---|---|---|---|---|
| Accounts | | | | |
| Opening balances | | | | |
| Transactions | | | | |
| Transfers | | | | |
| Credit cards | | | | |
| Debt payments | | | | |
| Budgets | | | | |
| Dashboard | | | | |
| Net worth | | | | |
| CSV import | | | | |
| CSV export | | | | |

## Related documents

- [real-data-import-plan.md](./real-data-import-plan.md)
- [bug-friction-log.md](./bug-friction-log.md)
- [alpha-finding-triage-rules.md](./alpha-finding-triage-rules.md)
