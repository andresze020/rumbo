# Mobile Money-Manager Benchmark

> Product review of two mature **mobile** expense trackers, run to harvest
> interaction patterns and features worth adopting in App Finanzas.
> **Audit-only — no application behavior was changed.**
>
> Reviewed 2026-07-27 (App A), updated 2026-07-28 with a screen recording of
> App B. Complements
> [benchmark-review-monarch-ynab-copilot.md](./benchmark-review-monarch-ynab-copilot.md),
> which benchmarks the *web/product* competitors. This doc covers the
> *mobile data-entry* competitors, where both apps are genuinely ahead of us.
>
> **This doc is the record of two screen-recording reviews.** It is written to
> be self-sufficient: every observed screen is captured below with its video
> timestamp, so neither source video needs to be re-watched. If a question
> arises that this doc cannot answer, see §9 — that is the list of things the
> recordings never showed.

---

## 1. Executive summary

Two apps were reviewed:

| | **App A** | **App B** |
|---|---|---|
| Name | Money manager & expenses | Money Manager Expense & Budget |
| Vendor | Orange dog d.o.o. | Realbyte Inc. |
| IDs | `ru.innim.my_finance` · iOS `1510997753` | `com.realbyteapps.moneymanagerfree` · iOS `560481810` |
| Version reviewed | 1.12.2 (Android build `4239_gp`) | 4.12.3 (Android; both a `GF` and an `AD` build-tag suffix were seen on-screen — likely free/ad-supported channel variants of the same version, not two different versions) |
| Rating | 4.9 ★ / 7.5K | 4.8 ★ / 18.7K |
| Site | `financewalletapp.com` (landing only) | `realbyteapps.com` + Zendesk help centre |

**Headline finding: neither app threatens App Finanzas on scope.** Neither has
net worth, debt payoff, goals, rules, review workflow or household
multi-user. App B has budgets; App A has none. What both do far better than us
is **the transaction-capture loop and per-user configurability of it.**

Consequently, almost everything worth taking is **UX/interaction**, with
genuine *feature* exceptions: credit-card statement cycles (App B, now
confirmed live), installments (App B), the bidirectional dual-currency amount
input (App A), and — new in the 2026-07-28 App B recording — sub-period
rollup rows, a standalone dated Notes feature, and a budget-vs-last-month
comparison.

### Adoption shortlist (detail in §7, backlog IDs in `alpha/benchmark-follow-up-issues.md`)

| Rank | Candidate | BR |
|---:|---|---|
| 1 | Credit-card statement cycle: statement/payment day, payable vs outstanding, Pay action — **confirmed live in App B's own UI** | BR-030 |
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
| 13 | Sub-period rollup rows (weeks inside a month, months inside a year) | BR-042 |
| 14 | Budget vs-last-month comparison + cash/card expense split + inline export | BR-043 |
| 15 | Standalone dated Notes, separate from transaction comments | BR-044 |
| 16 | Optional time-of-day on transactions | BR-045 |
| 17 | Confirmation warning when changing an account's currency | BR-046 |
| 18 | Promote a subcategory to a top-level category | BR-047 |

---

## 2. Sources and method

Neither app has a web version, so neither could be navigated directly.
Evidence was gathered as follows:

| Source | What it gave | Confidence |
|---|---|---|
| **Screen recording of App A** (9 min 24 s, Android, 1080×2340, no narration) | The full observed flow. Sampled every 2 s → 282 frames → global perceptual-hash dedup → **68 unique screens**, all reviewed. | **High** — direct observation |
| **Screen recording of App B** (20 min 51 s, Android, 1080×2340, no narration, recorded 2026-07-28) | The full observed flow: account creation (incl. a live credit-card statement-cycle setup), income/expense/transfer entry, categories/subcategories, budgets, the Notes tab, Search, and the entire Configuration screen. Same pipeline: sampled every 2 s → 626 frames → global perceptual-hash dedup (threshold 34/144 bits) → **86 unique screens**, all reviewed. | **High** — direct observation |
| App B Zendesk help centre (`help.realbyteapps.com`) | 107 articles. The public Zendesk API is readable even though the HTML returns 403. Documents flows step by step; now cross-validated against the recording (§4.1). | High — mechanics confirmed live where the recording overlaps |
| App B App Store screenshots (8) + store description | Screen layouts and feature list. | Medium — marketing assets, undated; superseded by the recording where they overlap |
| App A App Store screenshots (4) | **Stale (2020, iPhone 8 frames).** Superseded by the recording. | Low — do not cite |

> **Correction on record:** an earlier reading of App A based only on its 2020
> store screenshots concluded it was a thin single-balance tracker with no
> tags, attachments or per-account currency. The recording disproves that —
> App A has all three. Any pre-2026-07-27 note describing App A as minimal is
> wrong; this doc supersedes it.

App B's screen inventory (§4) blends two sources: mechanics documented by the
help centre, and screens directly confirmed by the 2026-07-28 recording. Each
claim below is marked accordingly — `[m:ss]` timestamps mean **confirmed
live**; a bare help-centre citation means **documentation-derived, UI still
unverified** (its mechanics were not exercised in the recording).

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

## 4. App B — feature inventory (recording-confirmed + documentation-derived)

Timestamps `[m:ss]` are into the 2026-07-28, 20 min 51 s recording and mean
**confirmed live**. Citations without a timestamp are help-centre article
titles — **documentation-derived, UI unverified**.

### 4.1 Credit-card statement cycle — *the single most valuable idea in either app, now confirmed live*
Help-centre mechanics ("How to settle credit card payments") match the
recording exactly. Adding a `Card`-group account shows **Settlement Date**
and **Payment Date** fields (default `Every 1`) `[0:34–0:56]`, and — before
you even save — a live preview box:

> Balance Payable `06-01 ~ 06-30 (Pay: 07-01)`
> Outst. Balance `07-01 ~ 07-31 (Pay: 08-01)` `[1:02]`

i.e. the app computes and shows both cycle windows from the settlement/payment
days *during account creation*, before any transaction exists. Once
transactions exist, the card's own **Monthly** tab lists one row per
statement period — `Deposit / Withdrawal / Total / Balance` — each showing its
date range (`7.23 ~ 8.22`, etc.) and a swipe-revealed **`Pay`** button on the
open period `[6:42]`. The **Annually** tab plots the same figures per year
`[6:52]`. On the Accounts list, every card account renders two columns instead
of one balance: **`Balance Payable`** and **`Outst. Balance`** `[7:30, 8:22]`.

This is a stronger confirmation than the help-centre article alone gave: the
cycle preview appearing *inline during account setup* (not just after the
fact on the Accounts tab) is a UX detail worth copying directly.

### 4.2 New in this recording — not in the help centre

These were not part of the original documentation-derived inventory and are
each verified absent from App Finanzas (§5.2 has the exact grep evidence).

- **Sub-period rollup rows.** The `Total` tab's `Monthly` view doesn't just
  show one number per month — tapping into a month lists **one row per week**
  inside it (`07.26 ~ 08.01`, `07.19 ~ 07.25`, …), each with its own
  income/expenses/total, before the per-year `Monthly` view rolls the same
  pattern up a level `[9:58, 10:02]`. Neither `/dashboard/trends` nor
  `/dashboard/reports` groups transactions by a sub-period like this.
- **Budget vs-last-month comparison, on the budget screen itself.** The
  `Total` tab's `Budget` widget shows a **Total Budget** bar and a per-category
  bar, each with a percentage-used badge (`200%` when over) `[9:58]`, directly
  below an **Accounts** panel: `Compared Expenses (Last month) 100%`,
  `Expenses (Cash, Accounts)`, `Expenses (Card, Pay)`, `Transfer` — and an
  inline **`Export data to Excel`** button on that same screen `[9:58]`. Our
  BR-018 budget rollover has no month-over-month comparison metric.
- **A standalone, dated Notes feature — distinct from the transaction
  Comment field.** A top-level `Note` entry point (reached from the period
  header's star/note icons) opens a **per-day scratch note** with its own
  title and a 10-colour tag palette (`[0:56–1:02, 8:56]`), browsable like a
  small calendar-journal. This is not a transaction attachment — it exists
  independent of whether any transaction happened that day.
- **Optional time-of-day on transactions.** Every entry in this app carries a
  clock time (`09:27`, not just a date), and `Configuration → Time Input` lets
  the user set `Input Only, Desc.` (whether time is captured, and whether the
  transaction list sorts by it) `[15:56, 16:08]`. App Finanzas' `transactions`
  table has `transaction_date date not null` — no time component at all.
- **Explicit warning when changing an account's currency.** Editing an
  existing account's currency pops: *"Changing the currency will affect the
  entry made before. The recent exchange rate of changed-currency will apply
  to the exchange rate in a lump. Are you sure you want to change the currency
  for this account?"* `[8:20]`. We resolve historical FX more correctly
  already (BR-002/BR-003 store a rate per ledger entry), but we do not warn
  the user at all today if they change an account's currency after the fact.
- **Promote a subcategory back to a top-level category.** `Modify
  Subcategory → → Main Category` walks into a **"Select the main category to
  move"** picker with a confirm dialog (*"This subcategory will be changed to
  main category. Do you wish to continue?"*) `[4:14–4:52]`. Our categories
  support `parent_category_id`, but there is no UI action to re-parent an
  existing category or promote a subcategory to top-level.
- **Notification-bar quick-add widget** (Android-only, `Configuration →
  Quick add`, off by default) shows a system-notification-shade shortcut row
  with search/bookmark/add icons `[16:44]`. Platform-specific; our PWA
  manifest `shortcuts`/`share_target` (BR-028) already cover the equivalent
  web-app-install surface, so this is not a new backlog item — noted for
  completeness only.
- **A wider companion-app ecosystem** than App A: `Settings → More` also
  offers **CalcBox** (a separate paid calculator app upsell), **PC Manager**
  (LAN-browser editing, previously documented), and **Backup** (manual
  export/restore) `[0:22]`. Monetisation/platform surface, not adopted (§6).

### 4.3 Other documented, not-yet-recorded features
| Feature | Article | Note |
|---|---|---|
| **Installments** | "How to set up a repeat schedule & installment" | Distinct from a repeat: fixed count, each entry labelled *n of N*. Not exercised in the recording. |
| **Transfer-as-Expense** | "How to set up savings/investment/insurance/loan as an expense" | Per-account opt-in: transfers *into* savings/investment/insurance/loan count as expense in reports. Not allowed for cash/bank/card/debit. |
| **Rebates / shared bills** | "How to track rebates and cashflows" | Record the reimbursement as a **negative amount in the same category** so the category nets out, instead of booking fake income. |
| **Bookmarks** | "How to make a bookmark" | Favourite a transaction; re-record it in one tap with the date auto-advanced to today. Reorderable, swipe-to-delete. Not exercised in the recording — the recording shows `Copy` on a transaction detail instead `[20:20, 20:40]`, which is the same idea App A's `COPY` action covers (§3.4); prefer that over adding a bookmark entity (see BR-034). |
| **Autocomplete** | "How to set up autocomplete" | Suggests previously used note text while typing. Confirmed present as a `Configuration → Autocomplete: ON` toggle `[16:04]`, though the suggestion UI itself was not exercised. |
| **Exclude from totals** | "How to exclude balance of certain accounts from totals" | Confirmed as `Include in totals` toggle on Account Info `[17:12]` — same as our `include_in_net_worth`. |
| **Sub-categories** | "How to enable sub-category" | Confirmed live: `Configuration → Subcategory: ON` `[15:12]`; category picker groups by main category with per-category counts `[4:52]`. |
| **Flags** | "How to flags entries" | Mark an entry for later attention. Not exercised in the recording. |
| **Loans & overdrafts** | "How to add loans & overdrafts" | Negative amount = liability; long-term repayment via repeat schedule. Not exercised — the recording's only debt-like account was a credit card. |
| **Calendar view** | "Home tab" | Month grid with income/expense/net per day and colour dots per category. A `Calendar` tab exists in the period bar `[6:10, 7:12]` but was not opened in the recording. |
| **Passcode** | "How to use passcode" | Confirmed as `Configuration → Other → Passcode: OFF` `[16:08]`; the setup flow itself was not exercised. |
| **Excel import** | "How to import bulk data by Excel file" | Fixed column order incl. a sub-currency variant. Not exercised; **export** to Excel was confirmed live on the Budget screen (§4.2) and separately as `Export data to Excel` on Total Stats. |
| **Sub-currencies** | "How to add sub-currencies" | ⚠️ Confirmed live: `Configuration → Sub Currency Setting` shows the identical manual-rate mechanic as App A — `COL$ 1.00 = $0.0004417`, editable rate, unit position (front/back), decimal-point count `[15:56]`. **Rates are updated manually by the user** — worse than our live FX. Supports user-defined units (gold, BTC per the help centre; not exercised live). |
| Widgets | v4.12.x "Information on Updates" screen, confirmed live `[0:04–0:16]` | Quick-Add, Income/Expense, and Balance Payable home-screen widgets, plus per-widget theme/transparency. Native-only; see §4.2 quick-add note. |

Double-entry bookkeeping is applied throughout — confirmed live: transfers
generate a **`Fees`** line item as its own transaction row (`Other / Fees /
$25.00`) alongside the transfer itself `[10:34–11:14]`, and manually editing an
account balance posts a **`Modified Bal.`** transaction row with a `Difference`
amount `[2:14, 8:56]` — the same "reconciliation is a visible entry" pattern
App A uses for balance adjustments (§3.6, §8.3). We already have the
underlying mechanism (`create_balance_adjustment`, BR-017) but never surface it
as a first-class row in the transaction list (tracked under BR-038's "hide
balance adjustments" toggle — this recording confirms the *opposite* default,
visible-by-default, is what both benchmark apps ship).

---

## 5. Cross-check against App Finanzas

Verified against the codebase on 2026-07-27 (App A section) and 2026-07-28
(App B recording additions), branch `main`.

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
| Transfer fee (same-currency explicit fee, cross-currency cost) | `transaction-form.tsx` / `transfer-edit-form.tsx` — same idea as App B's separate `Fees` field (§4.3), already shipped as BR-007 |
| "Save and Add Next" | `transaction-form.tsx`, `actions.ts`, `transaction-dialog-provider.tsx` — same idea as App B's `Save` / `Continue` pair `[11:58]` |
| Balance-adjustment ledger entry | `create_balance_adjustment` RPC (BR-017) — mechanism already shipped; App B/App A both confirm the *visible-in-list* default we don't yet match (see BR-038) |

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
| Sub-period rollup rows (weeks in a month, months in a year) | no grouping like this in `/dashboard/trends`, `/dashboard/reports`, or the transactions list |
| Budget vs-last-month comparison | `budgets/actions.ts` only has `copy_budget_from_previous_month` (one-time setup copy); no live comparison metric or cash/card expense split |
| Standalone dated Notes (separate from transaction Comment) | no such feature; existing `notes`/`note` hits in the codebase are all form-field labels, not a distinct feature |
| Time-of-day on transactions | `supabase/migrations/20260601000300_transactions_ledger.sql`: `transaction_date date not null` — date only, no time column |
| Confirmation warning on account currency change | no such warning found in `accounts` edit forms |
| Promote a subcategory to a top-level category | `categories/actions.ts` sets `parent_category_id` at creation/edit; no action clears it to re-parent an existing category to top-level |

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
| Full-screen banner ads on nearly every list/settings screen, including mid-form on Accounts and Add Account `[0:24, 0:44, 6:42]` | App B | Heavier ad load than App A even; not our monetisation model. |
| A companion-app upsell ecosystem (CalcBox, PC Manager, Backup) surfaced inside core Settings `[0:22]` | App B | Product-surface bloat; out of scope for a focused household finance app. |
| Manual sub-currency exchange rates, identical mechanic to App A `[15:56]` | App B | Confirmed live — same regression risk as App A's version; we already fetch live rates. |

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

Added from the 2026-07-28 App B recording:

- **BR-042 Sub-period rollup rows** — the cheapest of this batch: reuse
  existing monthly summary data, group it by week (or month, one level up),
  and add a drill-in row. No new financial primitive.
- **BR-043 Budget vs-last-month comparison** — extends BR-018 (already
  shipped) with a comparison metric and a cash/card expense split; natural
  follow-on to the existing rollover work, not a new subsystem.
- **BR-044 Standalone dated Notes** — the one genuinely new *entity* in this
  batch: a calendar-scoped scratch note independent of any transaction.
  Smallest reasonable slice: title + colour tag + date, no attachments.
- **BR-045 Optional time-of-day on transactions** — a schema change
  (`transaction_date` → also capture time) with real same-day-ordering value,
  but touches every transaction-reading query; scope the first slice to
  capture + display only, defer sort-order configurability.
- **BR-046 Currency-change confirmation warning** — cheapest possible safety
  UX: a confirm dialog, no logic change. We already handle the underlying FX
  correctness better than either app; this is purely about telling the user
  what changing an account's currency does.
- **BR-047 Promote a subcategory to a top-level category** — small
  category-management gap; bundle with any future category-editing work
  rather than shipping alone.

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
5. **Both apps independently show reconciliation as a normal transaction row.**
   App A's `Balance adjustment` and App B's `Modified Bal.` (§4.3) are the same
   idea: don't hide the fact that a balance was corrected — show it as an
   entry, with a setting to hide it if the user wants. We already generate
   these (BR-017) but never surface them; this recording is a second,
   independent confirmation that visible-by-default is the norm, not ours.
6. **Sub-currencies with manual rates keep showing up.** Both apps ship the
   identical mechanic (fixed rate, manual edit, unit position, decimal count)
   for currencies beyond the account's main one. Neither treats it as a
   selling point — it reads as a fallback for currencies their live-rate
   provider doesn't cover. Not a reason to build it; our live FX is strictly
   better for anything it does cover.

---

## 9. Not observed — do **not** assume either way

Re-record or re-research before relying on anything here:

- **App A**: Categories management screen in depth (reorder, archive,
  sub-categories?); Settings → *Appearance*, *Data and storage* (backup/restore),
  *Extra*, *PIN* setup; the paid/ad-removal paywall; onboarding/first-run;
  search results UI; what the `Charts` money-icon button does; whether
  budgets exist anywhere (**believed no** — absent from the drawer).
- **App B** (help-centre-only items the 2026-07-28 recording did not exercise):
  Bookmarks in actual use (only `Copy` was observed, §4.3); Flags; adding a
  Loan/Overdraft account and its repayment flow; the Calendar tab's actual
  grid (the tab exists and was seen closed, not opened); Passcode *setup*
  (only the off-state toggle was seen); Excel *import* (export was confirmed,
  import was not); the notification-bar quick-add widget's actual behaviour
  once turned on; Style/theme picker and Widget Settings screens; installment
  purchase creation end-to-end; the Repeat picker's full frequency list beyond
  what appeared in one dropdown (`[3:42]` showed Nothing/Every Day/Weekdays/
  Weekend/Every Week/2 weeks/4 weeks/Every Month/end-of-month/2–6 Month/
  Annually — the list itself is confirmed, but no repeat template's full
  lifecycle was walked).
- **Both**: error states, offline behaviour, accessibility, performance with
  large datasets, onboarding/first-run.
