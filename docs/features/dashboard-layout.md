# Dashboard layout and first-load performance

## Status
**Implemented — 2026-09-25. Premium pass — 2026-09-26.**
No database schema changes required. No migrations; no RLS, ledger, FX or
calculation change. Every figure on the page comes from the same RPCs and the
same shared formulas as before (`computeValuation`, `healthBreakdown`). The
one new read (daily spending, 2026-09-26) is checked against the monthly
summary RPC on every render; see [Spending pace](#spending-pace).

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
| 2 | Net worth hero | `src/components/financial-hero-card.tsx` | One layout on every breakpoint (the blue phone-only card is gone). Net worth with its cents set back, the change since last month's end as an amount (the % only when it rounds to something), Assets / Liabilities, and an interactive 6-month chart. **Projected** only when it differs from net worth. |
| 3 | Spending pace + Cash flow | `src/components/dashboard/spending-pace-card.tsx`, `src/components/cash-flow-card.tsx` | Side by side on desktop (7 : 5), stacked on a phone. Without a pace chart (a future month, or a total that doesn't reconcile) the cash-flow card takes the whole row. |
| 4 | Budget vs actual, By category, Scheduled activity | `src/app/dashboard/secondary-widgets.tsx` | Restyled 2026-09-26, same data. Details below. |
| 5 | Insights, Debts, Goals (right rail on desktop) | same file, `src/components/insight-card.tsx` | Restyled 2026-09-26, same data. |
| 6 | Finish setting up | same file | Only when budget or goals are not set up. |

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

## Premium pass (2026-09-26)

The user asked for a Dashboard that "doesn't look vibecoded". What read as
generated, and what replaced it:

| Before | After |
|---|---|
| Every card a different accent: tinted green/amber boxes for insights, red and green calendar icons, a six-color donut, colored big numbers for assets and liabilities | Color only where it means something: status (budget bars, health ring, review dot), direction (the change pills, money coming in), and one brand hue for data. Totals are in normal ink. |
| `→` text arrows after every link, bold headings, uppercase `AUTO` tags | One widget header (`WidgetHeader`): semibold title, a quiet figure, a muted "View all ›" with a chevron. "Auto" is a small repeat icon plus the word. |
| A 200 × 28 px sparkline with no axis or values | A real chart: monotone curve, gradient area, month ticks, a crosshair with a tooltip on hover or drag, arrow-key stepping when focused. |
| Same weight for dollars and cents | `Money` sets the cents back (smaller, muted), so the figure reads at a glance. |
| Rainbow donut for spending by category | Ranked bars in one hue (lengths compare; arcs don't), with each category's share of the month. "Other" in gray. |
| Budget bars colored per category | Budget bars colored by status: brand color on track, amber from 90 %, rose when over. |
| Scheduled activity as colored icons | A calendar date tile (weekday + day) per run; expenses in normal ink with a minus sign, income in green with a plus. |
| Month health as a letter in a circle | A ring gauge filled to the score, colored by band (green 70+, amber 50–69, rose below), with the letter grade next to it as text. |

### Spending pace

New card: this month's spending as a running total by day, against last
month's (dashed), with the gap at the same day as the headline: "$X less
than by this day in August". For a past month it compares whole months.
It answers "am I spending faster than last month?" while the month is still
open, which the monthly totals cannot.

- **Data.** `getDailyExpenses` (`src/lib/dashboard/daily-expenses.ts`)
  reads expense allocations for last month and this one in one query
  (paged by 1 000 rows). It applies the same filters as
  `get_monthly_dashboard_summary`: posted, not deleted, category not deleted
  and not excluded from reports, and not under an excluded live parent.
  `buildSpendingPace` (`src/lib/dashboard/spending-pace.ts`, unit-tested)
  turns the days into the two running totals.
- **Reconciled on every render.** The page shows the card only when the
  running total's last point equals the "Spent" figure from the RPC (to the
  cent). Otherwise it logs `[dashboard] spending pace total differs` on the
  server and leaves the card out, so the screen never shows two different
  numbers for the same thing. Checked on the real household for the 12
  months from Oct 2025 to Sep 2026: all 12 reconcile.
- **Open month.** The line stops at today, or at a later day that already has
  a posted expense, so it always ends on "Spent". The axis is the month on
  screen; last month's days past its length drop off (Aug 31 against
  September).
- **If the filters in the RPC change**, change `getDailyExpenses` with them.
  A drift shows up as the card disappearing plus the server warning, not as
  a wrong number.

### The chart component

`src/components/dashboard/line-chart.tsx` is plain SVG in a client
component. There is no chart library: Recharts is in `package.json` but
unused, and a library would have to be loaded for one line.

- It measures its own box with `ResizeObserver` and draws in real pixels, so
  strokes are never stretched. It takes a fixed height, or fills a flex
  column when the height is omitted, which is how the pace chart matches the
  cash-flow card's height.
- The line draws itself in and the area fades up (`rumbo-draw` and
  `rumbo-fade` in `globals.css`, behind `motion-safe:`). Reduced motion gets
  the finished chart.
- The tooltip sits inside the plot, beside the crosshair, and flips past the
  middle. Placed above the chart, the hero card's clipped corners cut it off.
- Accessibility: the plot is focusable with an `aria-label` that says what
  it shows and that the arrow keys read it; each series has a legend. Colors
  are theme tokens (`--primary`, `--muted-foreground`), so dark mode uses its
  own values.

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

The premium pass adds one read, the daily expense allocations for the
spending-pace chart, bringing the total to **16**. It runs in the same
`Promise.all` as the other top-of-page reads, so it adds no round trip to the
chain. It returns about one row per expense for two months.

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
  light and dark. 2026-09-26: desktop light and dark, mobile light and dark,
  plus the chart tooltips, on the real household and the QA household.
- Spending pace reconciles with "Spent" in all 12 months checked. A future
  month shows no pace chart and a full-width cash-flow card.
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
4. Hover or drag across both charts: the tooltip follows, and stays inside
   the card at both ends. Tab to a chart and use ← / →.
5. Record an expense for today: after the save, the Spending card's figure,
   the end of its line and "Spent" in Cash flow all move by the same amount.
6. Open next month: there is no Spending card and Cash flow spans the row.
