# Benchmark Follow-up Issues

> Documentation only. Near-term implementation backlog derived from
> [benchmark-review-monarch-ynab-copilot.md](../benchmark-review-monarch-ynab-copilot.md)
> (BR-001…BR-029) and
> [benchmark-review-mobile-money-managers.md](../benchmark-review-mobile-money-managers.md)
> (BR-030…BR-041).
> This translates the benchmark reviews into issues that can or should be worked
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

## Mobile-benchmark implementation issues (BR-030…BR-047)

> Source: [benchmark-review-mobile-money-managers.md](../benchmark-review-mobile-money-managers.md).
> BR-030…BR-041 were verified absent from the codebase on 2026-07-27 (App A
> recording + App B documentation); BR-042…BR-047 were added and verified
> absent on 2026-07-28, after a screen recording of App B itself confirmed
> BR-030's credit-card cycle live and surfaced six further gaps. See §5 of
> that doc for the already-shipped list that must **not** be re-proposed
> (amount calculator, inline tag creation, recurring auto-post, sub-categories,
> `include_in_net_worth`, budget carry-over, "All time", live FX, transfer
> fees, "Save and Add Next").
> Observation evidence carries a `[m:ss]` video timestamp; the doc is
> self-sufficient, so neither recording needs re-watching.

| ID | Priority | Area | Issue | Why soon | First implementation slice | DB | Verify |
|---|---:|---|---|---|---|:--:|---|
| BR-030 | P1 | Accounts / credit cards | Credit-card accounts have no statement cycle. `accounts` lacks `statement_day`, `payment_day` and `billing_account_id`, so "what do I owe on the next payment date" cannot be derived — only a single running balance exists. | The one real *functional* gap found in either benchmark app, and the question a card-holding household asks monthly. **Confirmed live in the 2026-07-28 App B recording** (previously documentation-only): the cycle preview (`Balance Payable 06-01~06-30 (Pay:07-01)` / `Outst. Balance 07-01~07-31 (Pay:08-01)`) renders *during account creation*, before any transaction exists `[1:02]`; the Accounts list shows both figures as separate columns per card `[7:30]`; each statement period gets its own row with a swipe-revealed `Pay` action `[6:42]`. | Add the three columns to `accounts` (nullable, credit-card only) + a `get_card_cycle_summary(account_id, as_of)` RPC returning payable/outstanding/overdue. UI: two figures on the account card, and show the cycle-window preview inline during account creation (confirmed high-value detail from the recording). The `Pay` action that posts the settlement transfer is a **second** slice — do not bundle. | Y | Cycle boundaries across month ends; a card with no cycle configured still behaves as today; overdue detection; payable excludes open-cycle spend; settlement transfer nets both accounts; RLS on the new RPC. |
| BR-031 | P1 | Multi-currency / entry | The amount field is single-currency (`amount-input.tsx`). When an account's currency differs from the household base, the user must convert mentally before typing. | This is the exact COP/CAD case the product exists for. The FX foundation (BR-002, `lib/fx.ts`, `exchange_rates`) is already built — this is UI plus a re-fetch action, not new financial plumbing. | Render a second, linked amount field whenever `account.currency_code <> household base`; typing in either recomputes the other from `get_exchange_rate`; add an explicit re-fetch control that re-applies the current rate. Persist both the entered amount and the resolved rate exactly as today. | N | Both directions recompute; rate re-fetch updates the derived side only; the stored `exchange_rate_to_base` matches what the UI displayed; same-currency accounts still render one field; rounding does not drift on round-trips. |
| BR-032 | P2 | UX speed / settings | `advanced-fields.tsx` is a fixed collapsible. Users who never use tags, payee, comment or attachments still scroll past them on every entry. | Both benchmark apps converged on this independently — App A ships it (Settings → Personalization → *Additional fields*, `[7:46]`) and App B announced it in its v1.12.1 notes. Strong signal, and it is a preference row, not new financial logic. | Add a user-preference (per user, not household) listing the optional transaction-form fields with checkboxes; `transaction-form.tsx` reads it to decide what renders. Default = current behaviour, so existing users see no change. | Y | Hiding a field never drops data already on an existing transaction; edit of a transaction that *uses* a hidden field still shows it; defaults preserved for existing users; preference survives sign-out. |
| BR-033 | P2 | UX speed | The transaction form has no fast path for "today / yesterday" — the most common dates require the date picker. | Best effort-to-friction ratio in the whole review. App A `[2:18]` renders `7/27 today · 7/26 yesterday · 7/25 two days ago` chips with a calendar icon beside them for everything else. | Three relative-date chips above the existing date control, locale-formatted via the shared `formatIsoDate` helpers. No schema change. | N | Chip selection writes the correct ISO date in the household timezone; chips reflect the user's locale; the calendar control still overrides; crossing midnight during an open form does not strand a stale "today". |
| BR-034 | P2 | Transactions | No way to duplicate an existing transaction. Repetitive-but-irregular entries (the same coffee, the same fuel stop) are retyped in full. | App B solves this with a bookmark/template entity; App A solves ~80 % of it with a `COPY` button on the detail view `[5:42]`. **Prefer `COPY`** — same benefit, no new table, no lifecycle to maintain. | A `Copy` action on the transaction detail that opens the create form pre-filled from the source, with the date defaulted to today and nothing persisted until the user saves. | N | Copy of a transfer, a multi-allocation transaction and a voided transaction all behave sanely; the copy is a genuinely new transaction (no shared id); tags/payee/attachments carry as intended. |
| BR-035 | P2 | Transactions / cards | No concept of an installment purchase. A 12-month plan must be faked as a recurring template, which has no end-total and no *n of N* position. | Directly relevant to COP/LATAM card usage (*meses sin intereses*). Differs from recurring in kind: fixed count and fixed total known at creation. | Decide the model first — installments are **not** a reuse of `recurring_transactions`. Slice 1 is the schema + generating N scheduled transactions from (total, count, start); the *n of N* badge follows. | Y | Total across generated entries equals the original; early payoff/void of the parent; the schedule survives an account archive; reports do not double-count the parent and its children. |
| BR-036 | P3 | Periods / budgets / reports | The month is always the calendar month. A household paid on the 25th cannot align budgets or reports to its actual pay period. | Real behaviour change for payday-aligned budgeting, and both apps support it (App B: "How to customize monthly & weekly period"; App A: *First day of the week* `[8:02]`). | **Scope carefully — high blast radius.** Every monthly RPC (`create_monthly_dashboard_functions`, budgets, month closures, reports) assumes calendar months. Slice 1 is a household setting plus a single shared period-resolver used by *one* screen; migrate the rest only once that is proven. | Y | Month boundaries on the 1st behave exactly as today; a non-1st start produces contiguous non-overlapping periods; budgets/month-closures/reports agree with each other; February and 31-day-start edge cases. |
| BR-037 | P3 | Reports / visualisation | There is no calendar view of transactions. Neither `/dashboard/trends` nor `/dashboard/reports` shows per-day spending rhythm. | The one visualisation in either app that our existing analysis screens do not replace: a month grid answering "which days do I actually spend?" | Read-only month grid: income/expense/net per day, tap a day to filter the transaction list to it. Reuse existing monthly summary data; no new RPC if the current one can group by day. | ~ | Days with no activity; multi-currency days; month boundaries; mobile layout at 320 px; matches the list totals for the same range. |
| BR-038 | P3 | Settings / display | No display preferences: the app always lands on the same scope and period, the transaction list has one density, and balance adjustments (BR-017) are indistinguishable in the list. | Cheap, self-contained, and bundles four of App A's settings into one slice `[7:46, 8:02]`. | One settings section with: default landing account scope, default period, compact-list toggle, and show/hide balance adjustments. All client-side except where the default period changes the initial query. | ~ | Defaults apply on first load only (a URL range still wins); compact mode stays readable on mobile; hiding balance adjustments never changes any total, only visibility. |
| BR-039 | P3 | Accounts / reporting | Transfers into savings/investment accounts never appear as expense, so "am I actually saving?" and "what did I spend?" cannot both be answered from the same report. | App B's per-account `Transfer-Expense` opt-in settles the "is saving an expense?" argument with a toggle instead of a doctrine — and explicitly forbids it on cash/bank/card accounts. | A per-account boolean, honoured only in reporting (never in the ledger — transfers must stay balance-neutral). Restrict to savings/investment/other classes as App B does. | Y | Ledger totals and net worth are unchanged with the flag on; reports change only for flagged accounts; the flag cannot be set on cash/checking/credit-card; budgets agree with reports. |
| BR-040 | P3 | Transactions / modelling | A partial refund or reimbursement has no clean representation. Booking it as income inflates both sides and distorts category totals. | App B's answer is elegant: record the refund as a **negative amount in the same category**, so the category nets to the true cost. | **Modelling decision before UI.** Confirm whether `transaction_allocations` tolerates negative amounts without breaking budget actuals, dashboard sums and the correctness checks in `supabase/tests/`. Document the outcome; only then expose it. | ~ | Negative allocation nets correctly in budgets, category reports and the dashboard; never produces a negative *account balance* artefact; voiding it restores the original; SQL invariants in `supabase/tests/` still pass. |
| BR-041 | P3 | Export | Export is CSV only. | Non-technical household members open spreadsheets, not CSV; App A exports `.xlsx` straight to the OS share sheet `[4:00]`. | Add `.xlsx` as a second format on `/dashboard/export`, reusing the existing query and column mapping. Keep CSV. | N | Numbers export as numbers (not text); COP/CAD formatting and negative signs survive; opens cleanly in Excel, Sheets and LibreOffice; large exports do not time out. |
| BR-042 | P2 | Reports / transactions | No sub-period rollup: a monthly view has no per-week breakdown, a yearly view has no per-month breakdown, inside the same screen. | Cheapest item in this batch — reuses existing monthly summary data, no new financial primitive. App B's `Total` tab lists one row per week inside the selected month (and one row per month inside a year), each with its own income/expenses/total `[9:58, 10:02]`. | Add a drill-in grouping level to the existing monthly summary query (group by week within the selected month); render as expandable/tappable rows. Extend to month-within-year only after the week-within-month slice is proven. | ~ | Weeks with no activity render `$0`; totals across weeks sum to the existing month total; month totals across months sum to the existing year total; mobile row density. |
| BR-043 | P2 | Budgeting | Budgets track spend and rollover (BR-018) but have no month-over-month comparison or payment-method split. | Natural extension of already-shipped rollover work, not a new subsystem. App B's Budget widget shows `Compared Expenses (Last month) 100%` plus separate `Expenses (Cash, Accounts)` / `Expenses (Card, Pay)` figures, with an inline Excel-export button on the same screen `[9:58]`. | Add a "vs last month" percentage to the existing budget summary (reuse the prior month's actuals already computed for carryover) and a cash-vs-card expense split by account class. Defer the inline export button until BR-041 ships a shared export component to reuse. | ~ | Comparison percentage matches manual recomputation from last month's actuals; split totals sum to the existing budget total; a first-month budget (no "last month") degrades gracefully. |
| BR-044 | P2 | New feature | No standalone dated note independent of a transaction. Users have nowhere to jot a reminder or context for a day that isn't itself a transaction. | The one genuinely new *entity* in this batch, not a variant of something we have. App B's `Note` tab is a per-day scratch note with a title and a colour tag, browsable like a small calendar-journal, entirely separate from the transaction `Comment` field `[0:56–1:02, 8:56]`. | Smallest reasonable slice: a household-scoped `notes` table (date, title, body, colour), one list/detail view reachable from the dashboard or transactions period header. No attachments, no reminders, no linking to transactions in slice 1. | Y | A note with no transactions that day still saves/loads; RLS household isolation; archiving/deleting a note never touches ledger data; date-picker/timezone correctness. |
| BR-045 | P3 | Transactions / schema | Transactions have no time-of-day — `transaction_date date not null` only records the date, so same-day entries have no natural chronological order beyond insertion order. | Real same-day-ordering value (which of three same-day coffees came first), and both benchmark apps capture it; App B additionally makes it configurable (`Configuration → Time Input: Input Only, Desc.`) `[15:56, 16:08]`. | **Scope the first slice narrowly**: add an optional time component captured at entry (default to current time, editable), displayed on the transaction detail and list. Defer sort-order configurability and any RPC/report change that assumes date-only ordering. | Y | Existing transactions (no time) keep sorting exactly as today; new transactions with a time do not break `transaction_date`-keyed queries (RPCs, budgets, reports); the time is timezone-correct for the household. |
| BR-046 | P3 | Accounts / safety UX | Changing an existing account's currency has no confirmation or explanation of the consequence, even though our own historical-FX correctness (BR-002/BR-003) means past entries keep their originally-stored rate regardless. | Cheapest possible safety addition — a confirm dialog, zero logic change. App B's warning is explicit: *"Changing the currency will affect the entry made before... Are you sure you want to change the currency for this account?"* `[8:20]`. | Add a confirmation dialog on account-currency change explaining that historical entries keep their original stored rate (accurately describing our *better* behaviour, not copying App B's cruder one). | N | Dialog appears only on an actual currency change, not on other account edits; cancelling leaves the currency untouched; confirming does not alter any historical `exchange_rate_to_base` on existing entries (that would be a regression, not a feature). |
| BR-047 | P3 | Categories | A subcategory cannot be promoted back to a top-level category, and there is no bulk re-parent action; `parent_category_id` can only be set at creation/edit of a single category. | Small, self-contained category-management gap. App B's `Modify Subcategory → → Main Category` walks into a picker with a confirm dialog (*"This subcategory will be changed to main category. Do you wish to continue?"*) `[4:14–4:52]`. | Add a "Move to main category" action on a subcategory that clears `parent_category_id`, with a confirmation dialog. Bulk re-parenting (moving several subcategories at once) is a later slice, not part of the first cut. | ~ | Promoting a subcategory does not orphan any transaction/allocation referencing it; archived subcategories are excluded from the picker; existing reports/budgets keyed on the category still resolve correctly after the move. |

## Follow-ups raised during this sprint's QA (BR-048…)

> Source: authenticated QA of `sprint/mobile-capture-parity` on 2026-07-28/29,
> not a benchmark app. Same table shape as above.

| ID | Priority | Area | Issue | Why soon | First implementation slice | DB | Verify |
|---|---:|---|---|---|---|:--:|---|
| BR-048 | P3 | Categories | Re-parenting a category is a form field. BR-047 added a one-way "Move to main level" action, but putting a category *under* another, or moving it between parents, still means opening the edit form and changing a dropdown. Drag-and-drop already exists for reordering siblings — it just cannot change nesting. | The category tree is the one screen where the structure *is* the content, and the manipulation already looks draggable: `sortable-category-list.tsx` renders grip handles that reorder siblings, so a user who drags a row onto another reasonably expects it to nest. Cheap to reach for, surprising when it does nothing. | **Restructure the DnD before adding behaviour.** Today each type group renders one `DndContext` per level over a flat sibling list, which cannot express "dropped onto a parent". Slice 1 is the dnd-kit *tree* pattern: one `DndContext` per type over a **flattened** list of `{ id, depth }`, with the drop depth derived from the drag's horizontal offset (drag right = becomes a child of the row above, drag left = pops out to the main level). Then one server action writing `parent_category_id` **and** `sort_order` together, reusing the rules `validateParentCategory` already enforces (a child cannot become a parent, category type and reporting type must match the new parent, no cycles) and rejecting the whole drop rather than half-applying it. Bulk multi-select drag is **not** in this slice. | N | An illegal drop (onto a child, across category types, onto itself) is refused and the row springs back rather than half-applying; a promoted or re-nested category keeps its id, so allocations, budget lines and reports still resolve; `sort_order` stays contiguous among the new siblings; the list reflects the new tree without a hard refresh (see the stale-copy bug fixed in this sprint); archived categories are excluded while `showArchived` is on, which is also when dragging is disabled today; keyboard drag still works via `sortableKeyboardCoordinates`; touch drag does not fight the page scroll on a 320 px screen. |

**Explicitly kept alongside it:** horizontal-offset dragging is imprecise on
phones, so BR-047's "Move to main level" button and the edit form's parent
dropdown both stay. Drag-and-drop is the fast path, not the only path.

**BR-048 shipped** in the same sprint (2026-07-29). `sortable-category-list.tsx`
now renders one `DndContext` per type group over a **flattened** `{category,
depth, childCount}` list; `projectDrop` reads the drag's horizontal offset to
decide the landing depth, clamped to the two levels the schema allows (a
category with children can never leave depth 0). `moveCategoryAction` writes
`parent_category_id` and the destination siblings' `sort_order` together,
re-checking every rule `validateParentCategory` enforces and rolling the parent
change back by hand if the reorder fails. Rejections return a message instead
of redirecting, so the row springs back and the reason is shown.
`reorderCategoriesAction` was removed — `moveCategoryAction` supersedes it.
Still not built: multi-select drag.

### Status — 2026-07-30 (Tier-4 large sprint)

Branch `sprint/tier4-large`, based on the still-unmerged `sprint/tier3-medium`.
Shipped **BR-030, BR-035, BR-036, BR-040, BR-045 and UC-9** — the six "grandes",
each at the first slice its row prescribes. Six migrations are prepared and
**pending `npx supabase db push`** (`20260730120000`–`20260730170000`).

**Every row in the BR-030…BR-048 table is now built.** Remaining work is the
explicitly-deferred later slices listed below, not unstarted tickets.

Per-item detail lives in `AGENTS.md` and in three new feature docs
(`card-statement-cycle.md`, `installment-plans.md`, `month-start-day.md`) plus the
BR-040 decision (`refunds-negative-amounts.md`). Decisions worth not
re-litigating:

- **BR-040's answer was "narrow the constraint", not "drop it".** The finding is
  that `transaction_allocations` genuinely did forbid negatives (two `> 0`
  CHECKs) while everything else already tolerated them. The two options were a
  negative `expense` allocation (one migration, every report nets automatically,
  invariant lost) or a separate `expense_refund` type (invariant kept, but five
  shared money functions rewritten so a P3 ticket could be *seen at all*). Making
  the CHECK type-aware — negatives only where `allocation_type = 'expense'`, zero
  still forbidden, income/financial/adjustment untouched — gets both, and **no
  shared financial SQL was modified**.
- **BR-035's plan holds no money.** The plan row has no entries and no
  allocation; the N children carry everything. "Reports do not double-count the
  parent and its children" is then true by construction rather than by a filter
  someone has to remember, and no report, budget or monthly RPC changed.
- **BR-036 stopped at one screen, on purpose, and says so on screen.** Reports
  honours the household's period; budgets, closures and the dashboard do not.
  The row's "budgets/month-closures/reports agree with each other" check is
  therefore **not met yet, by design** — it is slice-2 acceptance, and the reason
  slice 2 exists. A Settings note and a Reports callout state the boundary rather
  than letting the user find it.
- **BR-030 did not bundle the `Pay` action**, exactly as its row instructs.
  `billing_account_id` is stored now so that slice has a source account to read.
- **UC-9 refuses auto-post on a cross-currency transfer** in three places (form,
  server action, job). The amount that arrives is a real ledger value only the
  user knows and it moves with the rate every month; a template cannot carry it,
  and guessing from a stale rate would write a wrong balance silently. Posting
  such a template by hand works and asks for the received amount.
- **BR-045 is display and ordering only.** No period predicate anywhere keys on
  the time, so a timed transaction lands in exactly the month it does today.

Deferred later slices, all deliberate:

| Item | Deferred piece |
|---|---|
| BR-030 | The `Pay` action that posts the settlement transfer. |
| BR-035 | The *n of N* badge on the **transaction list** (the plan list has it). Needs two more columns on `search_household_transactions`, forcing another DROP-and-recreate. |
| BR-036 | Everything except Reports. The hard part is `budgets.budget_month` and `month_closures`, which key rows *by month* — a data-model decision, not arithmetic, deserving its own written decision. |
| BR-045 | Configurable sort order. |
| BR-042 | Months-within-year (weeks-within-month shipped in the previous sprint). |
| BR-048 | Multi-select drag. |

Two traps found here, both worth not rediscovering:

- **`scripts/generate-legacy-translations.mjs` was destructive.** It built the
  catalog from `audit-i18n.mjs` findings alone and wrote it wholesale, so every
  entry it did not collect was silently deleted — one run dropped ~40
  already-translated phrases. The audit sees only rendered JSX text, while
  `check-i18n-coverage.mjs` *also* collects `ui(...)` arguments, so a phrase
  passed straight to `ui()` was invisible to one and required by the other. Fixed:
  it now collects from both, seeds from the committed catalog so nothing can be
  lost, and writes sorted output.
- **BR-042's week rows were gated on "exactly one calendar month"**, which is
  never true once BR-036 moves the boundary — they would have silently vanished
  for precisely the households that enabled it. Now gated on a 28–31 day span.

### Status — 2026-07-29 (Tier-3 medium sprint)

Branch `sprint/tier3-medium`. Shipped **BR-031, BR-037, BR-039, BR-043,
BR-044** — the five rows classed as "medium: a real feature across several
files". Three migrations are prepared and **pending `npx supabase db push`**
(`20260729130000`, `20260729140000`, `20260729150000`).

Decisions worth not re-litigating:

- **BR-031's row asks for the wrong thing on an expense, and the right thing on
  a transfer.** Corrected after QA on 2026-07-29; the row's "render a second,
  linked amount field whenever `account.currency_code <> household base`" is
  kept here for the record but is **not** what shipped.
  - A COP expense has one real value: the COP. The CAD figure is derived from
    the rate and will never be typed, so a large editable base field is weight
    spent on a number the user does not own. It shipped that way first and was
    rejected on sight — correctly. It is now a **line of text** under the
    amount, which still removes the mental arithmetic the row complains about.
  - The genuine two-amount case is the **transfer**: what left the source and
    what arrived in the destination are both entered, and both are ledger
    values. Those are now paired in one card, each above its own account
    selector. Before this, the second amount sat below the date, description
    and notes — the two figures were never on screen together, which is exactly
    what made the pairing worth doing.
  - Consequence: the row's "both directions recompute" check does not apply
    anywhere. Nothing converts one entered amount into another; the transfer's
    two amounts are independent, and the expense's base figure is read-only.
- **BR-031 is on the create form only.** The *edit* form has no FX plumbing at
  all — it neither collects nor submits a rate — so anything here would have
  meant building the whole exchange-rate block first. Separate slice.
- **BR-039 changes `/dashboard/reports` and `/dashboard/calendar` only.** The
  dashboard, trends, cash-flow and month-review read monthly-summary *SQL* RPCs;
  teaching those about the flag means changing shared financial SQL, which is
  not what a P3 reporting toggle should cost. The two filter-aware screens are
  where the "am I actually saving?" question is asked, and both state on screen
  that the figure includes transfers and that the category breakdown does not.
- **BR-039 puts nothing in the category breakdown.** A transfer has no
  allocation, and inventing a synthetic category to make the donut add up would
  be the exact thing the row's "budgets agree with reports" check forbids. The
  amount is instead surfaced explicitly: on the "Total spent" KPI, in a callout,
  and — usefully — in the *merchant* breakdown as `→ Account name`.
- **BR-043's "vs last month" is over this month's budgeted categories**, not
  over all expenses. Comparing against a different category set would produce a
  percentage that moves when a budget line is added, which is not a spending
  signal. A first month (no prior spend in those categories) renders "nothing to
  compare yet" rather than 0 % or ∞.
- **BR-044 uses archive-over-delete** (no delete policy on `notes`), matching
  tags and payees. Notes are not financial records, so a hard delete would be
  defensible — but one lifecycle for user-created lists beats two.
- **BR-044 does not put note markers on the calendar grid.** The grid's day
  cells already navigate to that day's transactions; a second meaning per cell
  is a later slice. The two screens cross-link per month instead.

### Status — 2026-07-28

Shipped on `sprint/mobile-capture-parity` (not yet merged): **BR-032, BR-033,
BR-034, BR-038, BR-041, BR-042, BR-046, BR-047**. Still open from this table:
BR-030 (card statement cycle), BR-031 (bidirectional amount input), BR-035
(installments), BR-036 (month start day), BR-037 (calendar view), BR-039
(transfer-as-expense), BR-040 (negative-amount refunds), BR-043 (budget
vs-last-month), BR-044 (standalone notes), BR-045 (time-of-day). Raised during
this sprint's QA and still open: BR-048 (drag-and-drop category nesting).

Two notes for whoever picks this up next:
- BR-046 was documented as "add a confirmation to an existing currency change".
  There was no currency change to confirm — the account **edit** form had no
  currency field at all, so an account's currency could only ever be set at
  creation. The ticket shipped as the field plus the confirmation.
- BR-042 shipped weeks-within-month only, as its row specifies.
  Months-within-year is still unbuilt.

### Package 5 — Mobile capture parity

Suggested ordering if this becomes a sprint. Grouped so that each package is
independently shippable.

1. **Friction quick wins (no migration):** BR-033 relative-date chips →
   BR-034 duplicate transaction → BR-041 `.xlsx` export.
2. **Multi-currency entry:** BR-031 bidirectional amount input.
3. **Preferences:** BR-032 configurable form fields + BR-038 display
   preferences (one settings sprint, one migration).
4. **Card correctness:** BR-030 statement cycle — schema + derived summary
   first, `Pay` action second.
5. **Deliberate/heavier:** BR-035 installments, BR-036 month start day,
   BR-037 calendar view, BR-039 transfer-as-expense, BR-040 negative-amount
   refunds. BR-036 and BR-040 need a written decision before any code.
6. **Reporting depth + small safety/management gaps (added 2026-07-28, from
   the App B recording):** BR-042 sub-period rollup rows → BR-043 budget
   vs-last-month comparison (do these two together — both touch monthly
   summary data) → BR-046 currency-change confirmation (trivial, do it
   whenever accounts forms are next touched) → BR-047 promote-subcategory →
   BR-044 standalone Notes (new entity, schedule independently) → BR-045
   time-of-day on transactions (schema change, schedule independently and
   scope narrowly per its row above).

Recommended branch name if/when starting implementation:
`sprint/mobile-capture-parity`.

## Deferred or park-until-triggered issues

| ID | Area | Deferred issue | Revisit when |
|---|---|---|---|
| BR-D01 | Attachments / receipts | `attachments` table and Storage-backed receipts. **Still deferred** — deliberately given no new BR-ID by the 2026-07-27 mobile benchmark. Reference implementation now on record: App A offers 3 photo slots on the entry form (camera or gallery, `[2:48]`) and a thumbnail on the transaction detail `[5:42]`. | Real usage proves receipt capture is needed, or OCR becomes a priority. |
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
