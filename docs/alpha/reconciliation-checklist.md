# Reconciliation Checklist

> Documentation only. Use this to verify that App Finanzas matches your current system of record after each import/data-entry slice.
>
> **Privacy:** describe issues structurally and redact real amounts/account numbers. Do not commit real figures.

## How to use this checklist

1. Reconcile **one area at a time**.
2. Compare App Finanzas to AndroMoney/current records/bank statements.
3. Mark Pass/Fail and capture surprises.
4. Any Fail affecting a number you rely on → log it in [bug-friction-log.md](./bug-friction-log.md).
5. Fix inputs first: mappings, opening balances, cutoff date, FX rate. Do not assume app logic is wrong until inputs are confirmed.

**Tolerance legend:**

- *Exact* = must match to the cent.
- *FX tolerance* = small difference acceptable if attributable to exchange-rate choice.
- *Manual tolerance* = small difference acceptable for manually counted cash or market-movement values.

## Post-12.7 targeted validation (CRITICAL)

Use this section first after Sprint 12.7 because BF-020 (transfer FX bug) could have corrupted balances.

| Area | What changed | What to test | Expected result | Pass/Fail | Notes |
|---|---|---|---|---|---|
| Transfer in non-base currency | `BF-020` fixed exchange_rate_to_base hardcoding in transfer RPCs. | Create a transfer between two accounts in non-base-currency (e.g., COP→COP when base is CAD). Check Total Assets before/after. | Transfer reduces Total Assets by correct amount (converted via exchange rate), not by literal account-currency amount. | | |
| Transaction form account field | `BF-018` preserves account across type changes. | Start with Expense, select an account. Change to Income. Account should remain selected. Change to Transfer. Account should move to "From account". | Account persists correctly as you switch types. | | |
| Categories in Add Transaction | `BF-011` refetches categories on every open. | Create Categories → Add Transaction via FAB. Close dialog. Create another category. Re-open Add Transaction dialog. | New category appears in dropdown without page refresh. | | |

---

## Post-12.5 targeted validation (completed in previous sprints)

These areas were changed in Sprint 12.4/12.5 — only re-test if making changes to them.

| Area | What changed | What to test | Expected result | Pass/Fail | Notes |
|---|---|---|---|---|---|
| Mobile opening balance input | `BF-002` fixed typed negative input on mobile. | On mobile, type a negative value directly in an opening balance field where valid. | Negative sign can be typed; form validation behaves normally. | | |
| Liability balance display | `BF-003` displays liabilities as absolute owed values. | Create/review liability account opening balance. Check account card and net worth. | UI shows owed amount clearly; net worth uses signed liability internally. | | |
| Category parent filtering | `BF-006` moved category form to client component with live parent filtering. | Change category type/reporting type while creating/editing category. | Parent category options refresh and incompatible parent is cleared/prevented. | | |
| Weak password message | `BF-009` improved Supabase error display. | Try signup with weak password in test environment. | Error clearly explains password requirement. | | |
| Global Add Transaction | `BF-010` added fixed FAB. | Navigate to main dashboard pages. | FAB visible, usable, not covering content; mobile menu still has link. | | |
| Edit Account visibility | `BF-004` added `#account-edit-form` scroll target. | Click Edit for lower account. | Browser scrolls to the edit form clearly. | | |
| FX auto-fetch | `BF-001` added `src/lib/fx.ts` and auto-fetch. | Create non-base-currency transaction/opening balance/debt. | Rate auto-fills; future dates use latest with warning; manual fallback works. | | |
| Debt FX conversion | `BF-001 debt data` fixed debt RPC exchange rate. | Create non-base-currency debt with opening balance. | Base-currency liability/net worth reflects exchange rate, not 1:1. | | |

---

## 1. Accounts

| Field | Detail |
|---|---|
| Compare in App Finanzas | Account list: every active account, type, class, currency, include_in_net_worth flag. |
| Compare in system of record | Real list of accounts in AndroMoney/bank portals. |
| Expected tolerance | Exact. |
| Common causes of differences | Duplicate account; wrong class; wrong currency; archived/missing account. |
| Pass / Fail | |
| Notes | |

## 2. Opening balances

| Field | Detail |
|---|---|
| Compare in App Finanzas | Each account's posted balance with no post-cutoff transactions. |
| Compare in system of record | Statement/snapshot balance for each account at cutoff. |
| Expected tolerance | Exact for bank/card accounts; manual tolerance for cash; FX tolerance for non-base currency. |
| Common causes of differences | Wrong cutoff date; wrong liability sign; wrong base→account FX rate; used today's balance instead of cutoff balance. |
| Pass / Fail | |
| Notes | |

## 3. Transactions

| Field | Detail |
|---|---|
| Compare in App Finanzas | Count, dates, descriptions, amounts, categories for reconciled month. |
| Compare in system of record | Same month's transactions in AndroMoney/bank statement. |
| Expected tolerance | Exact; FX tolerance only for base conversion. |
| Common causes of differences | Duplicate/dropped rows; wrong sign; wrong date parsing; wrong account; invalid row expected to post. |
| Pass / Fail | |
| Notes | |

## 4. Transfers

| Field | Detail |
|---|---|
| Compare in App Finanzas | Transfer appears as movement between accounts, not income/expense. Also check Total Assets impact. |
| Compare in system of record | Same transfer in AndroMoney/statements. |
| Expected tolerance | Exact within same currency. For non-base-currency transfers, verify Total Assets impact matches (amount × exchange_rate_to_base). |
| Common causes of differences | Transfer imported as two expenses/income rows; cross-currency transfer attempted; (Sprint 12.7 FIX) non-base-currency transfer amount treated as base-currency (now fixed). |
| Pass / Fail | |
| Notes | **CRITICAL (Sprint 12.7):** If you created transfers in non-base-currency BEFORE Sprint 12.7, validate Total Assets manually. Those transfers may have corrupted balances. Re-create them after upgrade. |

## 5. Credit cards

| Field | Detail |
|---|---|
| Compare in App Finanzas | Outstanding liability balance displayed as amount owed. |
| Compare in system of record | Credit-card statement balance at cutoff/month-end. |
| Expected tolerance | Exact. |
| Common causes of differences | Payment recorded as expense; sign reversed; opening owed amount wrong; pending/posted timing. |
| Pass / Fail | |
| Notes | |

## 6. Debt payments and debt opening balances

| Field | Detail |
|---|---|
| Compare in App Finanzas | Debt outstanding balance, principal paydown, and base-currency liability value. |
| Compare in system of record | Loan/debt statement and expected FX conversion if non-base currency. |
| Expected tolerance | Exact for principal in account currency; FX tolerance in base currency. |
| Common causes of differences | Principal logged as normal expense; wrong account; wrong opening balance; wrong FX rate; old 1:1 debt FX behavior not migrated/applied. |
| Pass / Fail | |
| Notes | |

## 7. Budgets

| Field | Detail |
|---|---|
| Compare in App Finanzas | Planned vs actual per category, remaining, percent used. |
| Compare in system of record | Expected budget and actual spend per category. |
| Expected tolerance | Exact for actuals; planned amounts are user input. |
| Common causes of differences | Category excluded from budget; different categorization; transfers/debt payments leaking into spending. |
| Pass / Fail | |
| Notes | |

## 8. Dashboard

| Field | Detail |
|---|---|
| Compare in App Finanzas | Monthly income, expenses, savings, savings rate, expenses by category. |
| Compare in system of record | Independent recomputation for same month. |
| Expected tolerance | Exact for income/expense/savings; savings rate within rounding. |
| Common causes of differences | Transfers/debt payments counted as income/expense; pending vs posted; month boundary; category type mismatch. |
| Pass / Fail | |
| Notes | |

## 9. Net worth

| Field | Detail |
|---|---|
| Compare in App Finanzas | Total assets, liabilities, net worth at month-end. |
| Compare in system of record | Sum of real balances at same month-end. |
| Expected tolerance | Exact for single currency; FX tolerance when currencies combine. |
| Common causes of differences | Included/excluded account wrong; liability sign; exchange-rate choice; opening balance wrong. |
| Pass / Fail | |
| Notes | |

## 10. CSV import

| Field | Detail |
|---|---|
| Compare in App Finanzas | Preview counts and posted rows. |
| Compare in system of record | Source CSV row count and contents. |
| Expected tolerance | Exact: posted transactions = valid rows; invalid/duplicate rows not posted. |
| Common causes of differences | Re-running import; mapping errors; duplicate detection too strict/loose; header/encoding issues. |
| Pass / Fail | |
| Notes | |

## 11. CSV export

| Field | Detail |
|---|---|
| Compare in App Finanzas | Exported transactions/accounts/categories vs app display. |
| Compare in system of record | In-app ledger and expected totals. |
| Expected tolerance | Exact. |
| Common causes of differences | Misread sign/column; one row per entry/allocation assumption; locale/encoding in spreadsheet app. |
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
| Debt payments / debt FX | | | | |
| Budgets | | | | |
| Dashboard | | | | |
| Net worth | | | | |
| CSV import | | | | |
| CSV export | | | | |
| Post-12.5 targeted checks | | | | |

## Related documents

- [real-data-import-plan.md](./real-data-import-plan.md)
- [bug-friction-log.md](./bug-friction-log.md)
- [alpha-finding-triage-rules.md](./alpha-finding-triage-rules.md)
- [sprint-12-4-12-5-architect-handoff.md](./sprint-12-4-12-5-architect-handoff.md)
