# Recurring Transactions

## Status
**Pending — not yet implemented.**
Schema table `recurring_transactions` already exists in production.

---

## Context

Users have predictable, repeating financial events: rent, subscriptions, salaries, loan payments. Today they must enter these manually every period. A recurring transactions module lets them define a template once and either post it with one click or have it post automatically.

---

## Existing Schema

```sql
create table public.recurring_transactions (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null references households(id) on delete cascade,
  name            text not null,
  transaction_type text not null,   -- income | expense | transfer | debt_payment | adjustment | investment
  account_id      uuid references accounts(id),
  category_id     uuid references categories(id),
  amount          numeric(18,4) not null,
  currency_code   varchar(3) not null references currencies(code),
  frequency       text not null,    -- daily | weekly | biweekly | semimonthly | monthly | quarterly | yearly
  start_date      date not null,
  end_date        date,             -- null = no end
  next_run_date   date,
  auto_post       boolean not null default false,
  is_active       boolean not null default true,
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
```

**Constraints already in DB:**
- `transaction_type` ∈ `{income, expense, transfer, debt_payment, adjustment, investment}`
- `frequency` ∈ `{daily, weekly, biweekly, semimonthly, monthly, quarterly, yearly}`

**Gap:** schema has a single `account_id`. Recurring transfers need `from_account_id` / `to_account_id` — a migration is required if transfers are in scope.

---

## Use Cases

### UC-1 — Create a recurring template
**Actor:** Household member (admin)
**Trigger:** User wants to automate a predictable expense or income.
**Flow:**
1. User opens `/dashboard/recurring` → clicks "New recurring transaction".
2. Fills in: name, type (income/expense), account, category, amount, currency, frequency, start date, optional end date.
3. Chooses posting mode: Manual or Auto-post.
4. Saves → template appears in the list with `next_run_date` computed from `start_date + frequency`.

**Validation:**
- Name required, max 120 chars.
- Amount > 0.
- Category must match transaction type (income cat for income, expense cat for expense).
- Start date required; end date must be after start date if provided.
- Currency must be active in the household.

---

### UC-2 — View upcoming and overdue recurring transactions
**Actor:** Any household member
**Trigger:** User opens `/dashboard/recurring`.
**Flow:**
1. Page shows two sections:
   - **Due / Overdue** — `next_run_date ≤ today`, sorted by date ascending.
   - **Upcoming** — `next_run_date > today`, sorted by date ascending.
2. Each row shows: name, type badge, account, category, amount, frequency, next due date.
3. Inactive templates shown in a collapsed "Inactive" section.

---

### UC-3 — Manually post a recurring transaction
**Actor:** Any household member
**Trigger:** A recurring template is due (manual posting mode).
**Flow:**
1. User clicks "Post" on a due recurring transaction.
2. System opens a confirmation dialog pre-filled with the template values (date defaults to today).
3. User can adjust: date, amount, exchange rate (if multi-currency), notes.
4. Confirms → system calls `create_manual_transaction` RPC.
5. `next_run_date` is updated to `next_run_date + frequency`.
6. If `end_date` is set and new `next_run_date > end_date`, template is auto-deactivated.

**Exchange rate:** if template currency ≠ household base currency, user must provide the rate at posting time (not stored in template — rates change).

---

### UC-4 — Auto-post recurring transactions (cron)
**Actor:** System (scheduled job)
**Trigger:** Daily cron job runs at a configured time (e.g. 06:00 UTC).
**Flow:**
1. Cron queries all `recurring_transactions` where `auto_post = true AND is_active = true AND next_run_date ≤ today`.
2. For each: calls `create_manual_transaction` RPC with a system exchange rate (last known rate or 1:1 for same-currency).
3. Updates `next_run_date`.
4. Auto-deactivates if past `end_date`.
5. On failure: marks the record with an error flag and notifies (email or in-app).

**Cron options:**
- Supabase `pg_cron` extension (runs inside the DB, no infra needed).
- Vercel Cron Jobs (calls a Next.js API route on schedule).

**Dependency:** requires a stored exchange rate or a rate source for multi-currency auto-posting. This is the main blocker for multi-currency households.

---

### UC-5 — Edit a recurring template
**Actor:** Admin
**Trigger:** Amount, account, or frequency changes.
**Flow:**
1. User clicks Edit on any template.
2. Same form as creation, all fields editable.
3. Save → updates template. `next_run_date` is recalculated if `start_date` or `frequency` changed.

**Note:** editing does NOT retroactively change already-posted transactions.

---

### UC-6 — Deactivate / reactivate a template
**Actor:** Admin
**Trigger:** Subscription cancelled, job ended, etc.
**Flow:**
1. User toggles the active switch on a template.
2. Inactive templates are excluded from the Due/Upcoming view and from cron processing.
3. Can be reactivated later; `next_run_date` is recomputed from today + frequency on reactivation.

---

### UC-7 — Delete a recurring template
**Actor:** Admin
**Trigger:** Template is no longer needed and should not clutter the inactive list.
**Flow:**
1. User clicks Delete → confirmation dialog.
2. Hard delete from `recurring_transactions`.
3. Does NOT delete already-posted transactions.

---

### UC-8 — Dashboard "Due soon" widget (optional)
**Actor:** Any household member
**Trigger:** User lands on `/dashboard`.
**Flow:**
1. A small section shows recurring transactions due in the next 7 days.
2. Each item shows: name, amount, due date.
3. "View all" links to `/dashboard/recurring`.

---

### UC-9 — Recurring transfers (future, requires schema migration)
**Actor:** Admin
**Trigger:** User wants to automate a regular transfer (e.g. savings sweep).
**Gap:** Current schema has single `account_id`. Requires adding `to_account_id` column and updating constraints.
**Flow:** Same as UC-1 but with From account + To account instead of single account + category.

---

## Open Decisions

| # | Question | Options | Recommendation |
|---|----------|---------|----------------|
| 1 | Posting mode default | Manual / Auto | Start with manual only; add auto in a follow-up sprint |
| 2 | Transfer support | In scope / Out of scope | Out of scope for Sprint 1; requires schema migration |
| 3 | Exchange rate at auto-post | Fixed in template / Last known rate / API | Last known rate from `transaction_entries`; block if none found |
| 4 | Dashboard widget | Yes / No | Yes — lightweight, high value |
| 5 | Failure notifications for auto-post | Email / In-app / None | In-app Callout on next login |
| 6 | `next_run_date` on reactivation | From last scheduled date / From today | From today (avoids posting a backlog of missed entries) |
| 7 | Cron infrastructure | pg_cron / Vercel Cron | pg_cron (no extra infra, runs in DB, already available in Supabase) |

---

## Proposed Sprint Breakdown

### Sprint A — Manual posting MVP
**Scope:** UC-1, UC-2, UC-3, UC-5, UC-6, UC-7
- `/dashboard/recurring` list page
- Create / Edit form (income + expense only)
- Manual "Post" button with confirmation dialog
- Activate / Deactivate / Delete
- Sidebar link with `Repeat` icon
- No auto-posting, no transfers, no dashboard widget

**DB changes:** none — table already exists. RLS policies already exist.

### Sprint B — Auto-posting
**Scope:** UC-4
- `auto_post` toggle on template form
- pg_cron job or Vercel Cron route
- Error flag column + in-app notification on failure
- Multi-currency exchange rate strategy decision required first

### Sprint C — Dashboard widget + Transfers
**Scope:** UC-8, UC-9
- "Due soon" section on Dashboard
- Schema migration: add `to_account_id` to `recurring_transactions`
- Recurring transfer form

---

## Files to Create (Sprint A)

```
src/app/dashboard/recurring/
  page.tsx                        — server component, list view
  loading.tsx                     — skeleton
  actions.ts                      — server actions (CRUD + post)
  recurring-form.tsx              — create/edit form (client)
  post-confirmation-dialog.tsx    — confirm before posting (client)
```

**Files to modify:**
- `src/components/app-sidebar.tsx` — add Recurring link (Repeat icon)
- `src/components/mobile-nav.tsx` — same
- `src/app/dashboard/page.tsx` — add "Due soon" widget (Sprint C)

---

## Next Run Date Calculation

```ts
function computeNextRunDate(from: Date, frequency: string): Date {
  const d = new Date(from)
  switch (frequency) {
    case 'daily':       d.setDate(d.getDate() + 1);      break
    case 'weekly':      d.setDate(d.getDate() + 7);      break
    case 'biweekly':    d.setDate(d.getDate() + 14);     break
    case 'semimonthly': /* 1st→15th or 15th→last */      break
    case 'monthly':     d.setMonth(d.getMonth() + 1);    break
    case 'quarterly':   d.setMonth(d.getMonth() + 3);    break
    case 'yearly':      d.setFullYear(d.getFullYear() + 1); break
  }
  return d
}
```

`semimonthly` (twice/month) needs special logic: 1st→15th, 15th→1st of next month.
