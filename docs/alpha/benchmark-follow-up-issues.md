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
| BR-019 | Sprint — Goals & funds | Migrated the designed-but-never-applied `goals` table and built `/dashboard/goals` with create/edit, contribute/withdraw, and pause/resume/archive/restore lifecycle actions. Nav entry moved from locked `phase: 'beta'` to `phase: 'alpha'`; dashboard and Plan widgets now read real goal data. A follow-up code review hardened it further: contribute/withdraw go through an `apply_goal_adjustment` RPC that row-locks the goal (`select ... for update`) so concurrent contributions can no longer clobber each other; insert/update RLS moved from admin-only to `is_household_editor`; `target_amount > 0` is enforced at the DB level; the Plan page's "Total saved" now includes `active`/`paused`/`completed` goals instead of dropping a goal's saved amount the moment it completes. | Migration `supabase/migrations/20260618000100_create_goals.sql`; feature doc [`../features/goals.md`](../features/goals.md); SQL checks `supabase/tests/br_019_goals_invariants.sql`; sprint log [`../SPRINT-LOG.md`](../SPRINT-LOG.md). | Migration applied (`npx supabase db push` run against the linked project). Create/edit a goal, contribute and withdraw funds (including from two tabs at once, to confirm no lost update), confirm auto-completion at target, and pause/resume/archive/restore. |
| BR-016 | UI redesign — Sprint 1–2 (sidebar + mobile nav) | Desktop sidebar (`nav-links.tsx`) and mobile bottom nav (`mobile-bottom-nav.tsx`) both compute `isActive(href)` from `usePathname()` and render `aria-current="page"` on the active item. | `src/components/nav-links.tsx`, `src/components/mobile-bottom-nav.tsx`. | Open each top-level route on desktop and mobile widths and confirm exactly one nav item is visually marked active. |
| BR-013 | UI redesign — Sprint 3 (dashboard "Centro de control") | Dashboard's "Upcoming bills" widget reads real `recurring_transactions`, computes days-until-due, and tags each row Due / Scheduled / Auto; links through to `/dashboard/recurring`. | `src/app/dashboard/page.tsx` (`upcoming`/`daysUntil` section). | Create a recurring template due today, due in N days, and inactive; confirm the dashboard tags/empties match. |
| BR-020 | PR #12 — Implement missing design-handoff screens | `/dashboard/debt-planner` computes per-debt payoff month for avalanche/snowball strategies with an optional extra-payment amount, as a pure projection that never writes to the DB. | `src/app/dashboard/debt-planner/page.tsx`. | Zero-rate, high-rate, fully-paid, and extra-payment scenarios with a seeded multi-debt household. |
| BR-022 | PR #12 — Implement missing design-handoff screens | `/dashboard/reports` adds a category/merchant toggle (`getTopMerchants`), a posted income-vs-expense chart, and a link to `/dashboard/export`. | `src/app/dashboard/reports/page.tsx`. | Switch between category/merchant views across months with and without activity; confirm export link and mobile chart layout. |
| BR-026 | Sprint 13 — Quick wins | Renamed `src/middleware.ts` to `src/proxy.ts` and the exported function from `middleware` to `proxy`, matching the Next 16 convention. Build no longer warns. | `src/proxy.ts`. | `npm run build` shows no "middleware is deprecated" warning; login/auth redirect still works (Supabase session refresh runs in the proxy). |
| BR-027 | Sprint 13 — Quick wins | Removed 5 dead root-level redirect stubs (`/budgets`, `/debts`, `/export`, `/net-worth`, `/transactions/import`) that only `redirect()`ed to their real `/dashboard/...` counterparts. Confirmed no code referenced the root paths before deleting. | Deleted `src/app/{budgets,debts,export,net-worth}/page.tsx`, `src/app/transactions/import/page.tsx`. | `npm run build` route list no longer shows the root-level duplicates; visiting an old root URL now 404s instead of redirecting (acceptable — nothing links to them). |
| BR-029 | PR #17, merged to `main` | Broadened the transaction date presets to This month / Last month / Last 3 months / Last 6 months / Year to date / All time (`page.tsx`), and fixed the Apply-resets regression (BF-024) by keying the From/To inputs so custom ranges survive "Apply filters". | `src/app/dashboard/transactions/page.tsx` (`rawPresets`, `offsetMonth`, `ALL_TIME_*`), `src/app/dashboard/transactions/transaction-filters.tsx` (keyed date inputs). | Pick each preset and confirm the range; set a custom range, click Apply, confirm it persists (does not reset to This month); confirm "All time" surfaces cross-month transactions; check mobile chip wrap. |
| BR-012 | Sprint 13 — Quick wins | Dashboard now queries a `count`-only `transactions` request for `review_status = 'unreviewed'` and shows a "N to review" pill next to the Recent Activity heading, linking to `/dashboard/transactions?review=unreviewed`. Hidden when the count is 0. QA on a real-data demo household (via `copy_household_data`) caught that the transactions page silently defaults to the current month whenever no explicit date range is given, so the link landed on a filtered, possibly-empty page if the unreviewed transactions were from another month; fixed by adding `&date_from=2000-01-01&date_to=2099-12-31` to the dashboard link. | `src/app/dashboard/page.tsx` (`needsReviewCount` query + pill + wide date range on the link); i18n keys `dashboard.needsReviewCount` in `src/lib/i18n/dictionaries.ts` (en/es/fr). | Seed a household with unreviewed transactions outside the current month, confirm the pill count and that the link still surfaces them; confirm the pill disappears at 0. |

## Near-term implementation issues

| ID | Priority | Area | Issue | Why soon | First implementation slice | DB | Verify |
|---|---:|---|---|---|---|:--:|---|
| BR-001 | P0 | CSV import / FX | `create_csv_import` hard-codes `exchange_rate_to_base = 1`. | A COP import into a CAD household silently corrupts base-currency totals. | Resolve per-row FX from account currency to household base currency; reject/flag rows without a usable rate. | Y | Import non-base CSV, compare entry/allocation base amounts, run lint/tsc/build. |
| BR-002 | P0 | FX data model | `exchange_rates` table and rate lookup RPC are designed but not migrated. | BR-001, cross-currency flows, and net-worth policy need a central source of historical rates. | Add `exchange_rates` with RLS, unique daily pair constraint, indexes, and `get_exchange_rate(...)` fallback to latest prior rate. | Y | RLS checks, same-currency returns `1`, latest-prior lookup, missing-rate behavior. |
| BR-003 | P0 | Net worth / FX | Net worth uses frozen transaction rates and does not clearly document or revalue FX. | Net worth is a relied-upon number; unclear FX policy creates false confidence. | Decide policy. Recommended first slice: keep stored historical rates, document it clearly, and show a short note on Net Worth. Revaluation can follow after `exchange_rates`. | ~ | Mixed-currency month-end manual recomputation, UI copy check, no regression to signed liability math. |
| BR-004 | P1 | Net worth / accounts | Historical/as-of balances may include archived accounts when `include_in_net_worth` is true. | Archived accounts can still distort historical net worth unless this is intentional and explained. | Either filter archived accounts from net-worth summaries or document the intended historical behavior. | ~ | Archived included/excluded account scenarios across current and historical net worth. |
| BR-005 | P1 | Dev health | `npm run lint` is red with `react-hooks/set-state-in-effect` errors. | A separate lint CI gate would fail; the warnings point to avoidable re-render patterns. | Fix `transaction-dialog-provider.tsx`, `trend-chart.tsx`, and `theme-toggle.tsx` without behavior changes. | N | `npm run lint`, `npx tsc --noEmit`, `npm run build`. |
| BR-006 | P1 | Tests / money math | There is no automated test safety net for ledger and FX invariants. | Multi-currency and import fixes touch trust-critical financial math. | Add the thinnest practical SQL/Vitest coverage for FX import, signed liabilities, transfer exclusion, and voided exclusion. | ~ | Tests run locally plus existing verify gate. |
| BR-007 ✅ | P1 | Transfers / debts / FX | **Resolved in PR #37.** Cross-currency transfers, explicit destination amounts, cost visibility, FX spread/fee UX and optional same-currency fees are integrated. | COP/CAD households need to record real movements between currencies without faking expenses. | Keep transfer ledger/cost invariants in authenticated regression QA. | Y | Same-currency transfer nets to zero; cross-currency transfer preserves balances/base math; costs remain visible and bounded. |
| BR-008 ✅ | P1 | Transactions | **Resolved in PR #37.** `search_household_transactions` provides server-side search/filtering, full-set aggregates and 50-row pagination. | Real Alpha usage will grow quickly; this is the hottest page. | Re-run authenticated multi-page/filter QA after RPC changes. | ~ | Authenticated multi-page QA passed 2026-07-25; filters and page totals remained stable. |
| BR-009 ✅ | P1 | Payees / merchants | **Resolved.** Picker, CRUD, filtering, CSV/recurring wiring and single merge are shipped. Multi-source bulk merge is now implemented through atomic `merge_payees_bulk`. | Typos fragment reports and block rules/autocomplete. | Apply migration `20260725120000_payees_bulk_merge.sql` and QA multiple sources into one survivor. | Y | Merge keeps history, mirrors merchant labels, archives sources and preserves household isolation. |
| BR-010 ✅ | P1 | Rules / automation | **Resolved in PR #37.** `categorization_rules` is migrated with CRUD, priority/active state and CSV preview application. | Rules are the fastest path to low-friction import cleanup. | Complete a sanitized-fixture authenticated QA run; the current QA household has no rule data. | Y | Rule priority, inactive rules and import preview application. |
| BR-011 | P1 | Review workflow | No `review_status`, queue, or bulk "mark reviewed". | Daily finance apps need a place to process imported/manual transactions and know what still needs attention. | Add transaction review columns and a `/dashboard/transactions/review` or filtered queue. | Y | Imported transactions default unreviewed, bulk mark reviewed, flagged state, dashboard count. |
| BR-014 ✅ | P2 | Recurring | **Operational.** Migration/function/log are applied, `pg_cron` is enabled, the daily job runs, and the UI shows per-template plus aggregate failure health. | Recurring automation must fail visibly and preserve ledger correctness. | Monitor `last_error` and `recurring_autopost_log`; recurring transfers remain UC-9. | Y | Future dates, missing FX, idempotency, end-date auto-deactivation and visible failures. |
| BR-015 | P2 | Destructive-feeling actions | **Further resolved** (PR #23, merged to `main`) — the reusable `AlertDialog` (`src/components/ui/alert-dialog.tsx`, adopted for void-transaction confirmation) is now also adopted for account/category archive via a shared `ArchiveConfirmButton`. Correction to this row's earlier text: archive actions (`archiveAccountAction`/`archiveCategoryAction`) already existed — they just fired with **zero** confirmation, not "no equivalent action." Also added a shared `ArchiveToast` (reusing the existing `ToastProvider`) with an Undo action, replacing the static "archived" `Callout` banner. | These actions are ledger-sensitive and can feel risky even when technically safe. | Still open: no archive-style confirm anywhere else a destructive action might be inlined by hand (audit other entities as they gain archive/delete actions); void-transaction confirm still has no undo. | N | Void, archive, restore, Undo (survives the redirect that strips the URL flags), cancel, keyboard/mobile. |
| BR-017 | P2 | Accounts / reconciliation | Opening balance is one-time only and there is no "adjust/reconcile balance" action. | Real finance use needs a safe way to correct current balances without editing history. | Add an adjustment transaction flow that creates a ledger-safe entry and clear audit-style description. | ~ | Asset/liability adjustment signs, reports exclusion, net-worth effect, void behavior. |
| BR-018 | P2 | Budgeting | Budgeting tracks spend but has no rollover/carryover. | Sinking funds and YNAB-like behavior depend on carryover. | Add `rollover_enabled` and computed carryover for budget lines, then expose it in budget UI. | Y | Month-to-month carryover, excluded categories, over/under budget states. |
| BR-021 | P2 | Monthly recap | **Partially resolved** — `/dashboard/month-review` builds a real recap from monthly summary/category/budget data, but the health score is an explicitly-labeled mock heuristic (same as the dashboard's) and "Close month" is a disabled, not-yet-built action. | This gives high perceived value without inventing new financial primitives. | Decide whether to ship a real (non-mock) health-score formula and whether "Close month" is in scope for Alpha. | ~ | Months with/without data, budget overages, biggest category, no private raw data leakage. |
| BR-023 ✅ | P2 | Tags / flexible slicing | **Resolved and applied.** Tags, transaction joins, CRUD, chips and filtering are shipped. | Tags unlock reports by trip/project/person without abusing categories. | Maintain M:N/RLS/archive regression coverage. | Y | M:N assignment, filtering, household RLS, archived tags. |
| BR-024 ✅ | P2 | CSV import | **Resolved and applied.** Saved mappings and ledger-safe import-batch revert are shipped. | Repeated statement imports need reusable mapping and safe recovery. | Keep a sanitized mapping/revert fixture in authenticated QA. | Y | Mapping reuse, bad file recovery, batch traceability. |
| BR-025 ✅ | P2 | Localization / currency | Shared currency/month/percent helpers and locale threading are shipped. `formatIsoDate`/`formatIsoDateRange` now centralize UTC-safe daily formatting across residual leaf screens. | The app is bilingual and COP/CAD-heavy; formatting should match user expectations. | Treat remaining hard-coded copy translation as content localization, not a formatter gap. | N/~ | CAD/COP/USD display, ES/EN/FR dates and mobile amount inputs. |
| BR-028 🟡 | P3 | PWA | Manifest shortcuts and `share_target` are implemented. Quick add, Transactions and Recurring deep links are present; shared text/URL routes to expense quick-add. | Cheap mobile polish after core daily dashboard work. | Verify shortcuts and Share Target in a real installed PWA; browser-tab QA is insufficient. | N | Installed manifest, shortcuts, Share Target and mobile OS behavior. |
| BR-029 ✅ | P2 | Transactions filters | **Resolved** (see Resolved table; PR #17, merged to `main`). `/dashboard/transactions` date filtering had two gaps: (1) a thin preset set (only This month / Last 30d/60d/90d / This year) missing the ranges users actually reach for, and (2) no "All time" preset — any link/visit without an explicit date range silently defaults to the current month. Real Alpha usage also surfaced **BF-024**: selecting a date applies immediately and clicking "Apply filters" resets the custom range back to This month, overwriting it. Sprint 13 QA hit the silent-default trap via the dashboard's needs-review link and worked around it with an ad-hoc wide date range (`2000-01-01`–`2099-12-31`) baked into that one link. | Bumped from P3: confirmed real-usage pain (BF-024), not just a theoretical cross-month trap. Custom ranges are effectively unusable while Apply resets them. | Slice 1: fix BF-024 so a custom range survives Apply (serialize the form through `transactionsPath()` / hidden `month`, single commit point). Slice 2: broaden presets to Last month, Last 3 months, Last 6 months, Year to date, and All time (alongside the existing ones), and point the dashboard needs-review link at "All time" instead of the date-range hack. | N | Custom range persists after Apply; each new preset selects the correct span; "All time" ignores month; presets combine with other filters (review/type/account); mobile chip layout. |

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
3. ✅ BR-012 — Needs-review dashboard count (recent-activity feed already shipped).
4. ✅ BR-015 — Confirmation/undo pattern for void/archive (void and archive both use `AlertDialog`; archive adds an Undo toast via PR #23, merged to `main`).

### Package 3 — Merchant memory and automation

1. BR-009 — Payees/merchant normalization and autocomplete (`payees` table + backfill done; RPC wiring + autocomplete UI still open).
2. BR-010 — Categorization rules.
3. ✅ BR-022 — Reports hub by payee/category (`/dashboard/reports`).

### Package 4 — Planning depth

1. BR-018 — Budget rollover/carryover.
2. ✅ BR-019 — Goals.
3. ✅ BR-020 — Debt payoff projection (`/dashboard/debt-planner`).
4. BR-021 — Month in review: decide on a real health-score formula and whether "Close month" ships for Alpha (recap itself already shipped).

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
