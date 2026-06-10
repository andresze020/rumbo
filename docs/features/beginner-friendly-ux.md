# Beginner-Friendly UX Improvements

## Status

**Implemented.** All 5 items below have been built on
`claude/repo-review-setup-p0u4jz`, one commit per item per the sequencing
section. This was the spec for 5 of the 6 ideas discussed for making App
Finanzas usable by someone without a finance background:

1. Progressive disclosure in forms (hide advanced/jargon fields by default)
2. Plain-language dashboard summary
3. Glossary / inline help icons for finance terms
4. Color/icon-first transaction list
5. Guided first-run setup checklist

(The 6th idea — leaning more on the AI assistant as the primary interface — is
out of scope for this doc and deferred.)

## Context

The app is functionally complete (all Alpha P0/P1/P3 bug-friction items fixed,
see `docs/alpha/sprint-12-alpha-plan.md`), but it was built with finance-literate
users in mind:

- Forms expose finance-jargon fields (FX exchange rate, `exchange_rate_to_base`,
  `include_in_net_worth`, interest rate/period, original principal, minimum
  payment) at the same level as essential fields (amount, date, category).
- The dashboard leads with 8 numeric metric cards (Net Worth, Assets,
  Liabilities, Projected, Income, Expenses, Savings, Savings Rate) with no
  plain-language framing.
- Terms like "Net Worth", "Reconciliation" (mentioned in BF-022),
  "Allocations", "Exchange rate to base" are not explained anywhere in the UI.
- The transaction list relies mostly on text/badges; category color is stored
  in the DB but unused outside the Categories page.
- After onboarding (household + base currency), the user lands on an empty
  dashboard with no guidance on what to do first.

None of these require schema changes. All are additive UI/UX changes on top
of existing data and server actions.

## Shared building blocks (new, reusable)

To avoid duplicating the same toggle/tooltip code across 6+ forms, add two
small primitives first:

- **`src/components/ui/collapsible.tsx`** — thin wrapper around
  `@base-ui/react/collapsible` (already a project dependency, same family as
  the existing `src/components/ui/dialog.tsx` which wraps
  `@base-ui/react/dialog`). Exposes `Collapsible`, `CollapsibleTrigger`,
  `CollapsiblePanel`.
- **`src/components/ui/tooltip.tsx`** — thin wrapper around
  `@base-ui/react/tooltip`. Exposes `Tooltip`, `TooltipTrigger`,
  `TooltipContent`.
- **`src/components/info-tooltip.tsx`** — small `<HelpCircle>` (lucide-react)
  icon button that shows a `Tooltip` with plain-language text. Props:
  `term: GlossaryTerm` (preferred, looks up `src/lib/glossary.ts`) or a raw
  `text` override for one-off explanations.
- **`src/lib/glossary.ts`** — `Record<string, string>` (or small typed map) of
  term → one-sentence plain-language explanation. Single source of truth so
  wording stays consistent (Net Worth, Savings Rate, Net cash flow,
  Reconciliation, Exchange rate, Opening balance, Allocations/Budget
  categories, Liability, Transfer).

These are used by items 1, 3, and partly 2/4 below.

---

## Item 1 — Progressive disclosure in forms

**Goal:** essential fields (amount, date, account, category, description) are
always visible; finance-specific fields are tucked under a collapsed
"Advanced" section, expanded automatically only when relevant (e.g.
multi-currency).

**Existing pattern to reuse:** `src/app/dashboard/transactions/transaction-filters.tsx`
already has a manual `useState`-based expand/collapse toggle with an
`aria-expanded` button and a `SlidersHorizontal` icon — same interaction
model, but reimplemented with the new `Collapsible` primitive for consistency
and built-in animation.

**Forms and fields to move into an "Advanced" `Collapsible`:**

| File | Advanced fields to collapse | Auto-expand when |
|---|---|---|
| `src/app/dashboard/transactions/transaction-form.tsx` | Exchange rate field, FX helper text, refresh button, conversion preview, `exchange_rate_to_base` | account currency ≠ household base currency |
| `src/app/dashboard/transactions/transaction-edit-form.tsx` | Same FX section | same |
| `src/app/dashboard/transactions/transfer-edit-form.tsx` | Exchange rate field + preview | from-account currency ≠ base currency |
| `src/app/dashboard/accounts/opening-balance-form.tsx` | Exchange rate field + preview | account currency ≠ base currency |
| `src/app/dashboard/debts/debt-create-form.tsx` | FX section (as above) **and** Original principal, Interest rate, Interest period, Minimum payment, Due day | FX: currency ≠ base. Interest/payment fields: always collapsed by default (all optional) |
| `src/app/dashboard/debts/debt-edit-form.tsx` | Original principal, Interest rate, Interest period, Minimum payment, Due day | always collapsed by default unless any already has a value |

**Rules:**

- Collapsed sections must not lose data on submit — fields keep their
  `name`/`value` in the DOM (Collapsible hides via CSS, not unmount), so no
  hidden-input duplication is needed (unlike the filters pattern, which
  unmounts and needs preserve-state hidden inputs).
- "Advanced" trigger label: `Advanced options` with a small chevron, plus a
  one-line summary when collapsed and a value differs from default (e.g.
  "Exchange rate: 1 CAD = 2,690 COP" when collapsed but set).
- Auto-expand logic runs once based on initial props (selected account
  currency vs base currency); user can still collapse it manually afterward.

---

## Item 2 — Plain-language dashboard summary

**Goal:** a short narrative banner above the metric-card grids in
`src/app/dashboard/page.tsx`, e.g.:

> "This month you've spent **$1,240** — $80 less than last month. You're on
> track with your budget (62% used)."

**Data already available in `page.tsx` (no new queries needed):**

- `monthlySummary` / `prevSummary` — `monthly_income`, `monthly_expenses`,
  `monthly_savings`, `savings_rate` (via `get_monthly_dashboard_summary`)
- `expensesDelta`, `savingsDelta` — already computed for the MoM delta chips
- `totalBudgetPlanned`, `totalBudgetSpent`, `totalBudgetPercent` — from
  `get_monthly_budget_details`
- `dashboardCurrency` — base currency for `formatCurrency`

**New component:** `src/components/dashboard-summary.tsx` — pure
presentational component, props are the values above (already computed),
returns 1–2 sentences:

1. Spending sentence: `formatCurrency(monthly_expenses)` this month, plus a
   plain-language delta ("X more/less than last month") only if previous
   month data exists (reuse the existing delta sign logic from
   `renderDelta`/`renderRateDelta`, but render as words, not a colored chip).
2. Budget sentence (only if a budget exists for the month):
   "You're on track with your budget" / "You're close to your budget limit"
   / "You've gone over budget" based on the same thresholds already used by
   `getLineStatus()` in `budget-line-row.tsx` (≥100% over, ≥80% near, else on
   track), reusing `totalBudgetPercent`.
3. If no budget exists for the month, omit sentence 2 (no "create a budget"
   nag here — that's already covered by the Budget vs Actual card).

**Placement:** directly under `PageHeader`, above the "Financial position"
card grid (before existing line ~560 in `page.tsx`). Reuse
`formatCurrency`/`formatPercent` from `src/lib/format.ts` (the dashboard
currently has local copies of these — fold the new component's formatting
into the shared `src/lib/format.ts` helpers rather than adding a third copy).

---

## Item 3 — Glossary / inline help icons

**Goal:** add `InfoTooltip` next to section headers/labels that use finance
jargon, without renaming the underlying labels (so existing docs/screenshots
stay valid).

**Glossary terms (`src/lib/glossary.ts`) and placements:**

| Term | Plain-language text (draft) | Placement |
|---|---|---|
| Net Worth | "What you own minus what you owe — accounts plus debts combined." | Dashboard "Net Worth" card title, Net Worth page `<h1>` |
| Projected Net Worth | "What your net worth would be if all pending transactions were completed." | Dashboard "Projected" card |
| Savings Rate | "The share of your income you kept instead of spending, this month." | Dashboard "Savings rate" card |
| Liabilities / Debts | "Money you owe — credit cards, loans, etc." | Dashboard "Total liabilities" card, Debts page header |
| Exchange rate | "How many units of this account's currency equal 1 unit of your household's main currency." | Next to the (now collapsed) exchange rate field label, replacing/augmenting the existing inline helper text |
| Opening balance | "The balance of this account on the day you started tracking it in App Finanzas." | Opening balance form header |
| Allocations / Budget categories | "How your spending is grouped for budgets and reports." | Categories page header, Budgets page header |
| Reconciliation | "Checking that the balance here matches your bank statement." | (placeholder — feature not built yet, BF-022; add only if a reconciliation UI affordance already exists, otherwise skip) |
| Transfer | "Moving money between your own accounts — doesn't count as income or spending." | Transaction form, Transfer type selector |

**Implementation:** `InfoTooltip` renders an inline `<HelpCircle className="size-3.5 text-muted-foreground" />` button (`aria-label` = the term name) that opens a `Tooltip` with the glossary text on hover/focus/tap. Keep text short (one sentence, no line breaks) so it fits a tooltip on mobile.

---

## Item 4 — Color/icon-first transaction list

**Goal:** make `src/app/dashboard/transactions/page.tsx` rows scannable by
color/icon rather than reading the type badge text.

**Current state:**

- Income amounts are already green (`text-emerald-600 dark:text-emerald-400`).
- Expense and transfer amounts have no color coding.
- `categories.icon` (emoji) is fetched and rendered before the category name.
- `categories.color` exists in the DB and is rendered as a small dot only on
  the Categories page (`category-row.tsx`), not in the transaction list.

**Changes:**

1. **Amount color coding** — extend the existing color logic:
   - Income → green (unchanged)
   - Expense → `text-red-600 dark:text-red-400`
   - Transfer → neutral (`text-foreground`, no color — transfers aren't
     gains/losses)
2. **Type icon** — replace/augment the text type badge with a small
   directional icon from `lucide-react`: `ArrowDownLeft` (income),
   `ArrowUpRight` (expense), `ArrowLeftRight` (transfer, already used in nav).
   Icon color matches the amount color above. Keep the existing badge text
   for accessibility/clarity but make the icon the primary visual cue.
3. **Category color** — fetch `categories.color` alongside the existing
   `icon` field in the transactions query (`page.tsx` ~line 332) and render
   it as a small left-edge accent bar or a colored dot before the category
   icon/name, mirroring `category-row.tsx`'s dot pattern for visual
   consistency between the two pages.

**Files:** `src/app/dashboard/transactions/page.tsx` (query + row rendering).
No new components required; the dot-rendering snippet can be copied from
`src/app/dashboard/categories/category-row.tsx`.

---

## Item 5 — Guided first-run setup checklist

**Goal:** after onboarding, show a dismissible "Getting started" checklist on
the dashboard that teaches the app's structure step by step:

1. Add your first account → links to `/dashboard/accounts?mode=create`
2. Record a transaction → links to opening the global Add Transaction dialog
   (reuse `GlobalAddTransactionButton` trigger pattern / `?mode=create` on
   transactions)
3. Set up a budget for this month → links to `/dashboard/budgets`

**Visibility logic (no schema change):**

- Compute three booleans in `src/app/dashboard/page.tsx` from data already
  queried or cheap to add: `hasAccounts` (accounts.length > 0), `hasTransactions`
  (any non-opening-balance transaction exists), `hasBudget` (budget lines for
  current month > 0, already computed for the Budget vs Actual card).
- Show the checklist only if **not all three** are true.
- Each completed step renders with a check icon; incomplete steps are
  clickable links into the relevant create flow.
- Dismissal: a "Hide this" control persisted in `localStorage`
  (`af_hide_getting_started`) — purely client-side, no DB column needed. If
  the user completes all three steps, hide automatically regardless of the
  localStorage flag.

**New component:** `src/components/getting-started-checklist.tsx` (client
component for the dismiss state via `localStorage`; receives the three
booleans as props from the server component `page.tsx`).

**Placement:** above the new plain-language summary (Item 2), so first-time
users see "what to do" before "here's your data" (which will be empty
anyway).

---

## Sequencing

Implement as separate commits on the working branch so each is independently
reviewable/revertable, in this order (each builds on the previous where
noted):

1. Shared primitives: `collapsible.tsx`, `tooltip.tsx`, `info-tooltip.tsx`,
   `glossary.ts` (no visible change yet)
2. Item 1 — progressive disclosure in forms (uses `collapsible.tsx`)
3. Item 3 — glossary tooltips (uses `info-tooltip.tsx` + `glossary.ts`,
   including on the now-collapsed FX fields from step 2)
4. Item 4 — color/icon-first transaction list (independent)
5. Item 2 — plain-language dashboard summary (independent)
6. Item 5 — guided first-run checklist (placed above item 2's summary)

## Verification plan

- `npm run lint` and `npm run build` after each commit.
- Manual checks (per `.claude/CLAUDE.md`):
  - Forms: create/edit a transaction, transfer, opening balance, and debt in
    both base-currency and non-base-currency accounts — confirm Advanced
    section auto-expands only for non-base currency, and FX values still
    submit correctly when collapsed/expanded.
  - Dashboard: verify summary sentence matches the metric cards for a month
    with and without a budget, and for the first month (no previous-month
    data).
  - Transactions list: confirm income/expense/transfer color + icons render
    correctly, category color dot matches the Categories page.
  - New household: confirm the getting-started checklist appears, links work,
    and it disappears once all 3 steps are done or dismissed.
- No database/migration impact — purely additive UI changes on existing data.
