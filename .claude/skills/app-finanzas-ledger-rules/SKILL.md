---
name: app-finanzas-ledger-rules
description: Use when editing transactions, transfers, debts, account balances, dashboards, budgets, imports, net worth, or any financial calculation in App Finanzas.
---

# App Finanzas Ledger Rules

Use this skill for financial logic.

## Core model

Use the simplified ledger:

- `transactions`: event header.
- `transaction_entries`: account balance movements.
- `transaction_allocations`: reporting/budget category classification.

## Source of truth

- Account balances come from posted `transaction_entries`.
- Reports, category spending, budgets, income, and expenses come from posted `transaction_allocations`.
- Do not use editable account balance fields as source of truth.
- Exclude voided/deleted transactions from official balances and reports.
- Pending transactions may be shown separately as projected balances only.

## Sign rules

Asset accounts:
- Income/deposit: positive entry.
- Expense/outflow: negative entry.
- Transfer out: negative entry.
- Transfer in: positive entry.

Liability accounts:
- New credit card/debt spending: negative entry.
- Payment reducing debt: positive entry.
- Adjustment increasing debt: negative entry.
- Adjustment reducing debt: positive entry.

## Transaction patterns

### Expense from checking
- transaction_type = expense
- one entry: checking negative
- one allocation: expense category positive

### Income to checking
- transaction_type = income
- one entry: checking positive
- one allocation: income category positive

### Transfer
- transaction_type = transfer
- at least two entries: source negative, destination positive
- no income/expense allocation
- must not affect monthly income or expenses

### Credit card purchase
- transaction_type = expense
- entry: credit card negative
- allocation: expense category positive
- increases liability and reduces net worth

### Credit card or debt principal payment
- transaction_type = transfer or debt_payment, based on current app convention
- entries: asset account negative, liability account positive
- no operational expense allocation for principal
- optional financial allocation only if current app supports it

### Debt payment with interest
- entries: cash/checking negative, liability positive for principal
- allocation: interest as expense
- optional allocation: principal as financial
- net worth decreases only by interest

## Validation expectations

When changing financial logic, manually test:
1. Asset account opening balance positive.
2. Liability account opening balance negative or displayed correctly according to UI convention.
3. Expense from asset reduces asset.
4. Expense on credit card increases liability.
5. Transfer does not change net worth.
6. Debt payment principal does not count as expense.
7. Interest counts as expense.
8. Dashboard totals match transaction list.
9. Budget actuals match allocations.
10. Voided/deleted records are excluded.
