# Mobile Money-Manager Benchmark

> Product review of two mature **mobile** expense trackers, run to harvest
> interaction patterns and features worth adopting in App Finanzas.
> **Audit-only — no application behavior was changed.**
>
> Reviewed 2026-07-27. Complements
> [benchmark-review-monarch-ynab-copilot.md](./benchmark-review-monarch-ynab-copilot.md),
> which benchmarks the *web/product* competitors. This doc covers the
> *mobile data-entry* competitors, where both apps are genuinely ahead of us.
>
> **This doc is the record of a screen-recording review.** It is written to be
> self-sufficient: every observed screen is captured below with its video
> timestamp, so the source video does **not** need to be re-watched. If a
> question arises that this doc cannot answer, see §9 — that is the list of
> things the recording never showed.

---

## 1. Executive summary

Two apps were reviewed:

| | **App A** | **App B** |
|---|---|---|
| Name | Money manager & expenses | Money Manager Expense & Budget |
| Vendor | Orange dog d.o.o. | Realbyte Inc. |
| IDs | `ru.innim.my_finance` · iOS `1510997753` | `com.realbyteapps.moneymanagerfree` · iOS `560481810` |
| Version reviewed | 1.12.2 (Android build `4239_gp`) | 2.14.1 (2026-07-09) |
| Rating | 4.9 ★ / 7.5K | 4.8 ★ / 18.7K |
| Site | `financewalletapp.com` (landing only) | `realbyteapps.com` + Zendesk help centre |

**Headline finding: neither app threatens App Finanzas on scope.** Neither has
net worth, debt payoff, goals, rules, review workflow or household
multi-user. App B has budgets; App A has none. What both do far better than us
is **the transaction-capture loop and per-user configurability of it.**

Consequently, almost everything worth taking is **UX/interaction**, with three
genuine *feature* exceptions: credit-card statement cycles (App B),
installments (App B), and the bidirectional dual-currency amount input (App A).

### Adoption shortlist (detail in §7, backlog IDs in `alpha/benchmark-follow-up-issues.md`)

| Rank | Candidate | BR |
|---:|---|---|
| 1 | Credit-card statement cycle: statement/payment day, payable vs outstanding, Pay action | BR-030 |
| 2 | Bidirectional dual-currency amount input with rate re-fetch | BR-031 |
| 3 | User-configurable transaction-form fields | BR-032 |
| 4 | Quick relative-date chips (today / yesterday / 2 days ago) | BR-033 |
| 5 | Duplicate ("Copy") an existing transaction | BR-034 |
| 6 | Installment purchases (N-of-M) | BR-035 |
| 7 | Configurable month start day (payday period) | BR-036 |
| 8 | Calendar month view of transactions | BR-037 |
| 9 | Display preferences: default landing scope/period, compact list, hide balance adjustments | BR-038 |
| 10 | "Transfer as expense" per-account toggle | BR-039 |
| 11 | Refund / rebate as negative amount in the same category | BR-040 |
| 12 | `.xlsx` export alongside CSV | BR-041 |

---

## 2. Sources and method

Neither app has a web version, so neither could be navigated directly.
Evidence was gathered as follows:

| Source | What it gave | Confidence |
|---|---|---|
| **Screen recording of App A** (9 min 24 s, Android, 1080×2340, no narration) | The full observed flow. Sampled every 2 s → 282 frames → global perceptual-hash dedup → **68 unique screens**, all reviewed. | **High** — direct observation |
| App B Zendesk help centre (`help.realbyteapps.com`) | 107 articles. The public Zendesk API is readable even though the HTML returns 403. Documents flows step by step. | High for *mechanics*, unknown for current UI |
| App B App Store screenshots (8) + store description | Screen layouts and feature list. | Medium — marketing assets, undated |
| App A App Store screenshots (4) | **Stale (2020, iPhone 8 frames).** Superseded by the recording. | Low — do not cite |

> **Correction on record:** an earlier reading of App A based only on its 2020
> store screenshots concluded it was a thin single-balance tracker with no
> tags, attachments or per-account currency. The recording disproves that —
> App A has all three. Any pre-2026-07-27 note describing App A as minimal is
> wrong; this doc supersedes it.

App B was **not** recorded. Its section below is documentation-derived and
should be treated as "mechanics known, UI unverified".

---

## 3. App A — screen inventory (from the recording)

Timestamps are `m:ss` into the recording, for traceability only.

### 3.1 Navigation
Left drawer `[0:02]`: **Home · Accounts · Charts · Categories · Regular
Payments · Reminders · Settings · Share with friends · Rate the app · Contact
the support team.** Plus a "Sign up" header block (account sync is optional —
the app is usable fully anonymous).

No budgets, no net worth, no debts, no goals anywhere in the app.

### 3.2 Home / Transactions `[0:00, 3:14]`
- Title row: **account-scope dropdown `Total ▾`**, search icon, export icon.
- `EXPENSES` / `INCOME` segmented tabs.
- Period bar: **Day · Week · Month · Year · Period**, with `‹ ›` arrows and the
  active range as a tappable label (`Jul 26 – Aug 1`).
- Donut chart with the period total in the centre.
- Category rows below: colour dot, name, **share %**, amount, expand chevron.
- Sort control **`By date ▾`**.
- Transaction rows show: category icon, category name, **account name**, amount
  — and when the account currency differs from the display currency, **both
  amounts** (`$750` and `COL$1,712,328.77`) `[3:14]`. Tag chips and the comment
  render as extra lines under the row.
- Empty state `[5:20]`: illustration + "There were no transactions in the
  selected period".
- Yellow FAB `+`.

**Account scope selector** `[3:18]`: radio list — `Total $7,950.90`, then each
account with its own balance in its own currency. Selecting one re-scopes the
entire screen, not just a filter chip.

### 3.3 Add transaction `[2:18 – 3:00]` — the strongest screen in either app
Top-to-bottom:
1. **Amount + currency + calculator icon.** When the chosen account's currency
   differs from the display currency, **two amount fields appear stacked**
   (`750 CAD` / `1 712 328.77 COP`) with a **re-sync icon** to re-apply the
   rate `[5:46]`. Either field can be typed into; the other follows.
2. Account row.
3. **Category grid** — 4×2 tiles (icon + label) plus a `More` tile. No dropdown.
4. **Relative date chips**: `7/27 today` · `7/26 yesterday` · `7/25 two days
   ago`, plus a calendar icon for anything else.
5. **Tags**: existing chips, `+ Add tag`, and a search icon that expands into
   **"Search and create tags"** — new tags are created without leaving the form
   `[2:30]`.
6. **Comment** with a `0/4096` counter.
7. **Photo**: three empty slots; tapping offers *Take photo* / *Add from
   gallery* `[2:48]`.
8. `Add` button.

A built-in **calculator** screen is available from the amount field `[1:52]`.

### 3.4 Transaction detail `[5:42]`
Both amounts, Account, Category, Date, Tags, Photo thumbnail, then **`COPY`**
and **`DELETE`** actions, and an audit line: *"Created today at 09:48"*.

`COPY` duplicates the transaction into a new draft — a cheap substitute for
App B's bookmark/template concept.

### 3.5 Accounts `[0:22 – 0:50]`
- Header: `Total`, then two quick actions — **Transfer history** and
  **New transfer**.
- Rows: coloured icon, name, balance **in the account's own currency**
  (`COL$8.29M` shown natively, not converted).
- **Add account** `[0:24–0:42]`: opening amount + currency, name, a large
  **icon grid including crypto/fintech marks** (BTC, ETH, USDT, TRX, LTC, ZEC,
  PayPal, piggy-bank, safe…), colour swatches with a `+` for custom, currency
  selector, a **"Do not include in total balance"** toggle, and a note field.
- **Currency picker** `[0:42–0:50]`: searchable, ~150 fiat currencies **plus
  crypto** (BTC, BNB, BUSD…).

### 3.6 Transfers `[1:04 – 2:04]`
- Own period bar and list. Notably, **`Initial balance` and `Balance
  adjustment` rows appear in this list as first-class entries** — the app
  surfaces reconciliation events rather than hiding them.
- **Create transfer**: from-account, to-account (radio sheet showing each
  account's balance), amount with the same **dual-currency + re-sync** widget,
  date, comment.

### 3.7 Period and filter pickers
- **Select Month** `[1:08]`: year stepper + 12-month grid, future months
  disabled.
- **Select Period** `[1:14]`: **two months rendered at once**, range selected by
  tapping start and end, plus an **`All time`** checkbox.
- **Select accounts** `[1:30]`: checkbox list with an `All` master row.

### 3.8 Regular Payments / Reminders `[6:14 – 7:38]`
**Create Reminder** fields: `EXPENSES`/`INCOME`, Payment Name, **Reminder
frequency** (Monthly…), **`Add automatically` toggle** — i.e. *remind me* vs
*post it for me*, the same distinction as our auto-post — Reminder start date,
**Time**, **Reminder end date** (with a `Don't set` checkbox `[6:34]`), Account,
Category, Amount, Tags, Comment.

Validation is inline and red, under the field: *"You must select a category"*,
*"Required field"* `[6:54, 7:24]`.

**Payment details** `[7:38]`: name with an enable/disable toggle, Periodicity,
Add automatically, **Next** occurrence datetime, End date, Account, Category,
Amount, Tags. The upcoming list is sorted `By date ▾`.

### 3.9 Settings `[7:42 – 8:24]`
Top level: **PIN · Personalization · Appearance · Advanced customization ·
Data and storage · Extra · Restore purchases**.

**Personalization** `[7:46]`:
- Home screen → **`Display by default: Total`** (which account scope to open on)
- **`Default period: Week`**
- **`Additional fields`** dialog — checkboxes `All / Tags / Comment / Photo`,
  with the explanatory line *"Only selected extra information fields will be
  displayed when creating expense and income transactions."*

**Advanced customization** `[8:02]`:
- First day of the week
- Decimal separator
- **`Don't round`** toggle
- **`Display of balance adjustments`** toggle
- **`Compact view of operations list`** toggle
- **`Focus on Income`** toggle (flips the app's expense-first bias)

**Default-currency change** `[8:24]` shows an honest warning: *"The currency
symbol for all transactions will be changed from CAD ($) to CVE (Esc). However,
transaction amounts will not be converted based on the exchange rate."*

### 3.10 Categories, tags, export, charts
- **Add Category** `[4:14]`: tile grid + a `Create` tile. Income defaults are
  Paycheck / Gift / Interest / Other.
- **Select Color** `[4:40]`: a large paged palette (4 pages, ~54 swatches).
- **Add Tag** `[5:12]`: single-field dialog, `0/20` counter.
- **Export** `[4:00]`: generates `2026_07_27_22_39_57_035550.xlsx` and hands it
  to the OS share sheet.
- **Charts** `[8:38, 8:44]`: `GENERAL / EXPENSES / INCOME` tabs; `by year /
  month / week / day`; bar chart with an income / expenses / **profit** /
  **loss** legend; category list with % and amount underneath.

---

## 4. App B — feature inventory (documentation-derived)

Not recorded. Mechanics below come from the help centre; article titles are
quoted so they can be re-found.

### 4.1 Credit-card statement cycle — *the single most valuable idea in either app*
"How to settle credit card payments". A credit-card account carries
**Billing Account**, **Settlement Date** (statement close) and **Payment Date**.
From those the app derives two separate numbers, shown side by side on the
Accounts tab:

- **Balance Payable** — the closed cycle's total, due on the next payment date.
- **Outstanding Balance** — spend accumulated in the *currently open* cycle.

Overdue amounts render greyed. Settlement happens either **manually**
(Accounts → card → `Pay`) or **automatically** on the payment date, debiting the
billing account. Default cycle is 1st → last day of month.

### 4.2 Other documented features
| Feature | Article | Note |
|---|---|---|
| **Installments** | "How to set up a repeat schedule & installment" | Distinct from a repeat: fixed count, each entry labelled *n of N*. |
| **Budget carry-over** | "How to turn on carry-over feature" | Unspent/unpaid rolls to next month. Trans-tab only. |
| **Custom month/week start** | "How to customize monthly & weekly period" | Month can start on payday, not the 1st. |
| **Transfer-as-Expense** | "How to set up savings/investment/insurance/loan as an expense" | Per-account opt-in: transfers *into* savings/investment/insurance/loan count as expense in reports. Not allowed for cash/bank/card/debit. |
| **Rebates / shared bills** | "How to track rebates and cashflows" | Record the reimbursement as a **negative amount in the same category** so the category nets out, instead of booking fake income. |
| **Bookmarks** | "How to make a bookmark" | Favourite a transaction; re-record it in one tap with the date auto-advanced to today. Reorderable, swipe-to-delete. |
| **Autocomplete** | "How to set up autocomplete" | Suggests previously used note text while typing. |
| **Exclude from totals** | "How to exclude balance of certain accounts from totals" | Accounts-tab only; the account still appears in Trans/Stats. |
| **Sub-categories** | "How to enable sub-category" | Two levels, promotable/demotable. |
| **Flags** | "How to flags entries" | Mark an entry for later attention. |
| **Loans & overdrafts** | "How to add loans & overdrafts" | Negative amount = liability; long-term repayment via repeat schedule. |
| **Calendar view** | "Home tab" | Month grid with income/expense/net per day and colour dots per category. |
| **Passcode** | "How to use passcode" | Configurable idle delay before re-prompting. |
| **Excel import** | "How to import bulk data by Excel file" | Fixed column order incl. a sub-currency variant. |
| **Sub-currencies** | "How to add sub-currencies" | ⚠️ **Rates are updated manually by the user** — worse than our live FX. Supports user-defined units (gold, BTC). |
| Widgets | v2.14.1 release notes | Quick entry, Income/Expense, Balance Payable. |

Double-entry bookkeeping is applied throughout, which is why its Accounts tab
can show `Account / Liabilities / Total` as three separate sums.

---

## 5. Cross-check against App Finanzas

Verified against the codebase on 2026-07-27, branch
`feat/closure-tier1-small-improvements`.

### 5.1 Already shipped — do not re-propose
| Observed pattern | Where we already have it |
|---|---|
| Calculator in the amount field | `src/components/amount-input.tsx` (`withCalculator`, on by default) |
| Inline tag creation from the form | `src/components/tag-multi-select.tsx` → `quickCreateTag` |
| Recurring "post it for me" toggle | `recurring_transactions` auto-post + `run_recurring_autopost()` |
| Sub-categories | `categories.parent_category_id` |
| Exclude an account from totals | `accounts.include_in_net_worth` |
| Budget carry-over | BR-018, `get_budget_line_carryovers` |
| Tags, payees, CSV import + presets, rules, review workflow | BR-023 / BR-009 / BR-024 / BR-010 / BR-011 |
| "All time" range | `/dashboard/transactions`, `/dashboard/reports` |
| Live FX rates | `src/lib/fx.ts`, `exchange_rates` (BR-002) — **better than either app** |

### 5.2 Absent — candidates
| Observed | Verified absent |
|---|---|
| Credit-card statement/payment cycle | `accounts` has no `statement_day` / `payment_day` / `billing_account_id` |
| Bidirectional dual-currency amount entry | `amount-input.tsx` is single-field |
| User-configurable form fields | `advanced-fields.tsx` is a fixed collapsible, not a stored preference |
| Relative date chips | not present in `transaction-form.tsx` |
| Duplicate transaction | no copy/duplicate action on transactions |
| Installments | no concept |
| Configurable month start day | monthly RPCs assume calendar months |
| Calendar month view | no such route |
| Landing scope / default period preference | not in user settings |
| Compact list density toggle | not present |
| Hide balance adjustments | `create_balance_adjustment` exists (BR-017); no visibility toggle |
| Transfer-as-expense per account | not present |
| `.xlsx` export | export is CSV only |
| Photo/receipt attachment | only in the AI assistant, not persisted on transactions |

---

## 6. Explicitly **not** adopting

| Anti-pattern | Where | Why not |
|---|---|---|
| Full-screen interstitial ads 8 s after launch; a "PLEASE FORGIVE US" cat dialog | App A `[0:08, 0:16]` | Not our monetisation model. |
| Manual FX rate maintenance | App B sub-currencies | We already fetch live rates; this would be a regression. |
| Mixing currencies in one total without conversion | App A 2020 screenshots (`Total: 1 030 $` over `$`/`¥`/`£` rows) | Mathematically meaningless. Our base-currency policy is correct. |
| Scope dropdown embedded in the page title (`Total ▾`) | App A `[3:18]` | Conflates data scope with navigation; ambiguous whether you filtered or navigated. |
| Bar charts with no value axis; 4-colour legend over 3 bars | App A Charts `[8:38]` | Our `/dashboard/trends` and `/dashboard/reports` are already better. |
| 9-slice pie with leader-line labels | App B store screenshot 3 | Illegible; our donut + ranked list is better. |
| Green-on-dark-green low contrast; inactive tab nearly invisible | App A throughout | Fails contrast; we have an accessibility standard. |
| Blue = income / red = expense | App B | Regional convention; conflicts with our colour-blind-aware `BalanceAmount`. |
| PC-manager-over-Wi-Fi, iTunes/email backup | App B | We are already a web app. |

---

## 7. Adoption candidates → backlog

Full issue rows (priority, first slice, DB impact, verification) live in
[alpha/benchmark-follow-up-issues.md](./alpha/benchmark-follow-up-issues.md)
as **BR-030 … BR-041**. Summary of intent:

- **BR-030 Credit-card cycle** — the one real functional gap. Turns "how much do
  I owe" into a derived, trustworthy number. DB migration required.
- **BR-031 Dual-currency amount entry** — directly serves the COP/CAD household
  this product exists for. We have the FX foundation; this is UI plus a
  re-fetch action.
- **BR-032 Configurable form fields** — both apps converged on this
  independently (App A ships it; App B's v1.12.1 release notes announce it).
  Strong signal.
- **BR-033 Relative date chips** — smallest change with the best
  effort-to-friction ratio in this document.
- **BR-034 Duplicate transaction** — App B's bookmarks solve the same problem
  with a new entity; `COPY` solves ~80 % of it with a button. Prefer `COPY`.
- **BR-035 Installments** — relevant to COP/LATAM card usage (*meses sin
  intereses*); needs its own schema, not a reuse of recurring.
- **BR-036 Month start day** — cross-cutting: touches every monthly RPC, budgets
  and reports. High value, high blast radius. Plan deliberately.
- **BR-037 Calendar view** — the one visualisation neither `/trends` nor
  `/reports` replaces: per-day spending rhythm.
- **BR-038 Display preferences** — landing scope, default period, compact list,
  hide balance adjustments. Bundle as one settings slice.
- **BR-039 Transfer-as-expense** — settles the "is saving an expense?" question
  with a per-account opt-in instead of a doctrine.
- **BR-040 Negative-amount refunds** — a *modelling decision* first: confirm
  whether our allocation model tolerates negative allocations before any UI.
- **BR-041 `.xlsx` export** — small, and what non-technical users actually open.

**Attachments/receipts** are deliberately **not** given a new ID. They remain
**BR-D01 (deferred)**; App A's implementation (3 photo slots, camera or gallery,
thumbnail on the detail view) is recorded here as reference for whenever
BR-D01 is triggered.

---

## 8. Signals worth remembering

1. **Both apps invest far more in the entry form than in reporting.** App A's
   add-transaction screen has more design effort in it than its entire Charts
   section. Their retention comes from capture speed, not analysis.
2. **Configurability replaces opinionation.** Rather than deciding whether users
   want tags or photos, App A ships a checkbox. Rather than deciding whether
   saving is an expense, App B ships a per-account toggle.
3. **Reconciliation events are shown, not hidden.** App A lists
   `Initial balance` and `Balance adjustment` as visible entries — with a
   setting to hide them. We already create these (BR-017) but never surface them.
4. **Neither app has our scope.** No net worth, no debt payoff, no goals, no
   rules, no household. Our differentiation is intact; the gap is friction.

---

## 9. Not observed — do **not** assume either way

The recording did not cover these, and the help centre does not settle them for
App A. Re-record or re-research before relying on anything here:

- **App A**: Categories management screen in depth (reorder, archive,
  sub-categories?); Settings → *Appearance*, *Data and storage* (backup/restore),
  *Extra*, *PIN* setup; the paid/ad-removal paywall; onboarding/first-run;
  search results UI; what the `Charts` money-icon button does; whether
  budgets exist anywhere (**believed no** — absent from the drawer).
- **App B**: everything. No recording exists. Its current UI is unverified —
  only its mechanics are documented. A recording was planned but not yet taken.
- **Both**: error states, offline behaviour, accessibility, performance with
  large datasets.
