# Pending Work

> Documentation only. Single index of everything still open across the
> project: feature slices not yet built, the remaining BR/BF backlog, the manual
> QA gates, and the Open Decisions scattered across individual feature docs. Each
> row is a pointer to its source of truth, not a duplicate — update the linked doc
> first, then update this index to match. Kept in sync by the
> `app-finanzas-state-sync` skill at sprint close.
>
> **Last refreshed 2026-08-18** against branch `claude/revision-pendientes-evcmmy`.
> This refresh closes **BR-042 slice 2** (month rows) and the part of **BR-031
> slice 2** that needed no schema change, and corrects a stale claim about the
> transfer edit form (§1 said it had "no FX plumbing at all" — it has had the
> full rate block, the received-amount field and the transfer-cost card since
> BR-031 shipped; what it lacked was the paired *layout*). All 58 migrations are
> applied (`npx supabase migration list --linked` reported 58/58 on 2026-08-12);
> the one item below that needs a 59th is called out explicitly.
>
> Everything shipped is recorded in `AGENTS.md` → Current status and
> [SPRINT-LOG.md](./SPRINT-LOG.md); this file only lists what is **not** done.

---

## 1. Next slices of features already shipped

These are all "slice 2" of something live in `main`. Each one was scoped out on
purpose, not forgotten.

| ID | Area | What is missing | Why it was deferred | Doc |
|---|---|---|---|---|
| BR-030 slice 2 | Accounts / credit cards | The **`Pay`** settlement action. The statement cycle itself is live: `accounts.statement_day` / `payment_day` / `billing_account_id` and `get_card_cycle_summaries` returning payable, outstanding, statement balance, paid-since-close and overdue state. | The backlog row prescribed the cycle as slice 1 and the settlement action separately; a payment is a real ledger write and deserves its own slice. | [features/card-statement-cycle.md](./features/card-statement-cycle.md) |
| BR-036 slice 2 | Periods / budgets | Budgets, month closures and the dashboard still use the **calendar** month, so their figures for the same month name differ from Reports under a custom `month_start_day`. The inconsistency is deliberate and stated on screen. | Slice 1 proved the resolver (`src/lib/periods/month.ts`) on the one screen that already worked from an explicit `date_from`/`date_to` pair, so **no RPC was touched**. Slice 2 has to move the monthly RPCs, which is the high-blast-radius part. | [features/month-start-day.md](./features/month-start-day.md) |
| BR-031 slice 2 · rate on edit | Multi-currency entry | **Correcting the exchange rate from the transaction edit form.** The base-currency preview shipped on 2026-08-18, but it can only ever show the rate already stored on the entry: `update_manual_transaction` has no `p_exchange_rate_to_base` parameter and re-uses `transaction_entries.exchange_rate_to_base` verbatim. So a wrong rate cannot be corrected without voiding, and moving a transaction to an account in a **different currency** silently keeps a rate that no longer applies. The form now warns on screen instead of pretending otherwise. | Needs a 59th migration (new RPC signature, dropping the old overload as `20260716120000` did). Wiring the client before that migration is applied would break every transaction edit, so it is a deliberate stop. | [alpha/benchmark-follow-up-issues.md](./alpha/benchmark-follow-up-issues.md) |

## 2. Accepted limitations (documented, not bugs)

These look like gaps but are decisions. Do not "fix" one without reopening the
decision first.

| Area | Limitation | Why |
|---|---|---|
| Recurring transfers (UC-9) | **Cross-currency recurring transfers cannot auto-post.** The form disables the toggle, the server action refuses it, and the job flags-and-skips. Such a template still posts by hand. | The amount that arrives is a real value only the user knows, and it moves with the rate. Guessing it would fabricate money. |
| Month closures (BR-021) | Close month is a **soft marker** (`month_closures` + snapshot, reopenable). It does not lock the ledger. | Product decision — a closed month must stay correctable during Alpha. |
| Transfer-as-expense (BR-039) | Reaches KPIs, trend, sub-period rows and calendar, but never the category breakdown. | The row is emitted from the inflow leg with no allocation, so balances, net worth and budgets stay untouched. Reports and Calendar both say so on screen. |
| Installments (BR-035) | The plan holds no money and there is no parent transaction. | That is what makes double-counting impossible by construction; no report or budget had to change. |

## 3. Not started

| ID | Priority | Area | One-line | Doc |
|---|---:|---|---|---|
| BF-022 | P3 | Transactions | Reconciliation flow — mark transactions "cleared" against a bank statement. Needs a schema migration (`reconciled_at`). Deferred to Beta v0.13. | [alpha/bug-friction-log.md](./alpha/bug-friction-log.md) |
| Tap payment capture | — | Capture / automation | Design only, **no code**. A tap cannot be detected by the PWA on any platform; detection has to come from the phone's automation layer posting to an ingest endpoint that stages captures in a `capture_inbox` and auto-posts only above a confidence threshold. | [features/tap-payment-capture.md](./features/tap-payment-capture.md) |

> **Tap capture is gated.** The Phase 0 device spike is a hard gate — no code
> until a real tap is proven to emit a machine-readable event on the user's own
> phone and card. The run book is ready to execute:
> [alpha/tap-capture-phase-0-spike.md](./alpha/tap-capture-phase-0-spike.md).

## 4. Manual QA gates (no code required)

The only remaining release gates. Everything here needs a real device, a real
authenticated session, or a sanitized fixture — none of it can be closed from the
codebase.

### 4.1 PR #37 residuals

Source of truth: [alpha/pr-37-authenticated-qa.md](./alpha/pr-37-authenticated-qa.md).

| Area | State | Exact remaining action |
|---|---|---|
| CSV categorization rules | Untested | Create one temporary test rule, apply a sanitized CSV fixture, confirm the rule hits in preview, then archive the rule. |
| CSV import history / revert | Partial | Upload a sanitized fixture and verify active rule application in preview before confirming. |
| Transfers | Partial | Submit same-currency and cross-currency fixtures, then reconcile both account balances. |
| Transfer costs | Partial | Verify the spread/fee estimate, same-currency fee, over-cost advisory and saved transaction detail by hand — the automated browser could not drive the account selector. |

### 4.2 Installed-PWA verification

| Area | State | Exact remaining action |
|---|---|---|
| Manifest `shortcuts` | Untested | Run the installed-app checklist in [features/pwa.md](./features/pwa.md#installed-app-verification). A normal browser tab is not sufficient evidence. |
| `share_target` | Untested | Share text + a URL from another installed app and confirm the expense quick-add prefills **without** auto-submitting. |

### 4.3 Tier-3 / Tier-4 real-data QA

No authenticated QA record exists yet for the features merged on 2026-08-12.
Their migrations are applied, so these are live against real data with no QA
pass behind them: installments (BR-035), refunds (BR-040), the card statement
cycle (BR-030), optional time-of-day (BR-045), recurring transfers (UC-9), notes
(BR-044), the calendar (BR-037), transfer-as-expense (BR-039), the budget
comparison/payment split (BR-043) and the custom month start day (BR-036).

Record results in a new `docs/alpha/` QA doc following the shape of
[alpha/pr-37-authenticated-qa.md](./alpha/pr-37-authenticated-qa.md).

## 5. Open decisions across feature docs

| Doc | Question |
|---|---|
| [features/goals.md](./features/goals.md) | Whether a goal linked to an account should derive its progress from that account's real ledger balance instead of the manually-tracked `current_amount`. |
| [features/month-start-day.md](./features/month-start-day.md) | What a stored `budgets.budget_month` / `month_closures` month **means** once a period no longer coincides with a calendar month. That is a data-model question, not arithmetic, and it deserves its own written decision the way BR-040 got one — it is the hard part of slice 2. |
| [features/beginner-friendly-ux.md](./features/beginner-friendly-ux.md) | Idea #6: the AI assistant as the primary interface rather than a supplementary drawer. Out of scope of that doc; revisit only if assistant usage data supports it. |

## 6. Deferred / parked (revisit only when triggered)

| ID | Area | Revisit when |
|---|---|---|
| BR-D01 | Attachments / receipts | Real usage proves receipt capture is needed, or OCR becomes a priority. A reference implementation is recorded in the mobile benchmark (3 photo slots on entry + thumbnail on detail); still deferred on purpose. |
| BR-D02 | Investment performance | Core household cash/debt/budget flows are stable. |
| BR-D03 | Bill split / reimbursements | Multi-member household usage creates real split/reimbursement needs. |
| BR-D04 | Advisor / external access | Household invite/member management is shipped and used. |
| BR-D05 | Advanced charts (Sankey, saved reports) | Users ask for deeper analysis than the BR-022 reports hub gives. |
| BR-D06 | OCR / bank sync / billing | Explicit product decision; kept out of Alpha correctness work. |

---

## What's already done (so this list doesn't get re-proposed)

The full BR backlog **BR-001 … BR-048 is closed** except for the three slice-2
items in §1 above. Nothing else from
[alpha/benchmark-follow-up-issues.md](./alpha/benchmark-follow-up-issues.md)
is open, and every BF except BF-022 is fixed.

Recently closed, and previously listed here as open:

- **BR-042 slice 2 + BR-031 slice 2, UI half (2026-08-18)** — `/dashboard/reports`
  now rolls a range longer than a month up into **month rows** (BR-036 household
  periods, clipped to the range, capped at 12); the transaction edit form shows
  the base-currency equivalent of a foreign-currency amount and warns when the
  account currency changes; the transfer edit form pairs each amount with its own
  account selector the way the create form does. No migration. What is still open
  from BR-031 is the RPC rate parameter, now its own row in §1.
- **Tier-4 (2026-07-30, merged 2026-08-12)** — BR-045 time-of-day, UC-9 recurring
  transfers, BR-030 statement cycle slice 1, BR-035 installments, BR-040 refunds,
  BR-036 month start day slice 1.
- **Tier-3 (2026-07-29, merged 2026-08-12)** — BR-031 multi-currency entry,
  BR-037 calendar, BR-039 transfer-as-expense, BR-043 budget comparison + payment
  split, BR-044 notes.
- **Mobile-capture parity (2026-07-28)** — BR-032, BR-033, BR-034, BR-038,
  BR-041, BR-042 (weeks), BR-046, BR-047, BR-048, plus multi-value transaction
  filters.
- **Earlier** — BR-007/008/010/014/023/024/025/028/029 (PR #37 and the Tier-1
  easy wins), BR-009 payees CRUD + bulk merge, BR-011 review queue and its
  polish, BR-015 confirm + Undo, BR-017 balance adjustment, BR-018 budget
  rollover, BR-021 health score + light Close month, BR-026/027, plus the
  navbar redesign, the settings page and recurring Sprints A and B.

See `AGENTS.md` → Current status for the shipped-feature summary and
[SPRINT-LOG.md](./SPRINT-LOG.md) for the per-sprint detail.
