# Benchmark Follow-up Issues

> Documentation only. Near-term implementation backlog derived from
> [benchmark-review-monarch-ynab-copilot.md](../benchmark-review-monarch-ynab-copilot.md).
> This translates the benchmark review into issues that can or should be worked
> soon, while keeping post-MVP ideas separated from Alpha trust work.

## Field guide

| Field | Meaning |
|---|---|
| ID | Stable issue identifier for planning and follow-up. |
| Priority | `P0` = trust/correctness blocker, `P1` = important near-term fix, `P2` = useful next-2-sprints improvement, `P3` = small polish or defer unless bundled. |
| Area | Product/technical surface affected. |
| Issue | What is missing or risky. |
| Why soon | Why this belongs in the near-term backlog. |
| First implementation slice | The smallest useful version to build first. |
| DB | Whether a schema/RPC migration is likely required. |
| Verify | Minimum validation expected before calling it done. |

## Applied planning rules

- Prioritize anything that makes balances, net worth, budget actuals, debt
  balances, FX-converted values, dashboard totals, import, or export
  untrustworthy.
- Preserve the existing ledger contract: `transactions` are event headers,
  `transaction_entries` move account balances, and `transaction_allocations`
  power reporting, budgets, income, and expenses.
- Use additive Supabase migrations with household-scoped RLS for new tables.
- Do not run `npx supabase db push` automatically; list it as a manual command.
- Keep Alpha scope honest: correctness and daily-use friction can move now;
  broad Monarch/YNAB/Copilot parity should be staged into later sprints.

## Resolved implementation issues

| ID | Resolved in | What changed | Evidence | Remaining manual validation |
|---|---|---|---|---|
| BR-001 | Sprint 12.x — BR-001/BR-002 CSV import FX + rate foundation | `create_csv_import(...)` no longer hard-codes `exchange_rate_to_base = 1` for every row. It resolves account-currency-to-base FX per row, stores the resolved rate on entries and allocations, and logs rows without a usable non-base rate as invalid instead of creating incorrect ledger entries. | Migration `supabase/migrations/20260613000100_br_001_csv_import_fx.sql`; feature doc [`../features/csv-import-fx.md`](../features/csv-import-fx.md); sprint log [`../SPRINT-LOG.md`](../SPRINT-LOG.md). | Apply migration with `npx supabase db push`; import a non-base CSV row and compare `transaction_entries` / `transaction_allocations` base amounts; verify missing-rate rows stay invalid. |
| BR-002 | Sprint 12.x — BR-001/BR-002 CSV import FX + rate foundation | Added household-scoped `exchange_rates` with RLS, unique daily pair constraint, lookup index, and `get_exchange_rate(...)` supporting same-currency `1`, latest-prior direct lookup, inverse-pair fallback, and `null` for missing rates. | Migration `supabase/migrations/20260613000100_br_001_csv_import_fx.sql`; feature doc [`../features/exchange-rates.md`](../features/exchange-rates.md); `AGENTS.md` real Supabase table list includes `exchange_rates`. | Apply migration with `npx supabase db push`; run same-currency, latest-prior, inverse-pair, missing-rate, and RLS verification queries from [`../features/exchange-rates.md`](../features/exchange-rates.md). |
| BR-003 | Sprint 12.x — BR-003..BR-006 net-worth correctness + verification | Net worth FX policy is now explicit: summaries use each ledger entry's stored historical `exchange_rate_to_base`, and the Net Worth page warns that month-end market revaluation is not implemented yet. | UI copy in `src/app/dashboard/net-worth/page.tsx`; feature doc [`../features/net-worth-fx-policy.md`](../features/net-worth-fx-policy.md). | Open `/dashboard/net-worth` with a mixed-currency household and confirm the FX policy callout is visible; manually recompute a sample balance from stored ledger base amounts. |
| BR-004 | Sprint 12.x — BR-003..BR-006 net-worth correctness + verification | Historical/as-of balances now exclude archived accounts, matching current account summary behavior and preventing archived accounts from distorting Net Worth. | Migration `supabase/migrations/20260614000100_br_004_exclude_archived_as_of_balances.sql`; feature doc [`../features/net-worth-fx-policy.md`](../features/net-worth-fx-policy.md). | Apply migration with `npx supabase db push`; archive an included account with history and confirm `/dashboard/net-worth?month=YYYY-MM` excludes it while Accounts can still show it under archived accounts. |
| BR-005 | Sprint 12.x — BR-003..BR-006 net-worth correctness + verification | Cleared React hooks lint failures without behavior changes in theme controls, sidebar/mobile nav, transaction dialog, transaction form defaults, transfer edit FX auto-fetch, install hint, getting-started checklist, and trend chart colors. | Code changes in the lint offender components; feature doc [`../features/react-hooks-lint-cleanup.md`](../features/react-hooks-lint-cleanup.md). | `npm run lint` must pass; manually smoke theme toggle, sidebar collapse, mobile nav, Save and Add Next, and non-base transfer edit FX. |
| BR-006 | Sprint 12.x — BR-003..BR-006 net-worth correctness + verification | Added the first lightweight SQL verification checklist for money-math invariants while the project still has no automated test runner. | SQL file `supabase/tests/br_003_006_money_invariants.sql`; feature doc [`../features/financial-correctness-checks.md`](../features/financial-correctness-checks.md). | Replace the household placeholder, run the SQL checks after migrations are applied, and confirm every `passed` column is `true`. |

## Near-term implementation issues

| ID | Priority | Area | Issue | Why soon | First implementation slice | DB | Verify |
|---|---:|---|---|---|---|:--:|---|
| BR-001 | P0 | CSV import / FX | `create_csv_import` hard-codes `exchange_rate_to_base = 1`. | A COP import into a CAD household silently corrupts base-currency totals. | Resolve per-row FX from account currency to household base currency; reject/flag rows without a usable rate. | Y | Import non-base CSV, compare entry/allocation base amounts, run lint/tsc/build. |
| BR-002 | P0 | FX data model | `exchange_rates` table and rate lookup RPC are designed but not migrated. | BR-001, cross-currency flows, and net-worth policy need a central source of historical rates. | Add `exchange_rates` with RLS, unique daily pair constraint, indexes, and `get_exchange_rate(...)` fallback to latest prior rate. | Y | RLS checks, same-currency returns `1`, latest-prior lookup, missing-rate behavior. |
| BR-003 | P0 | Net worth / FX | Net worth uses frozen transaction rates and does not clearly document or revalue FX. | Net worth is a relied-upon number; unclear FX policy creates false confidence. | Decide policy. Recommended first slice: keep stored historical rates, document it clearly, and show a short note on Net Worth. Revaluation can follow after `exchange_rates`. | ~ | Mixed-currency month-end manual recomputation, UI copy check, no regression to signed liability math. |
| BR-004 | P1 | Net worth / accounts | Historical/as-of balances may include archived accounts when `include_in_net_worth` is true. | Archived accounts can still distort historical net worth unless this is intentional and explained. | Either filter archived accounts from net-worth summaries or document the intended historical behavior. | ~ | Archived included/excluded account scenarios across current and historical net worth. |
| BR-005 | P1 | Dev health | `npm run lint` is red with `react-hooks/set-state-in-effect` errors. | A separate lint CI gate would fail; the warnings point to avoidable re-render patterns. | Fix `transaction-dialog-provider.tsx`, `trend-chart.tsx`, and `theme-toggle.tsx` without behavior changes. | N | `npm run lint`, `npx tsc --noEmit`, `npm run build`. |
| BR-006 | P1 | Tests / money math | There is no automated test safety net for ledger and FX invariants. | Multi-currency and import fixes touch trust-critical financial math. | Add the thinnest practical SQL/Vitest coverage for FX import, signed liabilities, transfer exclusion, and voided exclusion. | ~ | Tests run locally plus existing verify gate. |
| BR-007 | P1 | Transfers / debts / FX | Cross-currency transfers and debt payments remain blocked or incomplete. | COP/CAD households need to record real movements between currencies without faking expenses. | After BR-002, support cross-currency transfer entries with explicit source/destination FX handling; debt payment support can follow. | Y | Same-currency transfer nets to zero; cross-currency transfer preserves source/destination balances and base math. |
| BR-008 | P1 | Transactions | Transaction list has no pagination and pushes account/category filtering into JS. | Real Alpha usage will grow quickly; this is the hottest page and will become slow. | Add keyset or cursor pagination and move account/category filters into the server query/RPC. | ~ | Large seeded list, filters, search, month/range presets, mobile layout. |
| BR-009 | P1 | Payees / merchants | Merchant/payee is free text only. | Typos fragment reports and block rules/autocomplete. | Add `payees` table or normalized merchant lookup, keep `merchant_name` as fallback, add autocomplete. | Y | Manual entry, CSV import, search, report grouping, household isolation. |
| BR-010 | P1 | Rules / automation | `categorization_rules` is designed but not migrated or applied. | Rules are the fastest path to Copilot-style low-friction cleanup. | Add rules table + simple CRUD; apply on manual create and CSV import using description/merchant/account fields. | Y | Rule priority, inactive rules, import application, manual transaction application. |
| BR-011 | P1 | Review workflow | No `review_status`, queue, or bulk "mark reviewed". | Daily finance apps need a place to process imported/manual transactions and know what still needs attention. | Add transaction review columns and a `/dashboard/transactions/review` or filtered queue. | Y | Imported transactions default unreviewed, bulk mark reviewed, flagged state, dashboard count. |
| BR-012 | P2 | Dashboard | Dashboard lacks recent activity, needs-review count, and upcoming/due items. | The app needs a daily landing loop, not just monthly summaries. | Add recent transactions + needs-review count; pair with recurring due-soon after BR-011/BR-013. | N | Empty state, populated state, links to filtered transactions, responsive cards. |
| BR-013 | P2 | Recurring | No dashboard "due soon" widget for recurring transactions. | Manual posting works, but users still need to remember what is due. | Add Due soon/overdue dashboard tile linking to `/dashboard/recurring`. | N | Due, overdue, empty, inactive, mobile layout. |
| BR-014 | P2 | Recurring | `auto_post` exists but no scheduler, reminders, or failure flow. | The schema hints at automation, but it should wait until FX rate behavior is reliable. | After BR-002/BR-013, add explicit auto-post toggle behavior and a safe job/failure log. | Y | Future dates, FX missing, idempotency, end-date auto-deactivation. |
| BR-015 | P2 | Destructive-feeling actions | Void/archive lacks consistent confirmation and undo patterns. | These actions are ledger-sensitive and can feel risky even when technically safe. | Standardize inline confirm dialogs and add undo/toast where practical. | N | Void, archive, restore, cancel, keyboard/mobile. |
| BR-016 | P2 | Navigation | Active nav item is not highlighted. | Cheap orientation win, especially as more dashboard pages are added. | Add active state to desktop and mobile nav using current pathname. | N | Desktop/mobile nav, nested pages, no layout shift. |
| BR-017 | P2 | Accounts / reconciliation | Opening balance is one-time only and there is no "adjust/reconcile balance" action. | Real finance use needs a safe way to correct current balances without editing history. | Add an adjustment transaction flow that creates a ledger-safe entry and clear audit-style description. | ~ | Asset/liability adjustment signs, reports exclusion, net-worth effect, void behavior. |
| BR-018 | P2 | Budgeting | Budgeting tracks spend but has no rollover/carryover. | Sinking funds and YNAB-like behavior depend on carryover. | Add `rollover_enabled` and computed carryover for budget lines, then expose it in budget UI. | Y | Month-to-month carryover, excluded categories, over/under budget states. |
| BR-019 | P2 | Goals | Goals/sinking funds are absent though designed in the initial schema. | Monarch-style goal tracking is high-value once trust-critical math is stable. | Migrate `goals`; build simple target/current/linked account UI before automation. | Y | Create/update/archive goal, linked account, progress, household RLS. |
| BR-020 | P2 | Debts | Debt page shows balances but no payoff projection. | Users need to answer "when am I debt-free?" with existing fields. | Add pure-function payoff estimate from current balance, rate, period, min payment, and optional extra payment. | N/~ | Zero-rate, high-rate, fully-paid, extra-payment scenarios. |
| BR-021 | P2 | Monthly recap | The data exists but there is no "Month in review" artifact. | This gives high perceived value without inventing new financial primitives. | Build rule-based recap from existing monthly summary/category/budget/net-worth data. | ~ | Months with/without data, budget overages, biggest category, no private raw data leakage. |
| BR-022 | P2 | Reports | No dedicated reports hub. | Payee/rules/review work will make reports more useful, and Recharts already exists. | Add `/dashboard/reports` with category trend, merchant/payee summary, income/expense over time. | ~ | Filter correctness, export links, mobile charts. |
| BR-023 | P2 | Tags / flexible slicing | No tags or transaction tag joins. | Tags unlock reports by trip/project/person without abusing categories. | Add `tags` + `transaction_tags`, then add tag filter on transactions. | Y | M:N assignment, filtering, household RLS, archived tags. |
| BR-024 | P2 | CSV import | No saved column mappings or import undo/revert. | Repeated statement imports will be tedious and mistakes are hard to unwind. | Add saved mapping presets first; import revert can follow as a ledger-safe void batch action. | Y | Mapping reuse, bad file recovery, batch traceability. |
| BR-025 | P2 | Localization / currency | Formatting is still biased toward `en-CA` in places. | The app is bilingual and COP/CAD-heavy; formatting should match user expectations. | Centralize locale/currency formatting through existing format helpers and user settings. | N/~ | CAD/COP/USD display, ES/EN labels, mobile amount inputs. |
| BR-026 | P2 | Next.js maintenance | Build warns about middleware/proxy naming in Next 16. | Not user-facing, but easy to pay down before it becomes churn. | Follow Next 16 migration path from `middleware` naming to `proxy` if compatible with Supabase SSR. | N | Auth redirects, session refresh, build. |
| BR-027 | P2 | Route hygiene | Duplicate root-level routes exist beside real `/dashboard/*` pages. | Dead/static stubs can confuse routing, docs, and future agents. | Audit each root route and remove or redirect intentionally. | N | Route smoke for dashboard pages, no broken links. |
| BR-028 | P3 | PWA | No manifest shortcuts or share target. | Cheap mobile polish after core daily dashboard work. | Add manifest shortcuts for quick add, transactions, and recurring. | N | Install manifest, icons, mobile browser behavior. |

## Deferred or park-until-triggered issues

| ID | Area | Deferred issue | Revisit when |
|---|---|---|---|
| BR-D01 | Attachments / receipts | `attachments` table and Storage-backed receipts. | Real usage proves receipt capture is needed, or OCR becomes a priority. |
| BR-D02 | Investment performance | Holdings, prices, allocation, returns, and performance reports. | Core household cash/debt/budget flows are stable. |
| BR-D03 | Bill split / reimbursements | Split owed-by/settlement workflow. | Multi-member household usage creates real split/reimbursement needs. |
| BR-D04 | Advisor / external access | Viewer/advisor invite experience. | Household invite/member management is shipped and used. |
| BR-D05 | Advanced charts | Sankey/donut/saved visual reports. | BR-022 reports hub exists and users ask for deeper analysis. |
| BR-D06 | OCR / bank sync / billing | OCR receipts, Plaid/open banking, Stripe, native mobile. | Explicit product decision; keep out of Alpha correctness work. |

## Suggested work packages

### Package 1 — Sprint 12.x Multi-currency truth and verification

Start here.

1. ✅ BR-002 — Add `exchange_rates` + `get_exchange_rate`.
2. ✅ BR-001 — Fix CSV import FX from hard-coded `1`.
3. ✅ BR-003 — Decide/document net-worth FX behavior.
4. ✅ BR-005 — Clear lint gate.
5. ✅ BR-006 — Add minimal financial correctness tests.

Recommended branch name if/when starting implementation:
`sprint/12-x-multicurrency-correctness`.

Manual Supabase command after migration review:

```powershell
npx supabase db push
```

### Package 2 — Daily transaction workflow

1. BR-008 — Transaction pagination and server-side filters.
2. BR-011 — Review status and review queue.
3. BR-012 — Recent activity / needs-review dashboard block.
4. BR-015 — Confirmation/undo pattern for void/archive.

### Package 3 — Merchant memory and automation

1. BR-009 — Payees/merchant normalization and autocomplete.
2. BR-010 — Categorization rules.
3. BR-022 — First reports hub slice by payee/category.

### Package 4 — Planning depth

1. BR-018 — Budget rollover/carryover.
2. BR-019 — Goals.
3. BR-020 — Debt payoff projection.
4. BR-021 — Month in review.

## Ready-to-start list

Use this as the first implementation checklist:

1. ✅ Inspect `supabase/migrations/*` for existing currency, import, and transfer
   patterns.
2. ✅ Create an additive migration for `exchange_rates` and `get_exchange_rate`.
3. ✅ Update `create_csv_import` so base amounts never default to a silent `1`
   unless account currency equals household base currency.
4. ✅ Add regression coverage for non-base CSV import and same-currency transfer
   net-worth neutrality.
5. ✅ Fix the current ESLint errors.
6. ✅ Run `npm run lint`, `npx tsc --noEmit`, and `npm run build`.
7. Manually test a COP account import in a CAD-base household before applying
   migrations remotely.
