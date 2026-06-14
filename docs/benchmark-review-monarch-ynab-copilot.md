# App Finanzas Benchmark Review

> Product + technical audit against Monarch Money (household all-in-one), YNAB
> (disciplined budgeting), and Copilot Money (UX, automation, AI-ready clarity).
> **Audit-only — no application behavior was changed.** Read-only review of code,
> migrations, RPCs, RLS, components, and docs as of branch `main`
> (latest: recurring transactions manual-posting MVP, 2026-06-12).

---

## 1. Executive summary

**Overall readiness: ≈ 2.6 / 5** — a *solid, trustworthy single-user MVP* whose
ledger and security are genuinely strong, but which is still far from Monarch/
YNAB/Copilot on differentiators (rules, goals, reports, recurring automation,
review workflow) and on a few correctness gaps that matter specifically for a
multi-currency (COP/CAD) household.

- **Essentials avg ≈ 3.1 / 5** · **Differentiators avg ≈ 1.6 / 5** ·
  **Nice-to-have avg ≈ 1.3 / 5**

### Biggest strengths
1. **Ledger integrity (A2/A12).** A clean event-sourced model
   (`transactions` → `transaction_entries` → `transaction_allocations`), balances
   derived from entries, void-not-delete, exclude-from-reports honored at the RPC
   layer (including parent categories). This is benchmark-grade.
2. **Security / RLS (A12 = 5).** Every table has RLS; `SECURITY DEFINER` helper
   functions; household isolation enforced in both policies *and* RPCs; no service
   role on the client; error sanitizer; auth checks on every page/action.
3. **Multi-currency *foundation* (B1).** Currency + `exchange_rate_to_base` +
   `amount_base_currency` on every entry and allocation, plus live FX fetch
   (`lib/fx.ts`). This is exactly where Monarch is weak — a real opportunity.
4. **A working AI assistant (C2).** `/dashboard/assistant` already ships 5
   read-only, household-scoped, RLS-safe tools + a voice-note composer. Ahead of
   the benchmark on conversational data access.
5. **The "future" schema is already designed.** `Documentation/3_1_..._initial_schema.sql`
   contains 8 tables that were *designed but never migrated* (see §6) — meaning
   most differentiators are lower-risk to build than a greenfield.

### Biggest product gaps
- **No goals / sinking funds (A9/B5 = 0)**, **no rules engine (B3 = 1)**,
  **no review workflow (B7 = 0)** — all three are core Monarch/YNAB concepts.
- **Payee/merchant is a free-text field only (A4 = 2)** — fragments reporting,
  no autocomplete, no merchant→category memory.
- **Recurring is manual-post only (A8 = 2)** — no scheduler, reminders, or
  "due soon" surface; income/expense only.
- **No reports section (B8 = 2)** — no by-merchant/by-member/by-tag/multi-month
  trend; the transactions filter page is the closest thing.

### Biggest technical risks
1. **Multi-currency correctness holes (P0/P1).** CSV import hard-codes
   `exchange_rate_to_base = 1`; there is no `exchange_rates` table; net worth uses
   *frozen* per-transaction rates (no revaluation → FX gains/losses invisible);
   cross-currency transfers and debt payments are blocked. For a COP/CAD
   household this silently misstates base-currency totals on imported data.
2. **`npm run lint` is red (11 errors).** `react-hooks/set-state-in-effect` in
   `transaction-dialog-provider.tsx`, `trend-chart.tsx`, `theme-toggle.tsx`.
   **`tsc --noEmit` and `next build` both pass** (verified — Next 16 runs
   TypeScript during build but does **not** run ESLint, so lint does not block the
   prod build). Risk is therefore **CI / dev-health**, not a build blocker — but a
   separate `npm run lint` CI step would fail today, and `set-state-in-effect`
   points at avoidable re-renders.
3. **No transaction pagination.** The list fetches every row in range and
   filters account/category in JS — fine for Alpha, a scaling cliff later.

### Recommended next sprint focus
**Sprint 12.x "Multi-currency truth + correctness"** (P0): fix CSV import FX,
add the designed `exchange_rates` table + rate lookup, decide net-worth
revaluation, and clear the lint gate. This protects the ledger's credibility
before adding more features on top of it. Differentiators (rules → goals →
reports/recap) follow.

---

## 2. Scorecard

| Area | Criterion | Score | Priority | Complexity | DB? | UX? | Sprint |
|---|---|:--:|:--:|:--:|:--:|:--:|---|
| A1 | Accounts & net worth | 4 | P2 | M | ~ | ~ | 13.x |
| A2 | Transactions core | 4 | P1 | M | ~ | Y | 12.x |
| A3 | Categories & subcategories | 4 | P3 | S | N | ~ | — |
| A4 | Payee / merchant model | 2 | P1 | M | Y | Y | 13.x |
| A5 | Budgeting | 3 | P2 | L | Y | Y | 14.x |
| A6 | Transfers & CC payments | 3 | P1 | M | ~ | Y | 12.x |
| A7 | Debts | 3 | P2 | M | Y | Y | 14.x |
| A8 | Recurring & subscriptions | 2 | P1 | L | Y | Y | 13.x |
| A9 | Goals / sinking funds | 0 | P1 | L | Y | Y | 14.x |
| A10 | CSV import/export | 3 | P1 | M | Y | Y | 12.x |
| A11 | Dashboard | 4 | P2 | M | N | Y | 13.x |
| A12 | Security / RLS / privacy | 5 | P3 | S | N | N | — |
| A13 | Mobile / PWA | 3 | P2 | M | N | Y | 13.x |
| B1 | Real multi-currency | 3 | **P0** | L | Y | Y | 12.x |
| B2 | Household-first design | 3 | P2 | L | ~ | Y | 15.x |
| B3 | Rules engine / automation | 1 | P1 | L | Y | Y | 13.x |
| B4 | Monthly financial recap | 1 | P2 | M | Y | Y | 14.x |
| B5 | Non-monthly / sinking funds | 0 | P2 | L | Y | Y | 14.x |
| B6 | Debt payoff planner | 1 | P2 | M | Y | Y | 14.x |
| B7 | Review workflow | 0 | P2 | M | Y | Y | 13.x |
| B8 | Flexible reports | 2 | P2 | L | ~ | Y | 15.x |
| B9 | UX speed / low-friction | 3 | P1 | M | N | Y | 13.x |
| C1 | Attachments / receipts | 0 | P3 | M | Y | Y | post |
| C2 | AI assistant readiness | 4 | P2 | M | N | ~ | ongoing |
| C3 | Investment performance | 1 | P3 | XL | Y | Y | post |
| C4 | Widgets / shortcuts | 1 | P3 | S | N | Y | 13.x |
| C5 | Bill split / reimbursements | 0 | P3 | L | Y | Y | post |
| C6 | Advisor / professional access | 1 | P3 | M | ~ | Y | 15.x |
| C7 | Advanced visual reports | 2 | P2 | L | N | Y | 15.x |

`DB? / UX?`: Y = required, ~ = partial/optional, N = not required.
`Sprint` = suggested earliest slot, not a commitment.

---

## 3. Essential features analysis (A1–A13)

### A1. Accounts & net worth — **4/5**
- **Status:** Solid. Account types `cash/checking/savings/credit_card/debt/investment/other`,
  class `asset/liability`, per-account currency, `include_in_net_worth`, archive +
  soft delete, color/icon/sort.
- **Evidence:** `accounts` table + checks
  (`20260601000200_accounts_categories.sql`); balances derived from entries via
  `get_account_balances(uuid)` / `(uuid,date)`
  (`...000500`, `...000100_dashboard_account_balances_as_of.sql`); opening balance
  sign handling asset `+`, liability `-abs()` (`...143624_fix_opening_balance_signed_amount.sql`);
  net worth math `totalAssets + signedLiabilities`, liabilities shown positive via
  `Math.max(0, -value)` ([net-worth/page.tsx:119-148](src/app/dashboard/net-worth/page.tsx#L119-L148)).
- **Main gaps:** net worth uses **frozen per-transaction FX** (no revaluation);
  the as-of balances RPC does **not filter archived accounts**, and
  `summarizeBalances` includes any `include_in_net_worth` account → an archived
  account can still count in historical net worth; opening balance can be set
  **once only** (changing a real-world balance needs an adjustment transaction);
  `investment` accounts are manual-balance only (no holdings).
- **User impact:** balances/net worth are correct for same-currency data; multi-
  currency history can drift; "fix my balance" is non-obvious.
- **Technical risk:** Low–medium (FX revaluation is a modelling decision).
- **Next action:** decide net-worth revaluation policy (frozen vs. as-of rate);
  exclude archived accounts from net worth or document why not; add a
  "reconcile / adjust balance" action. **DB:** ~ · **UX:** ~ · **Tests:** Y.

### A2. Transactions core — **4/5**
- **Status:** Strong, ledger-safe.
- **Evidence:** `create_manual_transaction` / `update_manual_transaction`
  (single entry + single allocation invariant enforced),
  `void_transaction` (keeps ledger rows, flips `status`),
  transfer + debt-payment + opening-balance + CSV paths; statuses
  `pending/posted/voided/deleted_soft`; list grouped by date with Today/Yesterday
  ([transactions/page.tsx](src/app/dashboard/transactions/page.tsx)).
- **Main gaps:** **no pagination** (whole range loaded; account/category filtered
  in JS — [page.tsx:513-525](src/app/dashboard/transactions/page.tsx#L513-L525));
  only manual income/expense/transfer are editable (others = void+recreate);
  **no split transactions** (one allocation per tx); no bulk actions; no
  soft-delete recovery UI.
- **User impact:** great for small data; friction on bulk cleanup & split bills.
- **Technical risk:** medium (pagination touches the hottest page).
- **Next action:** add keyset pagination + push account/category filters into the
  query; design split-allocation support. **DB:** ~ · **UX:** Y · **Tests:** Y.

### A3. Categories & subcategories — **4/5**
- **Status:** Good. Parent/child (`parent_category_id`), archive,
  `exclude_from_budget`, `exclude_from_reports`, color/icon/sort, DnD reorder,
  style picker; defaults seeded.
- **Evidence:** `categories` table; `create_default_categories_for_household`;
  exclusion honored incl. parent in dashboard/budget RPCs
  (`...000200_exclude_categories_from_dashboard_reports.sql`,
  `get_monthly_budget_details`).
- **Main gaps:** effectively 2-level; no category **merge**; transfer/financial
  categories are system-managed (not user-facing for transfers).
- **Next action:** add merge/move-children; that's it. **DB:** N · **UX:** ~ · **Tests:** ~.

### A4. Payee / merchant / vendor / lender model — **2/5**
- **Status:** Free-text only. `transactions.merchant_name` exists (added
  `...000700_sprint_11_3_5_alpha_blocking_fixes.sql`), persisted by the manual
  RPCs, displayed and searchable; `debts.lender_name` is a separate text field.
- **Evidence:** column add + RPC `insert ... merchant_name`
  ([alpha-fixes:7-8,131-153](supabase/migrations/20260602000700_sprint_11_3_5_alpha_blocking_fixes.sql));
  display [transactions/page.tsx:867-872](src/app/dashboard/transactions/page.tsx#L867-L872).
  No payee entity table anywhere; alpha checklist lists "Payee/Vendor/Lender
  master data CRUD" as **not started**.
- **Main gaps:** typos fragment reporting; no autocomplete; no merchant→category
  memory (a prerequisite for the rules engine and Copilot-style auto-categorize);
  no merchant report; no logos.
- **User impact:** can't reliably answer "how much at Merchant X".
- **Next action:** introduce a `payees` table (or normalize `merchant_name`) +
  autocomplete; link `debts.lender_name`. **DB:** Y · **UX:** Y · **Tests:** Y.

### A5. Budgeting — **3/5** (Monarch-style, not YNAB)
- **Status:** Monthly category budgets, planned vs actual vs remaining, copy
  previous month, progress + status badges.
- **Evidence:** `budgets` / `budget_lines`; `create_monthly_budget`,
  `upsert_budget_line`, `delete_budget_line`, `copy_budget_from_previous_month`,
  `get_monthly_budget_details` (actuals from posted **expense** allocations,
  exclusion honored) (`...000300_budget_module.sql`, `...000400_...rules.sql`);
  dashboard budget card [page.tsx:744-834](src/app/dashboard/page.tsx#L744-L834).
- **Main gaps:** **expense categories only** (no income budget); **no rollover/
  carryover**, **no "available to budget"/zero-based** (the core of YNAB); one
  category per line (no grouping); copy omits notes.
- **User impact:** good "are we over?" tool; not a YNAB envelope system.
- **Next action:** add rollover (enables sinking funds, §B5) + optional income
  budgeting. **DB:** Y · **UX:** Y · **Tests:** Y.

### A6. Transfers & credit-card payments — **3/5**
- **Status:** Transfers = one transaction, two entries, **no allocations** →
  correctly excluded from income/expense/budget; editable; FX rate param.
- **Evidence:** `create_transfer_transaction` / `update_transfer_transaction`
  (`...151144`, `...20260604000100_transfer_exchange_rate.sql`); dashboard/recap
  RPCs only read allocations, so transfers never inflate metrics.
- **Main gaps:** **cross-currency transfers blocked** (`raise exception`); credit-
  card "payment" is just a transfer to the liability account (no statement/min-
  due concept); no transfer split; **recurring transfers unsupported** (needs
  `recurring_transactions.to_account_id`, per SPRINT-LOG).
- **User impact:** COP↔CAD moves can't be recorded as transfers today.
- **Next action:** implement cross-currency transfer (two rates) once
  `exchange_rates` lands. **DB:** ~ · **UX:** Y · **Tests:** Y.

### A7. Debts — **3/5**
- **Status:** Debt metadata + principal-only payments + paydown progress.
- **Evidence:** `debts` (lender_name, original_principal, interest_rate(+period),
  minimum_payment, payment_due_day, status); `create_debt_with_account`,
  `update_debt_metadata`, `create_debt_payment` (overpayment guarded, no expense
  allocation → principal doesn't inflate expenses)
  (`...000600_sprint_10_debts_net_worth.sql`, FX in `...20260603000100...`).
- **Main gaps:** **principal-only** (no principal/interest split on a payment);
  interest must be logged manually as an expense; **no payoff planner** (applied
  schema lacks `target_payoff_date` that the design doc had); no amortization/
  snowball-avalanche; cross-currency payment blocked.
- **User impact:** balances correct; "when am I debt-free / what does +$100/mo
  save?" unanswerable.
- **Next action:** payoff projection from rate + min payment + balance; optional
  interest split. **DB:** Y · **UX:** Y · **Tests:** Y.

### A8. Recurring bills & subscriptions — **2/5**
- **Status:** Template table + manual one-click posting.
- **Evidence:** `recurring_transactions` (frequency daily→yearly, start/end/
  next_run_date, `auto_post`, is_active) (`...20260612162632...`);
  `/dashboard/recurring` Due/Upcoming/Inactive + Post dialog advancing
  `next_run_date`; `lib/recurring/shared.ts` `computeNextRunDate`.
- **Main gaps:** **manual only** — `auto_post` unused, no scheduler (Sprint B,
  blocked on FX); income/expense only (no recurring transfer/debt); **no "due
  soon" dashboard widget** (Sprint C); no reminders/notifications; no
  subscription detection from history.
- **User impact:** still have to remember to post; no proactive alerts.
- **Next action:** dashboard "due soon" widget first (cheap, high value); then
  auto-post + reminders. **DB:** Y (add `to_account_id`) · **UX:** Y · **Tests:** Y.

### A9. Goals / sinking funds — **0/5**
- **Status:** Absent. `goals` table is fully designed in the initial schema doc
  (types emergency_fund/debt_payoff/down_payment/travel/retirement/custom,
  target/current, target_date, linked_account, status) but **was never migrated**;
  no UI/RPC. Budget model has no rollover to simulate it.
- **User impact:** can't track an emergency fund / trip / down payment — table-
  stakes for Monarch & YNAB.
- **Next action:** migrate `goals` + simple contribute/track UI. **DB:** Y · **UX:** Y · **Tests:** Y.

### A10. CSV import / export — **3/5**
- **Status:** Real validated import + generic export.
- **Evidence:** `import_batches`/`import_rows` + `create_csv_import` (validates
  date/amount/type/description/account/category; **duplicate detection** by
  date+description+account+|amount|; per-row errors; batch status partial/
  imported/failed) (`...000500_sprint_9_csv_import.sql`); client parser/validation
  (`lib/imports/*`); export via `buildCsv` (`lib/exports/csv.ts`), auth + household
  scoped.
- **Main gaps:** **import hard-codes `exchange_rate = 1`** (`v_exchange_rate := 1`
  → multi-currency import misstates base totals); income/expense only;
  **`import_column_mappings` table never built** (no saved mappings/auto-detect —
  mapping lives in batch metadata jsonb); no import revert/undo; export omits
  budgets/debts and isn't a guaranteed re-import round-trip.
- **User impact:** importing a COP statement into a CAD household corrupts base
  numbers silently.
- **Next action:** accept/lookup FX per import; add saved mappings. **DB:** Y · **UX:** Y · **Tests:** Y.

### A11. Dashboard — **4/5**
- **Status:** Rich daily overview, close to Copilot/Monarch.
- **Evidence:** getting-started checklist, plain-language summary, financial
  position (assets/liab/net worth/projected with KPI sparklines), monthly
  income/expenses/savings/savings-rate **with MoM deltas**, budget-vs-actual
  (clickable), expenses-by-category (bars, %, clickable)
  ([dashboard/page.tsx](src/app/dashboard/page.tsx)).
- **Main gaps:** **no recent-transactions list**; **no "upcoming/due soon"**;
  no cash-flow-over-time chart; net-worth trend lives on a separate page; no
  "needs review" count; many sequential queries per load.
- **Next action:** add recent activity + due-soon + cash-flow trend tiles.
  **DB:** N · **UX:** Y · **Tests:** ~.

### A12. Security, RLS & privacy — **5/5**
- **Status:** Benchmark-grade for an MVP.
- **Evidence:** RLS on every table; `is_household_member/admin/editor/creator`
  `SECURITY DEFINER` helpers; isolation enforced in policies *and* in every RPC
  (`is_household_editor(...)` guards); RPCs `SECURITY INVOKER` with explicit auth
  checks; `cleanSupabaseActionError` (`lib/supabase/errors.ts`); publishable key
  only (no service role on client); middleware session refresh; assistant tools
  resolve `householdId` server-side.
- **Main gaps:** `audit_logs` designed but **not built** (no user-visible trail);
  no AI rate limiting; write policies are admin-heavy (fine single-user).
- **Next action:** add `audit_logs` when multi-user lands. **DB:** ~ · **UX:** N · **Tests:** Y (RLS).

### A13. Mobile / PWA usability — **3/5**
- **Status:** Installable PWA, responsive, verified 390–1280px.
- **Evidence:** `public/manifest.json` + icons + `scripts/generate-icons.mjs`;
  `install-app-hint`, `mobile-nav`, `mobile-menu` (native `<details>`), `vaul`
  drawer/sheet, `AmountInput`; alpha checklist responsive section all ✅.
- **Main gaps:** no offline/service-worker strategy; **no manifest shortcuts**
  (home-screen quick-add); `<input type="month">` browser-variant; wide tables
  rely on horizontal scroll; entry is a dialog (works, not native-quick).
- **Next action:** add PWA shortcuts + a true quick-add. **DB:** N · **UX:** Y · **Tests:** ~.

---

## 4. Differentiator features analysis (B1–B9)

### B1. Real multi-currency — **3/5** (the headline opportunity)
- **Have:** currencies CAD/USD/COP; per-account currency; `exchange_rate_to_base`
  + `amount_base_currency` on entries *and* allocations; live FX fetch
  (`lib/fx.ts`, fawazahmed0 API, cached 1h); FX field on tx/transfer/opening/debt.
- **Missing:** **`exchange_rates` table not built** (designed) → rates are frozen
  per transaction, no central store, **no net-worth revaluation** (FX P&L
  invisible); cross-currency transfers/debt blocked; **CSV import FX = 1**; locale
  formatting hard-coded `en-CA`; no per-currency reports.
- **Why it matters:** Monarch is weak here; doing it well is a real wedge for a
  COP/CAD household. Today it's a strong foundation with correctness holes.
- **Action:** migrate `exchange_rates` + a `get_rate(from,to,date)` lookup; use it
  in import and revaluation; unblock cross-currency transfers.

### B2. Household-first design — **3/5**
- **Have:** `households` + `household_members` (roles owner/admin/member/viewer,
  status active/invited/removed) + helpers; all data household-scoped; editor vs
  admin write boundaries.
- **Missing:** no **invite flow**, no member-management UI, no per-transaction
  **owner/"whose expense"**, no personal-vs-shared accounts, no per-member report.
  Architecture is multi-user; the product is single-user.
- **Action:** invites + member list + surface `created_by`; later per-member views.

### B3. Rules engine / automation — **1/5**
- **Have (design only):** `categorization_rules` fully specced (match_field
  description/merchant_name/amount/account_name; operators contains/equals/
  starts_with/ends_with/regex/gt/lt; category_id; priority; is_active) — **not
  migrated**; the match fields (`merchant_name`, `description`) exist on rows.
- **Missing:** the table, rule application on create/import, subscription
  auto-tagging, auto-categorize.
- **Action:** migrate the table; apply rules in `create_manual_transaction` &
  `create_csv_import`; small rules CRUD UI. Pairs with A4 (payees).

### B4. Monthly financial recap — **1/5**
- **Have:** all ingredients — `get_monthly_dashboard_summary` (income/expense/
  savings/rate), `get_monthly_expenses_by_category` (top categories), net-worth
  evolution, budget overages, MoM deltas.
- **Missing:** an actual recap artifact (page/notification/email), "biggest
  unusual expense", net-worth-change narrative; **`monthly_snapshots` not built**
  (no persisted history for recaps/trends).
- **Action:** a rule-based "Month in review" page assembled from existing RPCs +
  optional snapshot persistence. (The AI assistant could narrate it.)

### B5. Non-monthly expenses / sinking funds — **0/5**
- **Have:** nothing — budgets are strictly monthly, no rollover; no goals table.
- **Action:** budget-line rollover **or** `goals` with monthly contribution.

### B6. Debt payoff planner — **1/5**
- **Have:** inputs (rate, period, min payment, original principal, live balance),
  paydown bar.
- **Missing:** payoff date estimate, interest-saved/extra-payment scenarios,
  amortization, snowball/avalanche, charts; `target_payoff_date` not in applied
  schema; principal-only payments limit accuracy.
- **Action:** pure-function projection from existing fields (no DB needed for v1).

### B7. Review workflow — **0/5**
- **Have:** nothing (grep for reviewed/flagged = no matches). `status` is ledger
  state, not review state; `source=csv_import` is the only "needs attention" hint.
- **Action:** add `transactions.review_status` (unreviewed/reviewed/flagged) +
  optional `reviewed_by`; a review queue + bulk "mark reviewed". Monarch parity.

### B8. Flexible reports — **2/5**
- **Have:** expenses-by-category (month), net-worth evolution (6mo), budget
  actuals, a powerful **transactions filter** page (month/range, type, status,
  account, category, search), KPI sparklines (`trend-actions.ts`), AI Q&A.
- **Missing:** a reports section; by-payee/by-member/by-tag/by-currency; income-
  by-category; multi-month category trend; saved/exportable reports; richer
  charts. `v_monthly_category_actuals` view designed, not built.
- **Action:** a `/dashboard/reports` hub reusing allocations + recharts.

### B9. UX speed & low-friction entry — **3/5**
- **Have:** global add-transaction dialog (prefill account), `AmountInput`,
  icon category picker, "add next" flow, **assistant + voice note** (NL entry),
  filter presets, plain-language summary, tooltips, i18n en/es.
- **Missing:** inline edit (edit needs a dialog), bulk edit, keyboard-first quick
  add, merchant autocomplete, mobile swipe actions; the `set-state-in-effect`
  lint smell in `transaction-dialog-provider` hints at avoidable re-renders.
- **Action:** inline category edit + bulk actions + autocomplete.

---

## 5. Nice-to-have features analysis (C1–C7)

- **C1. Attachments / receipts — 0/5.** `attachments` table designed
  (file_url/mime/size, transaction_id) but **not built**; no Storage usage; notes
  only. → migrate table + Supabase Storage bucket when wanted.
- **C2. AI assistant readiness — 4/5 (already shipped).** `/dashboard/assistant`
  + `lib/ai/{client,prompts,tools}.ts`: 5 read-only household-scoped tools, RLS-
  safe, voice-note composer. Clean aggregable schema. Gaps: read-only (no
  AI-driven actions), no proactive insights, depends on merchant/tag richness.
- **C3. Investment performance — 1/5.** `investment` account type + manual
  balance only; no holdings/allocation/returns/prices. → large, post-MVP.
- **C4. Widgets / shortcuts — 1/5.** Manifest + install hint + global add; **no
  manifest `shortcuts`**, no share target. → cheap PWA win.
- **C5. Bill split / reimbursements — 0/5.** No split/owed-by-to/settlement;
  single allocation per tx; members exist but no split. → needs split allocations.
- **C6. Advisor / professional access — 1/5.** `viewer` role exists in schema +
  `has_household_role`; not wired to an invite/scoped read-only experience. →
  latent; ride on B2 invites.
- **C7. Advanced visual reports — 2/5.** `recharts` installed; `trend-chart`
  sparklines, category/net-worth/budget bars. No Sankey/donut/multi-month trend/
  saved reports. → builds on B8.

---

## 6. Data model gaps

The decisive finding: **`Documentation/3_1_app_finanzas_001_initial_schema.sql`
designed a full SaaS schema, but only a subset was migrated.** The following were
**designed and never built** (low-risk to add — shapes already reasoned through):

| Entity (designed, not built) | Purpose | Unlocks | Migration risk | When |
|---|---|---|:--:|---|
| `exchange_rates` | central FX (from,to,rate,date,source) | B1 import/revaluation/cross-ccy | Low | **now** |
| `categorization_rules` | merchant/desc → category | B3 auto-categorize | Low | now |
| `goals` | savings/sinking/debt-payoff goals | A9/B5 | Low | now |
| `monthly_snapshots` (+ `_accounts`/`_categories`) | persisted month-end history | B4 recap, net-worth trend, C7 | Medium | next |
| `attachments` | receipts (+ Storage) | C1 | Low | later |
| `audit_logs` | change trail | A12 multi-user | Low | later |
| `import_column_mappings` | saved CSV mappings | A10 | Low | later |
| views `v_account_balances`, `v_monthly_category_actuals` | read convenience | B8 | Low | optional |

**Net-new (not in either schema), needed for benchmark parity:**

| Proposal | Why | Suggested shape | Relationship | Now/Later |
|---|---|---|---|---|
| `payees` (or normalize `merchant_name`) | A4: stop fragmenting reporting | `id, household_id, name, default_category_id, logo_url` | `transactions.payee_id` (keep text as fallback) | now |
| `transactions.review_status` (+ `reviewed_by`, `reviewed_at`) | B7 review workflow | enum `unreviewed/reviewed/flagged` | column on `transactions` | next |
| `tags` + `transaction_tags` | B8 reports, flexible slicing | `tags(id,household_id,name)` + join | M:N to `transactions` | next |
| `recurring_transactions.to_account_id` | A6/A8 recurring transfers | nullable FK to `accounts` | column | next |
| `budget_lines` rollover fields | A5/B5 sinking funds | `rollover_enabled bool, carryover numeric` | column | with A5 |
| `debts.target_payoff_date` (from design) | B6 planner | `date` | column | with A7 |
| member ownership on `transactions` | B2 per-member | surface existing `created_by` (no schema change) or add `owner_member_id` | column/derive | later |

Modelling cautions:
- Adding params/overloads to existing RPCs → **drop the old signature first**
  (the codebase already hit this; see `...20260607000100_drop_update_transfer_overload.sql`
  and `...20260603000100...` which correctly `drop function ... ` before redefining).
- Allocation amounts are constrained **positive** (`amount_*_currency > 0`); splits
  and any negative-allocation idea must respect that (use multiple positive rows).

---

## 7. UX gaps (highest impact first)

1. **Multi-currency clarity:** import silently uses rate 1; net worth doesn't
   revalue. Users can't tell base totals are off. *(correctness-as-UX)*
2. **No "needs review" / recent activity on dashboard** → no daily landing loop
   like Copilot.
3. **Transaction entry friction:** no inline category edit, no bulk actions, no
   merchant autocomplete; edit always opens a dialog.
4. **No transaction pagination** → long lists (This year preset) get heavy.
5. **No confirmation dialogs** for void/archive; **no undo** (alpha-checklist
   deferred). Risky for destructive-feeling actions.
6. **Budget UX is "track spend", not "plan"** — no rollover, no income side; new
   users from YNAB will miss envelopes.
7. **Debt page** shows balances but answers no planning question (payoff date).
8. **Active nav item not highlighted** (alpha-checklist deferred) — orientation.
9. **Opening balance once-only** with no "adjust balance" path is confusing.
10. **Empty/explanatory states** are good; **form validation** is server-side
    (RPC `raise exception` → sanitized) so inline field errors are coarse.
11. `<input type="month">` cross-browser inconsistency on mobile.

---

## 8. Recommended roadmap

Ordered by the audit's priority rule (correctness → daily UX → budget/debt/net-
worth reliability → multi-currency → recurring/goals/rules → reports/AI/nice).

### Sprint 12.x — "Multi-currency truth + correctness" *(P0)*
- **Goal:** make base-currency numbers trustworthy across currencies; clear the
  red lint gate.
- **Scope:** migrate `exchange_rates` + `get_rate(from,to,date)`; use it in
  `create_csv_import` (replace `v_exchange_rate := 1`); decide & implement net-
  worth revaluation (frozen vs. as-of) and document it; fix the 11
  `react-hooks/set-state-in-effect` lint errors.
- **Out of scope:** cross-currency transfers UI (next), reports.
- **DB:** `exchange_rates` (new); no destructive changes.
- **Files:** `supabase/migrations/*` (new), `lib/fx.ts`, `net-worth/page.tsx`,
  `dashboard/page.tsx`, `transaction-dialog-provider.tsx`, `trend-chart.tsx`,
  `theme-toggle.tsx`.
- **Manual tests:** import a COP CSV into a CAD household → base totals correct;
  net worth across months with FX; `npm run lint` clean; `tsc` clean; build.
- **Risk:** Medium (touches money math). Add the §9 FX tests first.

### Sprint 13.x — "Daily-use UX + payees + rules + review"
- **Goal:** make the app feel like Copilot day-to-day.
- **Scope:** transaction **pagination**; dashboard **recent activity** + recurring
  **"due soon"** widget; **`payees`** + merchant autocomplete; **`categorization_rules`**
  applied on create/import; **`review_status`** + review queue + bulk "mark
  reviewed"; active-nav highlight; confirm dialogs for void/archive.
- **DB:** `payees`, `categorization_rules`, `tags`(+join), `transactions.review_status`,
  `recurring_transactions.to_account_id`.
- **Files:** `transactions/*`, `dashboard/page.tsx`, `recurring/*`, new
  `rules/*`, new `reports`-lite.
- **Manual tests:** rule auto-categorizes import; review queue clears; pagination.
- **Risk:** Medium.

### Sprint 14.x — "Goals, sinking funds, budget depth, debt planner, recap"
- **Goal:** YNAB/Monarch budgeting + planning parity.
- **Scope:** `goals` (+UI); budget-line **rollover** (sinking funds) + optional
  income budgeting; **debt payoff planner** (projection, extra-payment scenarios);
  rule-based **"Month in review"**; `monthly_snapshots` for history.
- **DB:** `goals`, `monthly_snapshots(+children)`, budget rollover cols,
  `debts.target_payoff_date`.
- **Risk:** Medium–High (budget math).

### Sprint 15.x — "Reports, collaboration, advanced charts"
- **Goal:** Monarch-grade analysis + real multi-user.
- **Scope:** `/dashboard/reports` (by category/merchant/tag/member/currency,
  multi-month trends, saved); recharts donut/Sankey/trend; **household invites** +
  member management + per-member views; wire `viewer`/advisor read-only.
- **DB:** `audit_logs`; maybe `import_column_mappings`.
- **Risk:** Medium.

*(Post-MVP: attachments + OCR, investment holdings, bill-split/reimbursements,
billing.)*

---

## 9. Test plan

There are **no automated tests today** (no test runner/scripts in `package.json`).
Adding even a thin pgTAP/SQL + a few Vitest suites would de-risk the money math.

- **Account balance signs:** asset opening `+`, liability opening `-abs()`;
  income `+entry`, expense `-entry`; balances = Σ entries.
- **Liability opening balances:** negative stored, displayed positive
  (`Math.max(0,-v)`); net worth uses signed sum.
- **Transfers excluded from reports:** transfer creates 0 allocations; monthly
  summary/expenses-by-category/budget ignore it.
- **Voided excluded:** `status='voided'` drops from balances, dashboard, budgets.
- **Hidden/excluded categories:** `exclude_from_reports` (incl. parent) removed
  from dashboard + budget actuals; `exclude_from_budget` blocked from new lines.
- **Budgets by month:** actuals only posted expense allocations in `[month, next)`;
  copy-previous skips archived/excluded/existing.
- **CSV import edge cases:** missing/invalid date/amount; type inference by sign;
  duplicate detection; archived account/category rejected; **multi-currency base
  amount once FX is fixed** (regression for the rate-1 bug).
- **RLS household isolation:** member of H1 cannot read/write H2 rows or call RPCs
  for H2 (test as two users).
- **Multi-currency calculations:** per-transaction base = amount × rate;
  same-currency transfer nets to 0 in base; net worth across mixed currencies.
- **Mobile form behavior:** AmountInput grouping/symbol; negative opening balance;
  dialogs at 390px.
- **Lint/types gate:** `npm run lint` must pass (currently 11 errors); `tsc` green.

---

## 10. Final recommendation

**Before sharing with a friend / Maria for Alpha:**
1. **Fix the multi-currency correctness holes** (CSV import FX = 1; document net-
   worth FX behavior). For a COP/CAD household this is *trust-critical*.
2. **Clear the lint gate** (11 errors) so builds/CI are green.
3. **Add confirmation on void/archive** and **active-nav highlight** (cheap,
   high perceived-quality).
4. Add a **recent-activity** block (and ideally recurring "due soon") so the
   dashboard is a real landing page.
5. Seed/verify a clean **first-run** (getting-started checklist already helps).

**Can wait:** goals, rules, reports hub, payoff planner, attachments, investment
holdings, bill-split, multi-user invites — all valuable, none Alpha-blocking.

**To feel closer to Monarch:** payees + merchant reporting, review workflow,
flexible reports (by merchant/member/tag), goals, household collaboration, and a
"Month in review" recap.

**To feel closer to YNAB:** budget **rollover / available-to-budget** envelopes,
income budgeting, sinking funds, and stricter "give every dollar a job" flow.

**To feel closer to Copilot:** low-friction entry (inline edit, bulk, merchant
autocomplete), **rules-based auto-categorization**, a clean daily dashboard with
recent + upcoming, and lean into the **AI assistant** you already have (proactive
insights, NL categorize/recap).

---

### Top 10 issues to fix next
1. **CSV import hard-codes `exchange_rate_to_base = 1`** → multi-currency base
   totals wrong. *(P0, correctness)*
2. **No `exchange_rates` table / no net-worth revaluation** → FX P&L invisible,
   rates frozen per tx. *(P0/P1)*
3. **`npm run lint` red (11 `set-state-in-effect` errors)** → `tsc` + `next build`
   pass, so it's a **CI/dev-health** gap (lint not run during build), not a build
   blocker. *(P1 dev-health)*
4. **No transaction pagination** (+ JS-side account/category filtering). *(P1 perf)*
5. **Payee/merchant is free text** → no autocomplete, no merchant reports. *(P1)*
6. **Rules engine absent** (designed, not built) → no auto-categorization. *(P1)*
7. **Goals / sinking funds absent** (designed, not built). *(P1)*
8. **Cross-currency transfers & debt payments blocked.** *(P1, COP/CAD)*
9. **Recurring: no auto-post, no reminders, no dashboard "due soon".** *(P2)*
10. **No review workflow, no reports hub, no monthly recap** (data is all there). *(P2)*

Runner-ups: no confirmation/undo on destructive actions; **no automated tests**;
`audit_logs`/`attachments`/`monthly_snapshots` unbuilt; locale hard-coded `en-CA`;
**duplicate root-level routes** (`src/app/{budgets,debts,export,net-worth,transactions/import}/page.tsx`
exist alongside the real `/dashboard/*` ones and prerender as static — likely dead
stubs/redirects to clean up); **`middleware` → `proxy` deprecation** warning on
build (Next 16).

### Suggested next prompt (implementation of the highest-priority sprint)
> Implement **Sprint 12.x — "Multi-currency truth + correctness"** for App
> Finanzas, following `.claude/CLAUDE.md` and the `app-finanzas-verify` gate.
> 1) Create migration(s) for an `exchange_rates` table (household_id, from_currency,
> to_currency, rate, rate_date, source, unique per day) with full RLS mirroring the
> existing pattern, plus a `get_exchange_rate(p_household_id, p_from, p_to, p_date)`
> RPC that falls back to the latest prior rate. 2) Update `create_csv_import` to
> resolve `exchange_rate_to_base` per row from the account currency vs. base (via
> the new RPC or a passed map) instead of the hard-coded `1` — **drop the old
> function signature before redefining**. 3) Decide and implement net-worth FX
> behavior (recommend: keep stored historical rate for posted entries, document
> it in `docs/`), and add a short note to the net-worth page. 4) Fix the 11
> `react-hooks/set-state-in-effect` ESLint errors in `transaction-dialog-provider.tsx`,
> `trend-chart.tsx`, `theme-toggle.tsx` without behavior change. **Do not run
> `npx supabase db push`** — only create migrations and list the exact manual
> Supabase commands. Add SQL tests for the import FX regression and the
> same-currency-transfer-nets-to-zero invariant. End with the standard
> Files/DB/Commands/Manual-tests/Manual-Supabase summary.

### Manual commands to run locally *(do not run Git write commands)*
```bash
# from app-finanzas/
npm run lint            # currently 11 errors — should be 0 after Sprint 12.x
npx tsc --noEmit        # currently clean
npm run build           # next build (verify the lint gate doesn't block prod build)
npm run dev             # smoke-test net worth + CSV import with a COP account

# safe, read-only git (optional)
git status
git switch -c audit/finance-app-benchmark-review   # optional review branch
```

*(Migrations live in `supabase/migrations/`; apply them yourself via the Supabase
dashboard or your normal flow — this audit did not run `db push` or apply any
schema change.)*
