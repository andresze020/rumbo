# Sprint 12 — Alpha Personal Use Plan

> Status: active Alpha validation document. Sprint 12 started as documentation-only, then produced real Alpha findings. Sprints 12.4, 12.5, and 12.6 addressed the first high-priority findings and UX frictions. Sprint 12.7+ will focus on compactness and remaining friction fixes based on 2026-06-04 alpha feedback.

## Objective

Use App Finanzas with **real personal/family financial data**, compare it against
current records (AndroMoney and/or bank/credit-card statements), and validate that the
core MVP produces trustworthy numbers across:

- Account balances
- Dashboard metrics
- Budgets
- Debts
- Net worth
- CSV import
- CSV export

The goal remains to gather **real usage evidence** before deciding what to build or fix next.

## Why this sprint exists

The MVP is feature-complete for personal use, but real Alpha usage is what proves whether the app can be trusted with actual finances. Sprint 12 deliberately delays post-MVP functionality until real usage proves what is actually missing or broken.

## Scope

- Importing or manually entering real accounts and a bounded slice of transactions.
- Reconciling App Finanzas numbers against AndroMoney / current records.
- Using the app for everyday entry.
- Logging every bug and friction encountered.
- Triaging findings into a prioritized fix list.
- Fixing only the issues that block or significantly degrade Alpha usage.

## Out of scope

Do **not** build, and do **not** treat as Alpha work unless real usage proves it blocking:

- Bank sync / open banking
- Advanced categorization rules / auto-categorization
- Recurring transactions
- Goals
- AI recommendations
- OCR / receipt scanning
- Stripe / billing
- Native mobile app
- Full account deletion
- External beta / multi-user invitations
- Advanced Payee / Vendor / Lender CRUD
- Any other post-MVP functionality

## Alpha success criteria

The Alpha is considered successful when **all** of the following hold:

1. **Balances reconcile.** Every active account's posted balance matches the current system of record within the agreed tolerance.
2. **Dashboard is trustworthy.** Monthly income, expenses, savings, and savings rate match an independent recomputation for the reconciled month.
3. **Budgets are correct.** Planned vs. actual per category matches expectations.
4. **Debts are correct.** Outstanding balances and principal paydown reflect reality, including non-base-currency debts.
5. **Net worth is correct.** Assets − liabilities matches the system of record at the chosen month-end.
6. **Import is safe.** CSV import does not create duplicates or silently drop valid rows.
7. **Export round-trips.** Exported CSVs contain data needed to rebuild/verify the ledger.
8. **A findings list exists.** Every bug/friction is logged and triaged, with Alpha blockers fixed or explicitly deferred with rationale.

## Progress update — Sprints 12.4 and 12.5

### Sprint 12.4 — Alpha Critical Bug Fixes

Branch: `sprint/12-4-alpha-critical-fixes`  
Tag: `v0.12.4-alpha-critical-fixes`

Fixed:

- `BF-002` — Mobile opening balance input blocked typed negative values.
- `BF-003` — Liability balances now display as absolute owed amounts while ledger remains signed internally.
- `BF-006` — Category parent options now refresh when category/reporting type changes.
- `BF-009` — Weak-password signup error now surfaces clearer Supabase password-specific message.

Database impact: none for these fixes. Liability sign handling was already correct in prior migration `20260601143624_fix_opening_balance_signed_amount.sql`.

### Sprint 12.5 — Alpha UX Friction Fixes

Branch: `sprint/12-5-alpha-ux-friction-fixes`  
Tag: `v0.12.5-alpha-ux-friction-fixes`

Fixed:

- `BF-010` — Added global Add Transaction as fixed FAB; mobile menu keeps text link.
- `BF-004` — Edit Account now scrolls to the edit form via `#account-edit-form` fragment.
- `BF-001` — Multi-currency exchange-rate UX redesigned across transaction, opening-balance, and debt forms.
- `BF-001 debt data` — `create_debt_with_account` RPC no longer hardcodes `exchange_rate_to_base = 1`; it now accepts `p_exchange_rate_to_base`.

Database impact: Sprint 12.5 added migration `20260603000100_debt_opening_balance_exchange_rate.sql`.

## Current FX behavior after Sprint 12.5

- Shared utility: `src/lib/fx.ts`.
- User-facing rate direction: **base→account**, e.g. `1 CAD = X COP`.
- Server actions invert user input before writing `exchange_rate_to_base`.
- Applied in:
  - `accounts/actions.ts` → `setOpeningBalanceAction`
  - `transactions/actions.ts` → `createManualTransactionAction`
  - `debts/actions.ts` → `createDebtAction`
- Auto-fetch exists in:
  - `TransactionForm`
  - `OpeningBalanceForm`
  - `DebtCreateForm`
- For future dates, the FX utility uses the latest available rate and shows a warning.

### Sprint 12.6 — Action Forms UX

Branch: `sprint/12-6-action-form-ux`  
Tag: `v0.12.6-action-form-ux`

Fixed:

- `BF-004` — Edit Account now opens in a `FormDialog` instead of inline, making it obvious that edit mode started.
- `BF-007` — Add Transaction from account card now opens transaction form with account preselected.
- `BF-010` — Global Add Transaction FAB button (bottom-right) appears on all dashboard pages; lazy-loads form data on first open.

New components:

- `src/components/form-dialog.tsx` — Reusable dialog wrapper for all action forms (URL-param based open/close, auto-navigate to clean URL on close).
- `src/components/global-add-transaction-button.tsx` — Client component for global transaction entry with lazy-loaded form data.
- `src/app/dashboard/quick-add-actions.ts` — Server action to fetch accounts/categories for the quick-add dialog.

UI pattern established:

- All create/edit/action forms now open in `FormDialog`, never inline.
- Forms are triggered by URL params (`?mode=create`, `?edit={id}`, `?pay={id}`).
- Cancel/close navigates to the clean URL, naturally dismissing the dialog.
- Pattern codified in `app-finanzas-ui-polish` skill for future form additions.

Database impact: none for Sprint 12.6.

### Sprint 12.7 — Critical Bug Fixes

Branch: `sprint/12-7-critical-bug-fixes`
Tag: `v0.12.7-critical-bug-fixes`

Fixed:

- `BF-020` — Transfer between non-base-currency accounts (COP→COP, base CAD) was storing `amount_base_currency = amount` instead of `amount × exchange_rate_to_base`, causing Total Assets to treat COP amounts as CAD. Both `create_transfer_transaction` and `update_transfer_transaction` RPCs now accept `p_exchange_rate_to_base`. TransactionForm shows auto-fetch FX field for transfers when accounts are non-base-currency.
- `BF-018` — Account field no longer resets when switching between Expense and Income. Switching to Transfer now pre-populates the From account with the currently selected account.
- `BF-011` — `GlobalAddTransactionButton` now refetches accounts and categories on every open instead of caching after first load, so newly created categories appear immediately.

Database impact: migration `20260604000100_transfer_exchange_rate.sql` — replaces `create_transfer_transaction` and `update_transfer_transaction` RPCs with versions that accept `p_exchange_rate_to_base numeric(18,8) default 1`.

### Sprint 12.8 — UX Compactness & Navigation

Branch: `sprint/12-8-ux-compactness`
Tag: `v0.12.8-ux-compactness`

Fixed:

- `BF-012` — Mobile menu extracted to `MobileMenu` client component; closes automatically on navigation via `usePathname()` + `useEffect`.
- `BF-013` — Accounts view: 3 sub-cards (Posted/Pending/Projected) replaced with compact inline text row; spacing reduced.
- `BF-014` — Transactions view: 3 sub-cards (Account/Category/Currency) replaced with single compact metadata line; spacing reduced to space-y-1; Void UX improved (inline confirm+reason+cancel instead of always-visible "Add reason" toggle).
- `BF-015` — Transaction rows now show category emoji icon before category name.
- `BF-019` — After transaction creation from FAB or account button, user is returned to origin page. Root cause was `addQueryParam` only accepting `/dashboard/transactions/*` returnTo paths.

Database impact: none for Sprint 12.8.

### Sprint 12.9 — Account Card Expand/Collapse + View Transactions

Branch: `sprint/12-9-account-card-expand`
Tag: `v0.12.9-account-card-expand`

Fixed:

- `BF-021` — New `AccountCardDetails` client component wraps each account card. Collapsed state shows a single compact row (name, type, currency, posted balance, chevron). Tap anywhere on the row to expand/collapse with animated grid-rows transition. Expanded section uses a styled container with: 3-column balance grid (Posted/Pending/Projected with divide-x separators), dot-separated meta row (institution, last four, net worth inclusion, opening balance status with color indicators), "View transactions →" link with ArrowRight icon, and action buttons (Edit, Add transaction, Set opening balance, Archive).
- `BF-016` — "View transactions →" link inside expanded detail navigates to `/dashboard/transactions?account_id={id}`, using the existing account filter on the transactions page.

Database impact: none for Sprint 12.9.

### Sprint 12.10 — Negative Cash Balance Guidance (BF-005)

Branch: `sprint/12-10-bf005-negative-cash-guidance`
Tag: `v0.12.10-bf005-negative-cash-guidance`

Fixed:

- `BF-005` — Smart suggestion dialog when user attempts to set negative opening balance on a Cash/Asset account. Dialog explains the impact (reduces assets) and offers two options: (1) "Create Liability account" to navigate to account creation, or (2) "Continue with negative" to allow the negative balance. Does not auto-convert account class; respects user choice.

Database impact: none for Sprint 12.10.

### Sprint 12.11 — Numeric Input Fix (BF-002)

Branch: `sprint/12-11-bf002-negative-input`
Tag: `v0.12.11-bf002-negative-input`

Fixed:

- `BF-002` — All monetary amount fields app-wide changed from `type="number"` to `type="text" inputMode="decimal"`. Desktop: no spinner that locks at 0.01. Mobile: decimal keyboard shows minus (−) button, allowing negative values to be typed. Fields changed: transaction form (add/edit/transfer), debt forms (create/edit/payment), budget planned amount (add/edit), opening balance. Left as `type="number"`: `sort_order` and `payment_due_day` (integers where spinner is appropriate).

Database impact: none for Sprint 12.11.

### Sprint 12.12 — Add Next + Multi-select Filters (BF-008, BF-017)

Branch: `claude/alpha-docs-pending-bugs-BAzGM`
Tag: `v0.12.12-bf008-bf017`

Fixed:

- `BF-008` — "Save & Add Next" button in the transaction form (income/expense only, not transfers). After saving, the server action redirects with `next_date`, `next_type`, `next_account`, and `next_status` URL params. `GlobalAddTransactionButton` detects these params via `useSearchParams`, auto-opens the dialog, pre-fills the form with the preserved context, increments `formKey` to force a fresh `TransactionForm` mount, and cleans the params via `router.replace()`. Layout FAB wrapped in `<Suspense>` for `useSearchParams()` support.
- `BF-017` — Account and Category filter selects changed to `<select multiple size={4}>`. URL params now support repeated `account_id`/`category_id` values. Parser uses `Array.isArray` check on the raw param. Client-side filter uses `.includes()`. `transactionsPath()` uses `params.append()` for arrays. `TransactionFilters` type updated: `accountIds: string[]`, `categoryIds: string[]`. Type and Status remain single-select.

Database impact: none for Sprint 12.12.

### Sprint 12.13 — Dashboard: Month-over-Month Deltas + Budget vs Actual

Branch: `claude/alpha-docs-pending-bugs-BAzGM`
Tag: `v0.12.13-dashboard-deltas-budget`

Implemented:

- **Month-over-month deltas** — Monthly activity cards (Income, Expenses, Savings, Savings Rate) now show a delta line below the value. A second `get_monthly_dashboard_summary` call fetches the previous month's data. Deltas are color-coded: green = improvement (income/savings up, expenses down), red = regression. Savings rate delta is shown in percentage points (pp). No delta is shown if the previous month has no data. `MetricCard` extended with optional `delta?: ReactNode` prop.
- **Budget vs Actual section** — New card on the dashboard between Monthly Activity and Expenses by Category. Calls `get_monthly_budget_details` for the selected month. Shows: a total summary bar (actual / planned with color-coded progress bar), and per-category rows (each clickable link to filtered transactions). Bar colors: green = on track (<80%), amber = near limit (≥80%), red = over budget. Empty state with "Create a budget" link when no budget lines exist. "View budget →" button in card header.

New helpers added to `dashboard/page.tsx`:
- `getPreviousMonthDate(month)` — computes YYYY-MM-01 for the month before `month`.
- `renderDelta(diff, currency, higherIsBad)` — returns colored `<span>` with arrow + amount + "vs last month".
- `renderRateDelta(diff)` — returns colored `<span>` for savings rate deltas in pp.

Database impact: none for Sprint 12.13.

### Sprint 12.14 — Tappable Metric Cards + 6-Month Trend Charts

Branch: `claude/alpha-docs-pending-bugs-BAzGM`  
Merged to `main` via PR #2.

Implemented:

- **Tappable metric cards** — All 8 dashboard metric cards (4 financial position + 4 monthly activity) now expand on tap to show a 6-month area trend chart. A `ChevronDown` icon indicates the card is tappable. The expand/collapse uses the same animated `grid-rows` CSS pattern used in account cards.
- **6-month trend charts** — Recharts 3.x `AreaChart` with gradient fill, hidden Y axis, labeled X axis (e.g. "Jan '26"), and a custom tooltip showing month + formatted value cleanly.
- **Lazy data loading** — Trend data is fetched only on first open via a server action; no extra DB calls on initial page render.
- **Monthly metrics** (Income, Expenses, Savings, Rate): 6 parallel calls to `get_monthly_dashboard_summary`.
- **Balance metrics** (Net Worth, Assets, Liabilities, Projected): 6 parallel calls to `get_account_balances` per month-end, then derived values computed client-side.
- **Savings rate chart** uses percent formatting; all others use compact currency notation (e.g. "$12.5K").

New files:
- `src/app/dashboard/trend-actions.ts` — `getDashboardTrend(metric, currentMonth, numMonths=6)` server action.
- `src/components/trend-chart.tsx` — Recharts `AreaChart` with custom tooltip component.

Key fixes during Sprint 12.14:
- Used `next/dynamic` with `ssr: false` to prevent Recharts browser APIs from crashing Next.js server pre-render (root cause of a Vercel build failure).
- Fixed Recharts 3.x type changes (`TooltipProps.payload` removed; `formatter` value typed as `undefined`-able).

New dependency: `recharts@3.8.1`.

Database impact: none for Sprint 12.14.

### Sprint 12.15 — UI Revamp: Categories, Debts, Budgets, Net Worth, Transactions

Branches: `claude/alpha-docs-pending-bugs-BAzGM` (transactions filters) + direct commits on `main` (categories, debts, budgets, net worth).

A broad UI consistency pass removing `Card` wrappers across secondary dashboard pages, replacing them with section headers (`<h2 className="px-1 text-sm font-medium text-muted-foreground">`) and `divide-y rounded-lg border` lists — matching the pattern already used on Accounts/Transactions. Most list rows became accordion-style expand/collapse components (`useState` + animated `grid-rows-[1fr]/[0fr]` transition), keeping collapsed rows compact and pushing detail/actions into an expandable panel.

**Categories**

- Removed the redundant `category_type` badge from each row (the section header — Income/Expense/System — already communicates it).
- `reporting_type` badge now only renders when it differs from `category_type`, cutting visual noise from rows where both tags were identical.
- Moved the "System" badge out of the always-visible row and into the expanded detail panel (`category.is_system`), so the list isn't dominated by repeated "System" tags.

**Debts** (new `debt-row.tsx`, new `debt-edit-form.tsx`)

- Extracted each debt into an accordion `DebtRow` client component: collapsed view shows name, status badge, and outstanding balance; expanded view shows account info, 4 detail tiles (principal, rate, minimum payment, due day), paydown progress bar, notes, and Edit / Register payment actions.
- Extracted the inline edit form into `DebtEditForm` (server component) for reuse and to declutter `page.tsx`.
- `page.tsx` rewritten: removed `Card` imports, organized into Active/Inactive sections with `<h2>` headers and `divide-y rounded-lg border` lists. Payment form remains inline in `FormDialog` (too many page-level props to extract cleanly).

**Budgets** (new `budget-line-row.tsx`)

- Extracted each budget line into an accordion `BudgetLineRow`: collapsed view shows category name, status badge (On track / Near limit / Over budget), transaction count, actual vs. planned; expanded view shows progress bar, 4 detail tiles (Planned/Actual/Remaining/Used), notes, and Edit / **View transactions →** / Remove actions.
- New **"View transactions →" link** (addresses suggestion #5 from Alpha follow-up): navigates to `/dashboard/transactions?category_id={id}&month={selectedMonth}`, pre-filtering the transactions list by that category and month directly from a budget line.
- `page.tsx` rewritten: removed all `Card`/`CardContent`/`CardHeader` imports; add/edit line forms moved into `FormDialog`; "No budget for this month" now a dashed-border block instead of a `Card`.

**Net Worth**

- Removed `Card` wrappers from all four sections (summary, evolution, assets, liabilities, excluded).
- Simplified `AccountList`: compact single row (name + type badge + archived badge + balance), base-currency balance only shown when the account currency differs from household base currency; removed redundant class/inclusion badges where the section already implies them.
- Monthly evolution bar thinned to `h-1.5` to match the compact visual language used elsewhere.

**Transactions** (new `transaction-filters.tsx`)

Addressed Alpha follow-up suggestions #1 (text + merchant search) and #3 (flexible date range including full year), plus a UX fix for a reported issue where filters and metric cards consumed ~60% of the screen on mobile:

- Extracted the filter form into a collapsible `TransactionFilters` client component. Collapsed by default (unless an advanced filter is already active, indicated by a badge count on the toggle button): shows just a search bar + sliders toggle + always-visible date-preset chips (This month, Last 30/60/90 days, This year).
- Expanding reveals date from/to, type, status, multi-select account and category — preserved via hidden inputs when collapsed so a search-only submit doesn't clear active filters.
- Added `date_from`/`date_to` query params with flexible custom ranges, falling back to the existing `month` param for backward compatibility with external links (account card "View transactions", budget line links).
- Search (`ilike`) already covered `description`, `merchant_name`, and `notes`.
- Replaced the 4 large `MetricCard`s (Visible/Pending/Voided/Imported, often showing 0) with a single compact stats line: `N transactions · <date range label> · X pending · X imported` (pending/imported only shown when > 0).

**Logged but not implemented (per user direction):**

- `BF-022` — Reconciliation flow (mark transactions as cleared against bank statements). Logged as P3/Deferred; candidate for Beta (v0.13), requires a schema migration.
- Account/category reconciliation tooling — discussed as suggestion #4, kept optional/deferred.

Database impact: none for Sprint 12.15 (UI-only changes).

### Sprint 12.16 — Multi-currency FX Rate Clarity (BF-001)

Branch: `fix/bf-001-multicurrency-fx-labels`.

Per the bug log's "Next decision" for BF-001 ("Do not build full automatic FX yet. First clarify labels/helper text and debt FX handling if low-risk"), this sprint clarified the exchange-rate UX in the three places it appears — **without** adding automatic FX lookups beyond the existing `fetchFxRate` auto-fill:

- **Clearer label**: changed from `1 {base} = ? {currency}` to `Exchange rate: 1 {base} = ? {currency}` so the field reads as a labeled rate input rather than a bare equation.
- **Plain-language helper sentence** added under each label explaining what the number means in context (e.g., "Enter how many COP make up 1 CAD. This converts the amount into CAD for your reports and totals"), tailored per form (account opening balance, transaction/transfer amount, debt outstanding balance).
- **Live conversion preview**: a real-time line below the rate field — e.g. `$1,000,000 COP ≈ $371.75 CAD at this rate` — computed from the entered amount and rate as the user types (`amountInBase = amountInForeignCurrency / rate`, matching the existing `exchange_rate_to_base = 1 / rate` storage convention). This directly targets the bug's "Expected result" of making the rate's effect on base-currency totals concrete and verifiable, helping users catch direction-reversal mistakes before saving.

Applied consistently to all 3 forms that collect a manual FX rate:

- `opening-balance-form.tsx` (account opening balances) — also addresses the "debt FX handling" angle indirectly since debts backed by a new liability account go through this same opening-balance flow.
- `transaction-form.tsx` (multi-currency income/expense, and cross-currency-safe transfers).
- `debt-create-form.tsx` (new debt with a new liability account in a non-base currency).

To compute the live preview, the amount inputs in `transaction-form.tsx` (`amount`) and `debt-create-form.tsx` (`opening_balance_amount`) were converted from uncontrolled to controlled inputs (`opening-balance-form.tsx` already tracked its amount in state). A small local `formatCurrency` helper (`Intl.NumberFormat` with `style: 'currency'`) was added to each form, following the existing per-file convention already used in `page.tsx`/`debt-row.tsx`/etc. (no shared formatter existed in the codebase).

Database impact: none (UI-only; no schema, RPC, or server action changes).

### Sprint 12.17 — Edit Transfer FX Overload Fix (BF-023)

Branch: `fix/bf-023-edit-transfer-overload` (or committed directly to main).

**Root cause (two-part bug):**

1. The BF-020 migration (`20260604000100_transfer_exchange_rate.sql`) used `CREATE OR REPLACE FUNCTION` with a new `p_exchange_rate_to_base` parameter. In PostgreSQL, adding a parameter creates a *new overload* rather than replacing the original — the old 8-param `update_transfer_transaction` still existed alongside the new 9-param version. PostgREST cannot resolve the ambiguity and returns an error on every edit-transfer call.

2. Even if the overload had been resolved, `updateTransferTransactionAction` was not sending `p_exchange_rate_to_base`, so every edit would silently re-save `exchange_rate_to_base = 1` (the RPC default), re-introducing the BF-020 data regression on each edit.

**Changes:**

- **`supabase/migrations/20260607000100_drop_update_transfer_overload.sql`** — `DROP FUNCTION IF EXISTS` the old 8-param overload. The 9-param version (with `p_exchange_rate_to_base default 1`) remains as the sole implementation.
- **`src/app/dashboard/transactions/transfer-edit-form.tsx`** — Added `baseCurrency` and `initialExchangeRateToBase` props. When `fromAccount.currency_code ≠ baseCurrency`, shows an exchange rate field with auto-fetch (via `fetchFxRate`) and a live conversion preview, pre-populated from the stored `exchange_rate_to_base` of the original entry (`userRate = 1 / initialExchangeRateToBase`). Submit is blocked until a valid rate is entered for non-base-currency transfers, matching the behavior of the create-transfer form.
- **`src/app/dashboard/transactions/actions.ts`** — `updateTransferTransactionAction` now reads `exchange_rate_to_base` from `formData` and forwards it as `p_exchange_rate_to_base` to the RPC.
- **`src/app/dashboard/transactions/page.tsx`** — `TransactionEntry` type and entries query now include `exchange_rate_to_base`. `TransferEditForm` receives `baseCurrency={household.base_currency}` and `initialExchangeRateToBase` from `transferOutEntry.exchange_rate_to_base`.

Database impact: **Manual Supabase command required** — run the new migration in the Supabase SQL Editor:
```sql
DROP FUNCTION IF EXISTS public.update_transfer_transaction(
  uuid, uuid, uuid, numeric, date, text, text, text
);
```

## Current remaining open issues

After Sprints 12.4–12.17:

| ID | Priority | Status | Next decision |
|---|---:|---|---|
| BF-023 | P1 | Fixed | [Sprint 12.17] Drop 8-param overload; add FX field to edit transfer form. |
| BF-020 | P0 | Fixed | [Sprint 12.7] Transfer FX rate bug. |
| BF-003 | P0 | Fixed | [Validated] Liability sign handling correct. |
| BF-018 | P1 | Fixed | [Sprint 12.7] Account field preserved across type changes. |
| BF-011 | P1 | Fixed | [Sprint 12.7] GlobalAddTransactionButton refetches on every open. |
| BF-002 | P1 | Fixed | [Sprint 12.11] All monetary inputs changed to type="text" inputMode="decimal". |
| BF-006 | P1 | Fixed | [Sprint 12.4] Category parent options refresh on type change. |
| BF-009 | P1 | Fixed | [Sprint 12.4] Weak-password error message clarified. |
| BF-012 | P2 | Fixed | [Sprint 12.8] Mobile menu auto-collapses after navigation. |
| BF-013 | P2 | Fixed | [Sprint 12.8] Accounts view compacted to single-row summary. |
| BF-014 | P2 | Fixed | [Sprint 12.8] Transactions view compacted; void UX improved. |
| BF-015 | P2 | Fixed | [Sprint 12.8] Transaction rows display category icons. |
| BF-016 | P2 | Fixed | [Sprint 12.9] View transactions link inside expanded account card. |
| BF-021 | P2 | Fixed | [Sprint 12.9] Account card expand/collapse with animation. |
| BF-005 | P2 | Fixed | [Sprint 12.10] Smart suggestion when setting negative cash balance. |
| BF-001 | P2 | Fixed | [Sprint 12.16] Clearer "Exchange rate:" label, plain-language helper text, and live conversion preview in all 3 FX-rate forms. Full automatic FX/API remains Post-MVP. |
| BF-017 | P3 | Fixed | [Sprint 12.12] Multi-select account/category filters. |
| BF-008 | P3 | Fixed | [Sprint 12.12] Save & Add Next flow in transaction dialog. |
| BF-022 | P3 | Open | Reconciliation flow — deferred to Beta. |

**Dashboard enhancements (non-bug, same branch):**

| Feature | Sprint | Description |
|---|---|---|
| Dashboard revamp | 12.12–12.13 | AccountCardDetails on dashboard, account icons/colors, category rows as clickable links to filtered transactions, section reorder. |
| MoM deltas | 12.13 | Colored ↑/↓ deltas vs last month on all 4 monthly metric cards. |
| Budget vs Actual | 12.13 | New dashboard card with per-category progress bars and total summary bar; links to filtered transactions. |
| Trend charts | 12.14 | All 8 metric cards expand on tap to show 6-month area chart (lazy loaded). |
| UI revamp (Cards → sections) | 12.15 | Categories badge cleanup, Debts/Budgets accordion rows + extracted forms, Net Worth compact account lists, Transactions collapsible filters + flexible date range + compact stats. |
| Budget line → transactions link | 12.15 | "View transactions →" on each budget line pre-filters by category + month. |
| FX rate clarity (BF-001) | 12.16 | "Exchange rate:" label, plain-language helper text, and live conversion preview in opening-balance, transaction/transfer, and debt-creation forms. |

## Recommended next phase — Beta Readiness (v0.13)

**All P0/P1/P3 issues are now resolved.** ✅  
**One P2 open:** BF-001 (multi-currency label UX) — low risk, can fix in a targeted sprint before Beta if real usage shows it remains a friction point.

**Validation phase:**

- Extended Alpha usage with all Sprints 12.7–12.16 fixes applied.
- Confirm balances still reconcile with AndroMoney/records.
- No new critical bugs surface from real usage.

**Decision point:**

With all Alpha blockers, P1, and P3 issues resolved (Sprints 12.4–12.16), the app is ready for **Beta Readiness Planning (v0.13)** whenever validation confirms numbers are stable.

## Real data privacy notes

This sprint involves **real personal/family financial data**. Treat it accordingly:

- Do not commit real CSVs, exports, statements, balances, account numbers, or screenshots with real figures.
- Keep working CSVs and exports outside the repo or in a git-ignored scratch folder.
- Redact real amounts/account identifiers in logs.
- Use structural notes such as “checking balance off by one transaction” rather than real figures.

## Definition of done — Sprint 12 overall

- Real accounts created and opening balances set at the chosen cutoff date.
- At least one recent period imported or entered and reconciled.
- Real daily usage completed and logged.
- Bug/friction log populated and triaged.
- Prioritized fix list produced.
- No unresolved **Alpha blocker** left undocumented.

## Sprint Execution Workflow (for Sprint 12.7+)

### Phase 1: Discovery & Logging (Week-long usage)
1. Use App Finanzas normally with real data.
2. Log findings in `alpha-daily-usage-log.md` (quick informal notes).
3. Record: what worked, where friction appeared, unexpected behaviors.

### Phase 2: Triage & Classification
1. Review findings using `alpha-finding-triage-rules.md` (Type + Priority rules).
2. Formalize entries in `bug-friction-log.md` as BF-018, BF-019, etc.
   - Complete field guide: area, type, priority, steps to reproduce, impact, workaround.
3. Update `bug-friction-log.md` summary counts.

### Phase 3: Sprint Planning
1. Select issues from `bug-friction-log.md` by priority:
   - **P0/P1** → must do in this sprint.
   - **P2** → do if time allows.
   - **P3** → defer to later sprint.
2. Give me a sprint prompt with explicit list of BF-IDs to fix.
3. I execute: code changes, validation, commit/push/documentation.

### Phase 4: Post-Sprint Update
1. **`bug-friction-log.md`:** Mark fixed issues as `Status: Fixed` with sprint tag.
2. **`sprint-12-alpha-plan.md`:** Add new section (e.g., "### Sprint 12.7 — [Title]") with:
   - Branch / Tag created.
   - Issues fixed + short description.
   - Database impact (if any).
   - Key implementation notes.
   - Updated "Current remaining open issues" and "Recommended next phase".
3. **`reconciliation-checklist.md`:** Run post-sprint validation to confirm balances/numbers are still correct.
4. **Git:** commit (code + docs), push, keep clean for next sprint.

### Phase 5: Validation (2-week usage)
1. Use the app with fixes applied.
2. Validate numbers still match AndroMoney / records.
3. Log any new findings → goes back to Phase 1.

### When to move to Beta Planning (v0.13)
- All P0/P1 issues closed or explicitly deferred.
- P2 friction reduced to acceptable levels.
- 2+ weeks of usage with no new critical bugs.
- Numbers/balances consistently validate.

## Related documents

- [real-data-import-plan.md](./real-data-import-plan.md) — FX convention, import validation
- [reconciliation-checklist.md](./reconciliation-checklist.md) — post-sprint validation checklist
- [bug-friction-log.md](./bug-friction-log.md) — all findings, issue tracker
- [alpha-daily-usage-log.md](./alpha-daily-usage-log.md) — quick usage notes
- [alpha-finding-triage-rules.md](./alpha-finding-triage-rules.md) — how to classify findings
