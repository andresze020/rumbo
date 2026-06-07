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
| BF-001 | 2026-06-03 | Other / Multi-currency | UX friction | Entering exchange-rate conversion factors manually during setup is cumbersome and creates high friction. Debts may also need a clearer exchange value / exchange-rate field when debt currency differs from the household base currency. | 1. Create or edit an account/debt in a non-base currency. 2. Try to enter or validate the conversion factor manually. 3. Repeat for multiple accounts/debts. | Multi-currency setup should be understandable and low-friction, with clear labels for exchange rate/value and how it affects base-currency totals. | User must manually reason about and type conversion factors, which is error-prone and slows setup. Debts do not make the exchange value obvious enough. | Wrong report | Often | Manually calculate and enter the conversion factor carefully; verify totals after setup. | P2 | Fixed | [Sprint 12.16] Clarified FX rate UX without building automatic FX: (1) Label changed from "1 {base} = ? {currency}" to "Exchange rate: 1 {base} = ? {currency}" so the field reads as a rate, not an equation. (2) Added an explanatory helper sentence under the label stating in plain language what the number means and that it converts the entered amount into the household base currency for net worth/reports. (3) Added a live conversion preview line ("$1,000,000 COP ≈ $371.75 CAD at this rate") computed from the entered amount and rate, shown in real time as the user types — lets the user sanity-check the conversion direction and magnitude before saving instead of reasoning about it abstractly. Applied consistently to all 3 forms that collect an FX rate: opening balance (accounts), transactions/transfers, and debt creation (covers the "debt FX handling" half of this finding). No schema or automatic-FX changes — purely label/helper/preview clarity, as the bug log's "Next decision" specified. |
| BF-002 | 2026-06-03 | Accounts | Important bug | On mobile, the opening balance input does not allow typing a negative value directly, but pasting a negative value works. | 1. Open the app on mobile. 2. Create or edit an account. 3. Tap the opening balance field. 4. Try to type a negative value manually. 5. Paste the same negative value instead. | The input should allow valid negative values when the account/setup flow supports them, especially for liabilities or corrections. | Mobile keyboard/input blocks typing the negative sign, but pasted negative values are accepted. | Wrong balance | Often | Copy/paste the negative value into the field. | P1 | Fixed | [Sprint 12.11] Changed all monetary amount fields from type="number" to type="text" inputMode="decimal" app-wide (transaction form, edit forms, debt forms, budget forms, opening balance). Desktop: no spinner lock. Mobile: decimal keyboard shows minus button. |
| BF-003 | 2026-06-03 | Accounts / Net worth | Alpha blocker | Opening balance sign handling for liability accounts needs validation. Liability accounts must store/display owed balances consistently so account balances and net worth are correct. | 1. Create a liability account such as credit card or debt. 2. Enter an opening balance representing the amount owed. 3. Save the account. 4. Review account balance, total liabilities, and net worth. | The app should clearly accept the owed amount and convert/store it with the correct internal sign for liabilities. Net worth should decrease by the liability amount. | Needs verification; current behavior is unclear and may lead to wrong liability signs or wrong net worth. | Wrong balance | Sometimes | Manually verify liability balances and net worth after each liability setup. | P0 | Fixed | Alpha validation confirmed correct behavior: CC/Debt with opening balance correctly registers as liability and decreases net worth. Checking with negative balance correctly reduces assets. Internal sign handling was already correct from Sprint 12.4 fix. |
| BF-004 | 2026-06-03 | Accounts | UX friction | When editing an account located lower on the accounts page, the edit form opens but the user does not notice it opened. | 1. Go to Accounts. 2. Scroll to an account lower on the page. 3. Click Edit. 4. Observe where the edit form appears. | The UI should clearly move focus to the edit form, open a modal/drawer, or otherwise make it obvious that edit mode started. | The form opens, but it is not visually obvious; user may think nothing happened. | None | Often | Scroll manually and look for the form. | P2 | Fixed | [Sprint 12.6] Edit Account now opens in FormDialog. |
| BF-005 | 2026-06-03 | Accounts | UX friction | It is unclear what should happen if a cash account has a negative opening balance. User wonders whether it should automatically become a liability. | 1. Create a Cash account. 2. Enter a negative opening balance. 3. Review account class, balance, and net worth behavior. | The app should explain the meaning of a negative cash balance and guide the user to create a liability/debt account if the negative balance represents money owed. | Behavior/product rule is unclear. Auto-changing the account to liability could be confusing or dangerous. | Wrong report | Once | Manually create a liability/debt account if the negative cash value represents money owed. | P2 | Fixed | [Sprint 12.10] Smart suggestion dialog: when user tries to set negative opening balance on Cash/Asset account, dialog appears asking "Create Liability instead?" with option to proceed or continue with negative. Does not auto-convert; respects user choice. |
| BF-006 | 2026-06-03 | Categories | Important bug | When creating a category, changing category type/reporting type does not refresh the available parent category options. | 1. Go to Categories. 2. Start creating a category. 3. Change the category type/reporting type, for example between income and expense. 4. Open the parent category selector. | Parent category options should refresh immediately and only show compatible parent categories for the selected type/reporting type. | Parent category options stay stale. Workaround is to filter income/expense first and then create the category. | Wrong report | Often | Filter by the desired type first, then create the category. | P1 | Fixed | [Sprint 12.4] Category parent options now refresh when category/reporting type changes. |
| BF-007 | 2026-06-03 | Accounts / Transactions | UX friction | From an account detail/list item, there is no quick Add Transaction action that opens the transaction form with that account preselected. | 1. Go to Accounts. 2. Identify the account where a transaction should be added. 3. Try to add a transaction directly from that account. | There should be an Add Transaction action from the account context, prepopulating the selected account in the transaction form. | User must navigate manually to Transactions/Add Transaction and select the account again. | None | Often | Go to Transactions manually and select the account. | P2 | Fixed | [Sprint 12.6] "Add transaction" button on each account card now opens transaction form with account preselected. |
| BF-008 | 2026-06-03 | Transactions | Nice-to-have | A new “Add next” action would help when entering multiple transactions in a row by saving the current transaction and keeping useful fields from the previous one. | 1. Add a transaction. 2. Need to add another similar transaction. 3. Observe that the form resets or requires repeated manual input. | Optional Add Next should save and keep useful context such as date, category, merchant, account, or selected transaction type where appropriate. | User must repeatedly re-enter common fields. | None | Sometimes | Add each transaction manually. | P3 | Fixed | [Sprint 12.12] “Save & Add Next” button in transaction form (income/expense only). After saving, server action redirects with next_date/next_type/next_account/next_status URL params. GlobalAddTransactionButton detects these via useSearchParams, auto-opens dialog with prefilled defaults, and cleans the URL. FormKey changes force a fresh form mount. |
| BF-009 | 2026-06-03 | Auth | Important bug | Creating an account with a weak password shows a misleading error message. | 1. Go to sign up. 2. Enter valid email and weak password. 3. Submit. 4. Read the error message. | The app should clearly explain the password requirement that failed, without confusing the user. | Error message is misleading and does not clearly tell the user how to fix the password. | None | Once | Try a stronger password manually. | P1 | Fixed | [Sprint 12.4] Weak-password signup error now surfaces clearer Supabase password-specific message. |
| BF-010 | 2026-06-03 | Navigation / Transactions | UX friction | A tester suggested adding a global Add Transaction button available from any screen. | 1. Navigate to different app screens. 2. Try to quickly create a transaction without first going to the Transactions page. | User should be able to start adding a transaction quickly from anywhere, ideally via a global action in navigation/header/mobile layout. | Add Transaction is not globally accessible. | None | Often | Navigate to Transactions, then add. | P2 | Fixed | [Sprint 12.6] FAB (floating action button) bottom-right on all dashboard pages; lazy-loads form data on first open. |
| BF-011 | 2026-06-04 | Categories | Important bug | When creating a subcategory and navigating to add a transaction, the new subcategory does not appear in the transaction form category dropdown until page refresh. | 1. Go to Categories. 2. Create a new subcategory. 3. Navigate to Transactions → Add transaction. 4. Open category selector. | Newly created categories/subcategories should be immediately available in the transaction form without requiring a page refresh. | New subcategory is absent from the dropdown; appears only after manual page refresh. | Wrong report | Always | Manually refresh the page after creating a category. | P1 | Fixed | [Sprint 12.7] GlobalAddTransactionButton now refetches form data (accounts + categories) on every open instead of caching after first load. |
| BF-012 | 2026-06-04 | Navigation | UX friction | On mobile, when selecting a menu item from the hamburger menu, the menu does not auto-collapse, leaving it open and consuming screen space. | 1. Open the app on mobile. 2. Tap the hamburger menu. 3. Select a menu item/page. 4. Observe the menu state. | After a menu item is selected and navigation occurs, the menu should auto-collapse. | Menu remains open even after navigation, requiring user to tap the menu again to close it. | None | Always | Manually tap the menu icon again to collapse it. | P2 | Fixed | [Sprint 12.8] Extracted mobile menu into MobileMenu client component; uses usePathname() + useEffect to set detailsRef.open = false on every route change. |
| BF-013 | 2026-06-04 | Accounts | UX friction | Accounts page view is too expanded/verbose; account summary cards show too much detail at once, making it hard to scan and compare accounts. | 1. Go to Accounts page. 2. Observe the layout with multiple account rows. 3. Try to quickly compare account names and balances. | Account rows should be more compact by default, with expanded detail view only when the card is tapped/clicked. Summary-only view for quick scanning. | Accounts are verbose; user must scroll through lots of detail text to see all accounts. | None | Always | Scroll slowly and mentally filter. | P2 | Fixed | [Sprint 12.8] Replaced 3 sub-cards (Posted/Pending/Projected) with a compact inline text row. Reduced card spacing from space-y-4 to space-y-3. Further expand-on-tap enhancement pending BF-016. |
| BF-014 | 2026-06-04 | Transactions | UX friction | Transactions table/list view is too expanded with many columns, making the page feel cluttered on both desktop and mobile. | 1. Go to Transactions page. 2. Scroll through transaction rows. 3. Observe spacing and column density. | Transaction rows should be more compact; show essential info (date, description, amount) and collapse less-critical detail (e.g., notes, account, currency) into an expand-on-tap detail row. | Transaction rows are wide and verbose, hard to scan through many rows without lots of scrolling. | None | Always | Scroll patiently. | P2 | Fixed | [Sprint 12.8] Replaced 3 sub-cards (Account/Category/Currency) with single compact metadata line. Reduced spacing to space-y-1. Void UX improved: "Add reason" removed from default view; Void button now shows inline confirm+reason+cancel. |
| BF-015 | 2026-06-04 | Transactions | UX friction | Transaction rows do not display the category icon, missing a quick visual cue for categorization. | 1. Go to Transactions page. 2. Review transaction rows. 3. Look for category icon or badge. | Each transaction row should display its category icon/badge for quick visual scanning (similar to many personal finance apps). | Category icon is not visible; only category name text is shown (if shown at all). | None | Sometimes | Read category name text. | P2 | Fixed | [Sprint 12.8] Added icon field to Category and CategoryLookup types and queries. Category icon emoji now appears before category name in transaction metadata line. |
| BF-016 | 2026-06-04 | Accounts / Transactions | Nice-to-have | From the Accounts summary, tapping an account card should navigate to a filtered Transactions view showing only that account's transactions. | 1. Go to Accounts. 2. Identify an account. 3. Tap the account card/row. 4. Expect to see filtered transactions. | Tapping an account should navigate to Transactions page with a pre-filter for that account, enabling quick transaction review for a specific account. | Tapping the card does not navigate or filter. | None | Sometimes | Go to Transactions, then manually select the account filter. | P2 | Fixed | [Sprint 12.9] "View transactions →" link inside expanded account card detail navigates to /dashboard/transactions?account_id={id}. |
| BF-021 | 2026-06-04 | Accounts | UX friction | Account cards were expanded by default with no way to collapse them, making the accounts list hard to scan. | 1. Go to Accounts. 2. Observe account cards with all details always visible. | Cards should be compact by default (just name, type, currency, balance) and expand on tap to show additional detail. | All detail always visible; accounts list was verbose and hard to scan quickly. | None | Always | Scroll patiently. | P2 | Fixed | [Sprint 12.9] AccountCardDetails client component: compact single-row summary (tap anywhere to expand/collapse); animated grid-rows expansion; expanded section shows 3-col balance grid, meta row with dot separators, View transactions link, and action buttons. |
| BF-017 | 2026-06-04 | Transactions | Nice-to-have | Transaction filters (type, status, account, category) are single-select dropdowns; would benefit from multi-select or dynamic filtering UI. | 1. Go to Transactions. 2. Open filter section. 3. Try to filter by multiple accounts or categories. | Filters should support multi-select or dynamic filter application (e.g., filter chips, range pickers) to speed up common queries. | Only one value per filter; user must create multiple filtered views or remember which filters are active. | None | Sometimes | Use filters one at a time and adjust. | P3 | Fixed | [Sprint 12.12] Account and Category filters changed to <select multiple size={4}>. URL params support repeated account_id/category_id values. Parsing uses Array.isArray check. Client-side filtering uses .includes(). transactionsPath() uses params.append() for arrays. Type/Status remain single-select. |
| BF-018 | 2026-06-04 | Transactions | Important bug | When adding a transaction from an account (via "Add transaction" button on account card) with a preselected account, changing the transaction type from Expense to Income (or vice versa) resets the account field back to empty. | 1. Go to Accounts. 2. Click "Add transaction" on an account row. 3. Form opens with account preselected. 4. Change transaction type from Expense to Income. 5. Observe account field. | The account field should remain populated and preselected after changing transaction type. | Account field resets to empty when transaction type changes. | None | Always | Manually re-select the account after changing transaction type. | P1 | Fixed | [Sprint 12.7] handleTransactionTypeChange no longer resets accountId when switching between income/expense. Switching to Transfer now pre-populates fromAccountId with the current account. |
| BF-019 | 2026-06-04 | Navigation / Transactions | UX friction | After successfully creating a transaction from the "Add transaction" button on an account (Accounts page) or FAB from any page, the user is redirected to the Transactions page instead of returning to the origin page (Accounts or wherever they started). | 1. Go to Accounts page. 2. Click "Add transaction" on an account. 3. Complete form and submit. 4. Observe navigation destination. | After transaction creation, user should return to the page they came from (Accounts, Dashboard, etc.), not always to Transactions. | Always redirects to Transactions page regardless of origin. | None | Always | Navigate back manually using browser/menu. | P2 | Fixed | [Sprint 12.8] TransactionForm now accepts returnTo prop (hidden input). GlobalAddTransactionButton passes usePathname() as returnTo. Root cause was addQueryParam only accepting /dashboard/transactions/* paths — now accepts any /dashboard/* path. |
| BF-022 | 2026-06-06 | Transactions | Nice-to-have | Transaction list has no reconciliation flow — no way to mark transactions as cleared against a bank statement. | 1. Go to Transactions. 2. Identify a transaction that matches a bank statement line. 3. Try to mark it as reconciled. | Each transaction should have a reconciled/cleared state (distinct from posted/pending/voided) that allows cross-checking against bank statements. | No reconciliation field or flow exists. | None | Always | Use manual spreadsheet or AndroMoney comparison. | P3 | Open | Deferred: not blocking Alpha validation. Good candidate for Beta (v0.13). Requires schema migration (reconciled_at column on transactions or transaction_entries). |
| BF-020 | 2026-06-04 | Transfers / Multi-currency | Alpha blocker | When creating a transfer between two accounts in a non-base currency (e.g., COP→COP transfer with base currency CAD), the transfer amount is not converted to base currency for net worth/total assets calculation. The transfer amount is incorrectly interpreted as base currency. | 1. Create two checking accounts both in COP (e.g., Nu Cajas, Nu CC), base currency is CAD. 2. Create a transfer of 132,725 COP from Nu Cajas to Nu CC. 3. Observe Total assets: drops by ~132,725 CAD (incorrect). 4. Expected: should drop by ~51 CAD (132,725 COP ÷ 2,589 exchange rate). 5. Change transfer amount to 0.1 COP and observe Total assets corrects to expected value. | Transfer between accounts in non-base currency should convert the amount using the currency's exchange rate before adding/subtracting from global Total assets. A 132,725 COP transfer should only impact total assets by ~51 CAD, not 132,725 CAD. | Transfer of 132,725 COP causes Total assets to change by ~132,725 CAD instead of ~51 CAD. Balance within the account (Nu Cajas) is correct (COP is preserved), but global calculation treats COP amount as if it were CAD. | Wrong balance | Always (for any transfer in non-base currency) | Do not create transfers between non-base-currency accounts until this is fixed. | P0 | Fixed | [Sprint 12.7] Both create_transfer_transaction and update_transfer_transaction RPCs now accept p_exchange_rate_to_base and use it to compute amount_base_currency correctly. TransactionForm shows FX rate field (with auto-fetch) for transfers when from-account is non-base-currency. Migration: 20260604000100_transfer_exchange_rate.sql. |

## Summary counts (update as you go)

| Type | Count | Open P0 | Open P1 | Open P2 | Open P3 | Fixed |
|---|---:|---:|---:|---:|---:|---:|
| Alpha blocker | 2 | 0 | 0 | 0 | 0 | 2 |
| Important bug | 6 | 0 | 0 | 0 | 0 | 6 |
| UX friction | 9 | 0 | 0 | 0 | 0 | 9 |
| Nice-to-have | 4 | 0 | 0 | 0 | 1 | 3 |
| Post-MVP | 0 | 0 | 0 | 0 | 0 | 0 |

## Completed in prior sprints

**Sprint 12.6 — Action Forms UX**

✅ Fixed:
1. `BF-004` — Account edit now opens in FormDialog (not inline).
2. `BF-007` — Add Transaction from account card with preselected account.
3. `BF-010` — Global Add Transaction FAB button on all dashboard pages (lazy-loaded).
4. Form dialog pattern established for future forms.

## Suggested next fix batch

**Sprint 12.7 — COMPLETED** ✅

All three critical bugs fixed:
- ✅ `BF-020` (P0) — Transfer FX rate bug fixed; transfers in non-base-currency now correctly convert to base-currency amount.
- ✅ `BF-018` (P1) — Account field preserved across expense/income type changes.
- ✅ `BF-011` (P1) — Categories refetch on every dialog open.

**Sprint 12.8 — COMPLETED** ✅

- ✅ `BF-012` — Mobile menu auto-collapse after navigation.
- ✅ `BF-013` — Accounts view compact (inline Posted/Pending/Projected).
- ✅ `BF-014` — Transactions view compact + Void UX improved.
- ✅ `BF-015` — Transactions show category icons.
- ✅ `BF-019` — Return to origin page after transaction creation.

**Sprint 12.9 — COMPLETED** ✅

- ✅ `BF-021` — Account card expand/collapse: compact single-row summary, animated detail section with balance grid, meta, and actions.
- ✅ `BF-016` — View transactions link inside expanded account card.

**Sprint 12.10 — COMPLETED** ✅

- ✅ `BF-005` — Cash account negative balance: smart suggestion dialog when user tries to set negative opening balance on asset account.

**Sprint 12.11 — COMPLETED** ✅

- ✅ `BF-002` — All monetary amount fields changed to type="text" inputMode="decimal". No more spinner lock on desktop, minus button available on mobile.

**Sprint 12.12 — COMPLETED** ✅

- ✅ `BF-008` — "Save & Add Next" button in transaction form; dialog auto-reopens pre-filled with prior context; auto-closes after final save in batch.
- ✅ `BF-017` — Account and Category filters changed to multi-select; URL params support repeated values.

**Sprints 12.13–12.14 — Dashboard enhancements (no BF IDs)** ✅

- ✅ Dashboard revamp: AccountCardDetails on dashboard, account icons/colors, section reorder.
- ✅ Month-over-month deltas on all 4 monthly metric cards (colored ↑/↓ vs last month).
- ✅ Budget vs Actual section on dashboard (per-category progress bars, links to filtered transactions).
- ✅ All 8 metric cards tappable with 6-month trend area charts (lazy loaded, recharts).

**Post-MVP / Defer:**

- `BF-001` — Full automatic FX/API integration remains out of scope for Alpha (the label/helper/preview clarity portion was fixed in Sprint 12.16; only the "build automatic FX" half stays deferred to Post-MVP per the original triage note).

**Current open issues:** only `BF-022` (P3, Open/Deferred — transaction reconciliation, candidate for Beta v0.13).

## Related documents

- [alpha-finding-triage-rules.md](./alpha-finding-triage-rules.md)
- [alpha-daily-usage-log.md](./alpha-daily-usage-log.md)
- [reconciliation-checklist.md](./reconciliation-checklist.md)
