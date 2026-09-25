# Dashboard layout and first-load performance

## Status
**Implemented — 2026-09-25.**
No database schema changes required. No migrations; no RLS, ledger, FX or
calculation change. Every figure on the page comes from the same RPCs and the
same shared formulas as before (`computeValuation`, `healthBreakdown`).

---

## Context

After the RUM performance backlog closed, the user asked for three things:

1. A leaner Dashboard that reads like a product you would pay for, without
   the Recent activity card.
2. A Dashboard that loads faster.
3. The Transactions screen, which "defaults to 6 months" and showed a black
   screen the first time it opened.

This doc records what changed, why, and the measurements behind it. Amounts in
screenshots taken for this work are not reproduced here (privacy rule).

---

## Dashboard layout

Top to bottom, the same order on every breakpoint (the grid reflows):

| # | Section | Component | Notes |
|---|---|---|---|
| 1 | Title + month switcher | `ServerPageHeader`, `MonthNav` | The "HI, NAME" eyebrow and "Control center" title are gone. The title is the page name, matching the sidebar item. |
| 2 | Net worth hero | `src/components/financial-hero-card.tsx` | Unchanged on mobile. On desktop, **Projected** is hidden when it equals net worth: it only adds information when pending or future-dated entries move it. |
| 3 | Cash flow | `src/components/cash-flow-card.tsx` | **New.** Replaces the four KPI tiles and the Month health card. Details below. |
| 4 | Budget vs actual, By category, Scheduled activity | `src/app/dashboard/secondary-widgets.tsx` | Unchanged. |
| 5 | Insights, Debts, Goals (right rail on desktop) | same file | Unchanged. |
| 6 | Finish setting up | same file | Unchanged (only when budget or goals are not set up). |

**Removed:** Recent activity (the card, its 3 queries and
`src/components/recent-activity.tsx`). The Transactions tab is one tap away
and shows the same rows with search and filters. The card's one actionable
part, the month's "N to review" chip, moved into the cash-flow card.

### The cash-flow card

- **Income · Spent · Saved** in one row of three. Each has a compact change
  line such as `↓ 71% vs Aug`, colored by whether the move is good for that
  line (spending going up is bad). The old tiles' captions ("5 posted
  income transactions", "Income minus expenses", "Savings divided by
  income") repeated what the numbers say and are gone.
- **Spent-of-income bar**: green below 90 %, amber from 90 %, red over
  100 %. The caption reads "94 % of income spent · 6.0 % saved"; the savings
  rate is no longer a separate tile. With no income it reads "No income
  recorded this month yet".
- **Header**: "Cash flow" (the month is in the switcher directly above), the
  "N to review" chip (RUM-009: the month on screen, not all time) and
  "View trends".
- **Footer: Month health** as one line (grade badge, score, suggested
  action). `MonthHealthSummary` in `src/components/month-health-breakdown.tsx`
  keeps the full RUM-009 breakdown (inputs, points, weights, thresholds) one
  click away under **Details**. Month review still shows the breakdown
  expanded. Same numbers on both surfaces.

The loading skeletons (`src/app/dashboard/loading.tsx`,
`secondary-widgets-skeleton.tsx`) mirror this layout, so nothing jumps when
the page lands.

---

## Dashboard queries: 26 → 15 per render

Measured with `RUMBO_PERF=1 npm start` (production build) on the real
household, read-only:

| Cause | Before | After | Change |
|---|---:|---:|---|
| `auth.getUser` | 5 | 1 | `getRequestUser()` in `src/lib/supabase/request.ts`, memoized per request with React `cache()` |
| `profiles` | 4 | 1 | `getRequestProfile()`, same module |
| `get_account_balances_as_of_many` | 2 | 1 | One call covers this month, last month's end and the 6-month sparkline. Helpers in `src/lib/net-worth/trend.ts` |
| Recent activity (`transactions`, `transaction_entries`, `transaction_allocations`) | 3 | 0 | Card removed |
| Review count | 1 | 1 | Moved from the streamed section to the page, with the chip |
| **Total** | **26** | **15** | |

The request cache is shared by the dashboard layout, `getUiPreferences()`,
`getHouseholdContext()`, the Dashboard page, the Transactions page and
`getDashboardTrend()`. It lives for one server request only. Queries still run
under the user's own session, so RLS is unchanged, and nothing is shared
across users or requests.

**Timing.** Latency to Supabase drifted during the measurement (a trivial
query took 46–64 ms depending on the minute), so the builds were measured
interleaved: new, `main`, new, 12 cold loads each. At the same network
latency (52 ms per trivial query), `main` against the new build:

- server render: 524 → 442 ms p50;
- page ready in the browser: 927 → 628 ms p50.

The other run of the new build, at 64 ms per query, came in at 549 ms. What
remains is the chain of dependent round trips (user → profile → household →
data), each ~50 ms from the dev container.

**In the browser.** `perf:nav --think=500` on the real household, interleaved
the same way (new, `main`, new; 7 runs each; 0 lost navigations). p50 / p75
in ms; the new build has two numbers, one per run:

| Flow | `main` | New (run 1 / run 2) |
|---|---:|---:|
| Dashboard full load (hard) | 882 / 928 | 859 / 950 · 851 / 950 |
| Dashboard → Transactions (cold) | 724 / 788 | **644 / 661 · 623 / 646** |
| Month change (Dashboard) | 870 / 898 | **771 / 850 · 822 / 991** |
| Dashboard → Accounts | 635 / 744 | 646 / 699 · 687 / 711 |
| Revisits (Router Cache, RUM-005) | 77–80 | 71–88 |

The clearest gain is the first visit to Transactions (−11 to −16 %), which
now shares the layout's user and profile reads. Month changes are 6–11 %
faster at p50. The Dashboard's own hard load barely moves in the browser:
fewer queries shorten the server render, but the rest of that load (HTML,
JS, hydration) is unchanged. Accounts was not touched and stays within
noise.

---

## Transactions: the "black screen" and the 6-month default

**The default was never 6 months.** With no filters in the URL, Transactions
shows the current month (`parseTransactionPeriod`). The 6-month view came
from the **remembered scope**, the `af_tx_scope` cookie
(`src/lib/filters/transaction-scope-memory.ts`). Once "Last 6 months" was
picked, it was restored on every bare visit for 12 hours.

**The black screen was the restore itself.** `transactions/page.tsx`
restored the scope with a server `redirect()`. On a cold open (launching the
installed app) the page's `loading.tsx` shell had already streamed, so Next
could only redirect client-side:

1. about 1 s of its "This page couldn't load" screen on a black background;
2. then a second full document load.

Filmed on a production build.

**Fixes:**

| Change | Where |
|---|---|
| The page renders the remembered scope (or the landing preference, BR-038) directly. `SyncScopeUrl` then writes the explicit URL with `history.replaceState`, which the App Router picks up without a navigation. No redirect, no second document. | `src/app/dashboard/transactions/page.tsx`, `sync-scope-url.tsx` |
| The scope memory lasts **30 minutes** instead of 12 hours. That still covers "created a transaction and came back", but a morning's first open lands on the current month instead of last night's 6-month view. | `TRANSACTION_SCOPE_MAX_AGE` |

A cold open with a remembered 6-month scope went from 1062–1931 ms (with the
error flash) to 656–682 ms: skeleton, then content, one document. That is the
same as with no remembered scope.

---

## Verification

- `npm run lint`, `npx tsc --noEmit`, `npm run i18n:check`, `npm test`,
  `npm run build`: all pass.
- Screenshots on the real household (read-only): desktop light, mobile
  light and dark.
- `perf:nav` on the real household, interleaved with `main`: 0 lost
  navigations in any run.

## Manual checks

1. Open the app cold, with Transactions last left on "Last 6 months" less
   than 30 minutes ago. It should open on that view with no error screen,
   and the URL should show `?period=last-6-months`.
2. Do the same after 30 minutes: it should open on the current month.
3. On the Dashboard, the "N to review" chip should open the month's
   unreviewed transactions, and **Details** under Month health should show
   the breakdown.
