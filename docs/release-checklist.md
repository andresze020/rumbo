# Release checklist — regression, load and release gate

## Status

**Implemented (RUM-010b, 2026-09-24).** A release of Rumbo is approved only
when every box below is checked. Ticket:
[`performance-ux-backlog.md` · RUM-010b](./performance-ux-backlog.md). Testing
stack and conventions: [`testing.md`](./testing.md).

**Current verdict (2026-09-25, `main` @ cebb998): APPROVED.** The blocker
found by the first run — Dashboard month navigation dropping clicks (B-7) — is
fixed, and `perf:nav` loses 0 navigations. The refunds decision (B-8) is live:
migration `20260925120000_b8_transactions_totals_net_refunds.sql` applied to the
live project (62/62, 0 pending), step 3 re-run: 46/46. On the live household the
Transactions list and the Dashboard agree to the cent for each of the last 12
months. Every financial figure reconciles.

History: the first verdict (2026-09-24, `main` @ RUM-009) was **not approved**
— B-7, 5/7 month clicks lost.

---

## 1. Approval criteria

A release is approved when **all** of these hold. None is advisory.

| # | Criterion | How it is checked |
|---|---|---|
| 1 | Lint, types, unit tests, i18n and production build pass | CI job `lint · typecheck · i18n · test · build` |
| 2 | Every ledger invariant passes on generated fixtures (both households, member and non-member) | CI job `ledger invariants on fixtures` = `npm run db:local` |
| 3 | Every ledger invariant passes on the live household | `npm run db:test -- --household=<uuid> --user=<member uuid>` (manual, read-only) |
| 4 | No cross-household leakage | `rum_010b_household_isolation.sql`, part of 2 and 3 |
| 5 | No navigation is lost (a click that never commits) | `npm run perf:nav` exits 0 |
| 6 | Navigation p75 within the §3.1 targets, or a written reason | `npm run perf:nav` against `npm run build && npm start` |
| 7 | An optimisation is only accepted if the **ready** time improves — not if it swaps a blank screen for a skeleton | `perf:nav` measures until no skeleton is left |

"The figures do not reconcile" is always a blocker, whatever the performance
numbers say.

---

## 2. How to run it

```bash
# 1–2  (what CI runs on every pull request)
npm run lint && npx tsc --noEmit && npm run i18n:check && npm test && npm run build
npm run db:local -- --bench          # ~20 s: private Postgres + every migration + fixtures + all checks

# 3  live, read-only (needs SUPABASE_ACCESS_TOKEN; there is no staging copy)
npm run db:test -- --household=<uuid> --user=<member uuid>

# 5–7  real browser, production build, a TEST account (never a real user's)
npm run build && npm start &
npm install --no-save playwright
PERF_EMAIL=… PERF_PASSWORD=… PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium \
  npm run perf:nav -- --base=http://localhost:3000 --runs=7
```

---

## 3. What the suite covers

Backlog §2 invariants → where each one is tested:

| Invariant | Test |
|---|---|
| Net worth = Total assets + Signed liabilities (incl. an overpaid card) | `valuation.test.ts` (formula, overpaid-card case) + fixture expectation "overpaid credit card holds a positive balance" |
| Displayed liabilities = Σ max(0, −balance) | `valuation.test.ts` |
| Savings = Income − Expenses | `rum_010b_release_invariants.sql`, every month |
| Savings rate = Savings / Income; null with zero income | same file, every month + fixture month B 2025-02 (zero income) |
| Transfers do not affect Income/Expenses | BR-006 (no reporting allocation on transfers) + RUM-010b (never income) |
| Voided transactions do not affect totals | RUM-010b "each posted allocation counts once, in its own month (no voided/pending)" + BR-006 balances (fixed, see below) |
| Every aggregate scoped to one household | `rum_010b_household_isolation.sql` (every `household_id` table, discovered at run time; 7 RPCs; write probes) + "children share the transaction's household" |
| Historical values use the intended date and FX | RUM-010b "base = amount × own stored rate" + FX revaluation check + fixture COP revaluation / EUR missing-FX fallback |
| Month boundaries (current and historical) | RUM-010b month check iterates every month of history |
| Dashboard ↔ Accounts ↔ Net worth | RUM-006 multi-date = single-date; RUM-010b "Accounts − as-of-today = future-dated entries"; category breakdown = dashboard expenses |
| Transactions list ↔ summary ↔ count | RUM-010b list rows = `total_count` = ledger, pending badge; fixture expectation pins the refunds divergence |
| Cache / rapid tab and month switching / no skeleton → blank | `perf:nav` (7 flows, lost-navigation detection, "ready" = no skeleton left) + `route-loading-coverage.test.ts` (RUM-007) |

The fixtures (`supabase/local/fixtures.sql`) are generated, deterministic and
contain no real data: 2 households, ~3.5k transactions over 3–4 years, 29
accounts, CAD/COP/USD/EUR, transfers (same and cross currency), opening
balances, voids, refunds, pending and future-dated rows, a card owing and a card
overpaid, archived and net-worth-excluded accounts, a debt, budgets, a goal, and
a controlled missing-FX case. `supabase/local/fixture-expectations.sql` fails if
an edit ever removes one of those cases.

---

## 4. Metrics

### 4.1 Navigation (browser)

`npm run perf:nav`, production build (`next start`) in the cloud dev container,
live Supabase, desktop 1366×900, 7 runs after 1 warm-up, test account with a
small dataset. **Ready** = destination URL and no skeleton left. Before = the
§3.1 video estimates (the only baseline that exists; RUM-001 never captured the
browser half).

| Flow | Before (video) | p50 | p75 | p95 | Target p75 | Lost |
|---|---:|---:|---:|---:|---:|---:|
| Dashboard full load (hard) | — | 820 ms | 835 ms | 841 ms | — | 0/7 |
| Dashboard → Transactions (cold) | 4.25 s | 667 ms | 770 ms | 868 ms | ≤ 1.5 s ✅ | 0/7 |
| Transactions → Dashboard | 3.25 s | 716 ms | 731 ms | 760 ms | ≤ 1.5 s ✅ | 0/7 |
| Dashboard → Transactions (2nd visit) | 3.00 s | 514 ms | 534 ms | 568 ms | ≤ 1.0 s ✅ | 0/7 |
| Dashboard → Accounts | 1.50 s | 394 ms | 428 ms | 435 ms | ≤ 1.2 s ✅ | 0/7 |
| Accounts → Transactions | 1.75 s | 500 ms | 565 ms | 629 ms | ≤ 1.5 s ✅ | 0/7 |
| Month change (Dashboard) — before B-7 fix | 0.25–0.50 s | 516 ms | 531 ms | 531 ms | ≤ 0.5 s ⚠️ | **5/7 ❌** |
| Month change (Dashboard) — after B-7 fix | 0.25–0.50 s | 696 ms | 725 ms | 759 ms | ≤ 0.5 s ⚠️ | 0/7 ✅ |

After the B-7 fix (2026-09-25 run, same setup; the other flows moved within
noise: p75 419–812 ms), the month click commits immediately and the secondary
section shows its skeleton while the new month streams; "ready" waits for that
section too, hence ~725 ms. The earlier 531 ms was measured only over the clicks
that happened to work. 225 ms over target is recorded, not hidden: the
secondary section's queries are the remaining cost.

Caveats, stated rather than hidden: the "before" is a video estimate on a
different device and a larger household, so the ratio is directional, not a
controlled A/B. The p75/p95 of 7 samples are nearest-rank values. The test
household is small; the database half at scale is §4.2.

### 4.2 Database (load, fixtures)

`npm run db:local -- --bench`: household A (≈2.7k transactions, 22 accounts, 4
years) as `authenticated` with RLS on, 25 runs after 1 warm-up, local Postgres
16. Deterministic dataset, so these are comparable release to release.

| RPC | p50 | p75 | p95 |
|---|---:|---:|---:|
| `get_monthly_dashboard_summary` | 0.8 ms | 0.9 ms | 2.3 ms |
| `get_monthly_expenses_by_category` | 0.7 ms | 1.5 ms | 2.4 ms |
| `get_monthly_budget_details` | 0.9 ms | 1.1 ms | 2.6 ms |
| `get_account_balances` | 4.6 ms | 4.7 ms | 5.6 ms |
| `get_account_balances_as_of_many` (13 dates) | 41.9 ms | 49.4 ms | 52.1 ms |
| `search_household_transactions` (month, 50) | 1.4 ms | 1.5 ms | 2.6 ms |
| `search_household_transactions` (all time, 50) | 5.2 ms | 5.4 ms | 7.2 ms |

The 13-date balance call (Net worth evolution) is the only one worth watching;
it grows with history × dates. Query counts per screen are unchanged from
RUM-005 (`npm run perf:census`, [execution status §3.2](./performance-ux-execution-status.md)).

### 4.3 Build

`npm run build`: compiled successfully (Next.js 16.2.6, Turbopack), all routes
dynamic. Unit suite: 135 tests in 14 files. Invariants: 112 checks locally, 46 on the live
household.

---

## Known issues

Found by this suite. Listed so the release decision is made with them in view,
not after.

### Fixed — Dashboard month navigation dropped clicks (B-7)

Clicking ‹ / › on the Dashboard often did nothing: the RSC request for
`/dashboard?month=…` was sent and completed, but the router never committed
it (no `history.pushState`, no console error). 5/7 lost in `perf:nav`.

Root cause, by bisection on production builds: the Dashboard's secondary
widgets stream into an already-revealed `<Suspense>` boundary. A month change is
a transition, so React keeps that boundary's old content on screen until the new
content arrives — and with a large streamed chunk that transition intermittently
never committed. A synthetic 400-row static block in the same boundary lost 6/6;
the same response buffered (not streamed) lost 0/6; delay alone, links,
prefetch, the localizer and the widgets' queries were each ruled out.

Fix: `key={selectedMonth}` on that boundary (`dashboard/page.tsx`). Each month is
a fresh boundary, so the click commits at once and the section shows its
skeleton while the month streams. 0/24 lost in the reproduction scripts, 0/7 in
`perf:nav`. The Dashboard is the only page with an inner streamed boundary.

### Decided — Transactions "Expenses" nets refunds (B-8)

The Transactions summary summed expense-type entries only, so a BR-040 refund
did not reduce it, while the Dashboard nets refunds. Decision (2026-09-25): the
list nets refunds too. Migration
`20260925120000_b8_transactions_totals_net_refunds.sql` (a function replacement,
no schema change; rollback = re-run the BR-045 definition). A fixture
expectation now asserts list (posted) = Dashboard expenses every month. The list
still includes pending rows and follows its own filters, by design. **Applied
to the live project 2026-09-25**; re-checked there (46/46, list = Dashboard for
12 of 12 months).

### By design, now reconciled — Accounts shows future-dated entries

Accounts uses the unbounded balance (booked future-dated entries included, as
the transaction form allows); Dashboard and Net worth snapshot "as of today".
They differ by exactly the future-dated entries — now asserted to the cent.
The RUM-006 check that claimed exact equality was wrong for any account with a
future-dated entry and has been scoped accordingly.

### Precision — COP rates keep ~4 significant digits

`exchange_rate_to_base` is `numeric(18,8)`; a COP→CAD rate (~0.0003) therefore
keeps ~4 significant digits. Stored base amounts are computed from the unrounded
rate, so `amount × stored rate` misses the stored base by up to 0.19 CAD per row
on the live household (0 rows beyond the rounding bound; net drift < 1 CAD).
Totals use the stored base amounts, so no figure is wrong today; re-deriving
history from the stored rate would be. A future migration could store the rate
with more scale or as CAD→COP.

### Housekeeping

QA accounts created by RUM-007…RUM-009 visual checks (`rum00X-qa-*@example.com`)
still exist in the production project.
