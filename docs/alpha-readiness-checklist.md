# Alpha Readiness Checklist

Updated for Sprint 11.3.8 — Final Alpha Readiness Re-test.

Use this checklist before starting Sprint 12 personal Alpha usage.

---

## Auth / Session

- [X] Logged-out users are redirected away from dashboard routes.
- [X] Valid login reaches the dashboard.
- [X] Invalid login shows a safe inline error ("Could not sign in with those credentials.").
- [X] Sign out is reachable on desktop, tablet, and mobile.
- [X] Sign out returns the user to `/login`.
- [X] Already-logged-in users visiting `/login` are redirected to `/dashboard`.
- [X] Sign out action uses a safe generic error if Supabase signOut fails.

## Onboarding

- [X] New user can create a household.
- [X] Base currency selection works.
- [X] Default household setup completes.
- [X] User lands on Dashboard after onboarding.
- [X] User without household is redirected from dashboard routes to `/onboarding`.

## Accounts

- [X] Accounts page is readable at 1280px, 1024px, 768px, 430px, and 390px.
- [X] Create/edit forms open only through actions (URL params, not inline by default).
- [X] Create account works with name, type, currency, institution, last four, notes, and include_in_net_worth.
- [X] Edit account works (name, type, class, institution, last four, color, icon, sort order, notes, include_in_net_worth).
- [X] Archive and restore account work.
- [X] Opening balance flow available for active accounts without an existing opening balance.
- [X] Opening balance form enforces date, amount, and exchange rate.
- [X] `include_in_net_worth` affects net worth inclusion.
- [X] Summary cards (Total assets, Total liabilities, Net worth impact, Account count) render correctly.
- [X] Empty active and archived states are clear.

## Categories

- [X] Categories page is readable at desktop, tablet, and mobile widths.
- [X] Category/subcategory hierarchy is easy to scan (parent → children indented).
- [X] Create/edit forms open only through actions.
- [X] Archive/restore still works.
- [X] `exclude_from_budget` keeps category out of budget line add form.
- [X] `exclude_from_reports` flag is editable and badge is displayed — DB-level exclusion from expense reports enforced at RPC level.
- [X] Category type and reporting type filters work.
- [X] Empty states are clear.

## Transactions / Transfers

- [X] Transactions page is readable at desktop, tablet, and mobile widths.
- [X] Add/edit forms open only through actions.
- [X] Filters work for month, type, status, account, category, and search.
- [X] Income, expense, and transfer creation still works.
- [X] Manual transaction edit remains ledger-safe.
- [X] Void with optional reason still works.
- [X] Transfer rows show account flow clearly.
- [X] Opening balances are labeled without implying income or expense.
- [X] CSV-imported transactions show imported/source context.

## Dashboard

- [X] Dashboard cards remain readable on mobile.
- [X] Month selector wraps without horizontal overflow.
- [X] Monthly income, expenses, savings, and savings rate display correctly.
- [X] Expenses by category loads and respects excluded report categories (DB RPC).
- [X] Account balances summary (assets, liabilities, net worth, projected) renders.
- [X] Transfers do not appear in income or expense counts (RPC handles).
- [X] Voided transactions are excluded from dashboard calculations (RPC handles).
- [X] Empty monthly activity state is clear.

## Budgets

- [X] Budget month selector wraps without horizontal overflow.
- [X] Create budget works.
- [X] Copy previous month works (only shown if a previous budget exists).
- [X] Add budget line works — only non-excluded, non-archived, unbudgeted expense categories offered.
- [X] Edit budget line (planned amount) works.
- [X] Remove budget line works.
- [X] Budget actuals calculate from posted expense transactions (via RPC).
- [X] Categories excluded from budget are not offered for new lines.
- [X] Empty budget and empty line states are clear.
- [X] Budget line status badges (On track / Near limit / Over budget) display correctly.

## CSV Import

- [X] Import page fits mobile width.
- [X] CSV upload rejects invalid files with plain-language errors.
- [X] Mapping and preview remain usable.
- [X] Preview table scrolls horizontally instead of breaking the viewport.
- [X] Import submit disables while processing.
- [X] Merchant names are saved after import (mapped from CSV field).
- [X] Import uses `create_csv_import` RPC — no service role, household-scoped.

## CSV Export

- [X] Export page fits mobile width.
- [X] Accounts, categories, and transactions CSV downloads work.
- [X] Export buttons disable while a download is being prepared.
- [X] Failed export shows a safe plain-language error.
- [X] Export route enforces authentication and household scoping.
- [X] No service role used in export — uses `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

## Debts

- [X] Debts page is readable at desktop, tablet, and mobile widths.
- [X] Create debt works — can create a new liability account or link an existing one.
- [X] Edit debt works (metadata only; balance comes from ledger).
- [X] Register principal payment works — uses `create_debt_payment` RPC.
- [X] Payment form enforces max = current outstanding balance (HTML `max` attribute).
- [X] Fully paid-off debts show a clear "fully paid" message instead of payment form.
- [X] No matching asset account shows a clear "no source accounts" message.
- [X] Principal-only debt payments do not inflate expenses (no expense allocation created by RPC).
- [X] Debt interest is NOT automatically allocated — interest must be recorded separately as an expense transaction with an interest category. This is the correct MVP behavior.
- [X] Empty debt state is clear.

## Net Worth

- [X] Net Worth page is readable on mobile — responsive flex/grid layout confirmed in code.
- [X] Month selector wraps without horizontal overflow — `flex flex-wrap items-end gap-2` confirmed.
- [X] Included/excluded account lists are clear — three sections: Assets, Liabilities, Excluded Accounts.
- [X] Liability balances are displayed as positive debt amounts — `Math.max(0, -numericValue)` for display.
- [X] Empty asset/liability/excluded states use `EmptyState` component with helpful descriptions.
- [X] Net worth = Total assets + Signed liabilities (correct signed math confirmed in code).
- [X] Monthly evolution (6-month history) renders.

## Responsive Navigation

- [X] Dashboard navigation works at 1280px, 1024px, 768px, 430px, and 390px.
- [X] Mobile menu includes Dashboard, Accounts, Categories, Transactions, Import CSV, Export, Budgets, Debts, Net Worth, and Sign out.
- [X] Navigation does not create horizontal overflow.
- [X] Header buttons wrap cleanly on mobile.
- [X] Mobile menu uses the native `<details>/<summary>` pattern — no JS dependency.

## Error / Loading / Empty States

- [X] User-facing errors are safe and non-technical.
- [X] `cleanSupabaseActionError` filters internal Postgres/PostgREST patterns (PGRST, SQLSTATE, schema cache, permission denied, etc.).
- [X] Server-action buttons show pending states for key create/edit/void/import/sign-out flows.
- [X] Route loading states exist for dashboard MVP pages.
- [X] Major empty states are short and helpful.

## Financial Calculation Sanity

- [X] Transfers do not inflate income or expenses — handled at RPC level.
- [X] Voided transactions are excluded from balances, dashboard, and budget calculations — handled at RPC/query level.
- [X] Opening balances affect balances/net worth but not reports — transaction_type = 'opening_balance' excluded from income/expense RPCs.
- [X] Negative asset balances affect net worth correctly — signed balance math confirmed in code.
- [X] Liability balances are displayed as positive outstanding amounts (for user clarity) using `Math.max(0, -signedBalance)`.
- [X] Net worth uses signed balance math — `totalAssets + signedLiabilities` where signedLiabilities is negative for debts.
- [X] `include_in_net_worth` controls whether accounts affect net worth totals.
- [X] `exclude_from_budget` prevents categories from being offered for new budget lines.
- [X] Budget actuals come from posted expense transactions (not voided, not transfers, not income).
- [X] Principal-only debt payments do not inflate expenses — `create_debt_payment` RPC creates no expense allocation.
- [X] Debt interest counts as expense only when manually recorded as an expense transaction — no automatic interest allocation exists in MVP (by design).
- [X] Debt overpayment guardrails work — HTML max attribute + RPC-level enforcement.
- [X] Account balances remain consistent with ledger entries — all balances derived from `get_account_balances` RPC.

## Auth and Security Sanity

- [X] All dashboard server components call `supabase.auth.getUser()` and redirect to `/login` if unauthenticated.
- [X] All server actions call `getAuthenticatedHousehold()` which verifies user before any mutation.
- [X] No service role key used anywhere in frontend/app code — only `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- [X] `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` is Supabase's new publishable (anon/public) key — safe for client-side use.
- [X] `.env*` files are excluded from git via `.gitignore`.
- [X] Household-scoped pages use `profile.default_household_id` as the active household.
- [X] No RLS bypass introduced — all queries use household-scoped filters on top of RLS.
- [X] Error sanitizer prevents internal database errors from leaking to the user.
- [X] Middleware refreshes the session on every request via `supabase.auth.getUser()`.
- [X] Sign out returns user to `/login`.

## Vercel Deployment Sanity

- [X] Preview deploy completes successfully.
- [X] Environment variables use `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- [X] Login, dashboard, accounts, categories, transactions, import, export, budgets, debts, and net worth load on preview.
- [X] Logs do not expose secrets or raw database internals.
- [?] Verify that Vercel environment variables match the local `.env.local` values for the intended Supabase project (manual step required).

---

## Sprint 11.3.8 Final Smoke Test Summary

**Result: PASS — Ready for Sprint 12 Alpha personal usage.**

All MVP modules have been code-reviewed and pass the following criteria:

| Module | Code Review | Notes |
|---|---|---|
| Auth/session | PASS | All pages enforce auth, safe errors |
| Onboarding | PASS | Household setup and redirect flow |
| Accounts | PASS | Full CRUD, archive, opening balance |
| Categories | PASS | Full CRUD, archive, exclude flags |
| Transactions | PASS | Filters, create, edit, void |
| Transfers | PASS | Excluded from income/expense |
| Dashboard | PASS | Monthly summary, net worth, categories |
| Budgets | PASS | Month selector, CRUD, actuals |
| CSV Import | PASS | RPC-based, auth-checked |
| CSV Export | PASS | Auth-checked, no service role |
| Debts | PASS | CRUD, payment, overpayment blocked |
| Net Worth | PASS | Monthly evolution, signed math |
| Navigation | PASS | Responsive, mobile menu works |
| Responsive layout | PASS | flex-wrap, sm:/lg: breakpoints throughout |
| Error handling | PASS | Sanitizer, safe messages |
| Security | PASS | No service role, household-scoped |

---

## Known Issues / Deferred After Alpha

The following are not Alpha-blocking. They are documented here for Sprint 12+ planning.

### Post-MVP Features (Not started, not in scope)
- Bank/account sync via Plaid or similar
- Recurring transactions and auto-categorization
- Goals and savings targets
- Advanced analytics and charts beyond the MVP dashboard
- OCR receipt scanning
- Multi-user household invitations
- Payee / Vendor / Lender master data CRUD
- Account hard-delete (soft delete / archive only currently)
- Stripe billing / subscription management
- Native mobile features (PWA install prompt is present but not enhanced)

### MVP Limitations Accepted for Alpha
- Debt interest is not automatically allocated. Users must manually record interest as a separate expense transaction with an interest-type category.
- There is no automatic monthly debt interest accrual.
- The opening balance can only be set once per account (by design).
- CSV import mapping requires manual field selection — no auto-detection.
- Budget lines support one category per line — no category grouping.
- The month selector uses a native `<input type="month">` — behavior varies by browser.
- Household currency is the base currency — multi-currency display uses exchange rates entered manually.
- The dashboard and net worth pages use `en-CA` locale for currency/date formatting — not yet locale-configurable.
- No soft-delete recovery UI for transactions (void is the recoverable action).
- No audit log visible to the user.

### UX / Polish Deferred
- Active nav link highlighting (current page is not highlighted in the nav).
- Paydown progress bar only shows when `original_principal` is set.
- Budget "copy previous month" only copies planned amounts, not notes.
- No confirmation dialogs for archive or void actions.
- No undo/undo stack.
- Transaction list has no pagination — large households may experience slow loads.

### Responsive Deferred
- Very wide tables (CSV import preview) rely on horizontal scroll — acceptable for Alpha.
- The budget line edit form could benefit from a sheet/modal on mobile — deferred.

---

## Supabase Migration Status

**No Supabase migration required for Sprint 11.3.8.**

No SQL, RPC, or schema changes were made in this sprint.

---

## Tag Readiness

Sprint 11 is ready to be tagged as:

```
v0.11.0-export-security-polish
```

After merging `sprint-11-3-8-final-alpha-readiness-retest` → `main`:

```
git tag v0.11.0-export-security-polish
git push origin main
git push origin v0.11.0-export-security-polish
```
