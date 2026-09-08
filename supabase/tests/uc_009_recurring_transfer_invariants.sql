-- ============================================================
-- Rumbo — UC-9 recurring transfer invariants
-- ------------------------------------------------------------
-- Same style as `br_040_refund_invariants.sql`: replace `__HOUSEHOLD_ID__`
-- with a real household id and run via `npm run db:test`. Every row must
-- report `passed = true`. Read-only.
--
-- UC-9's accepted limitation is that a CROSS-CURRENCY recurring transfer
-- cannot auto-post. The amount that arrives is a real ledger value only the
-- user knows and it moves with the rate, so inventing one from a stale rate
-- would write a wrong balance silently. The refusal is held in three places —
-- the form disables the toggle, the server action refuses, and
-- `run_recurring_autopost()` flags-and-skips — none of which is a database
-- constraint. That is exactly why it is worth asserting against real data:
-- the guard is app-layer, so only the data can prove it held.
-- ============================================================

-- 1. THE row. Nothing the job auto-posted ever moved between two currencies.
--
--    Read from the posted transaction's own ENTRIES, not from the template's
--    accounts. A log row is a historical fact; the template it points at is
--    mutable. Joining the two would report a same-currency transfer that
--    posted correctly and was later edited to point at a foreign-currency
--    account as though a cross-currency transfer had auto-posted — a false
--    alarm on data that is fine. The entries carry the currency each leg
--    actually moved in and never change, so they answer the question that was
--    asked: what did the job write?
--
--    A transfer's legs are one currency each; two distinct currency codes on
--    one auto-posted transaction means the guard leaked and a fabricated
--    received amount is now in the ledger. Income and expense auto-posts have
--    a single entry, so they pass trivially and cost nothing to include.
--
--    Known blind spot, inherent to the log rather than to this check: the
--    log cascades away if its template is deleted, and `transaction_id` is
--    `on delete set null`. A leak whose template was deleted afterwards
--    leaves nothing to find. Snapshotting the two currency codes on the log
--    row at write time would close it — a migration, so not from here.
with params as (
  select '__HOUSEHOLD_ID__'::uuid as household_id
),
autoposted as (
  select distinct l.transaction_id
  from public.recurring_autopost_log l
  where l.household_id = (select household_id from params)
    and l.status = 'posted'
    and l.transaction_id is not null
),
leg_currencies as (
  select
    e.transaction_id,
    count(distinct e.currency_code) as distinct_currencies
  from public.transaction_entries e
  join autoposted a on a.transaction_id = e.transaction_id
  where e.household_id = (select household_id from params)
  group by e.transaction_id
)
select
  'UC-9 nothing auto-posted ever moved between two currencies' as check_name,
  not exists (
    select 1 from leg_currencies where distinct_currencies > 1
  ) as passed;

-- 2. No cross-currency transfer template is left with `auto_post` enabled.
--    The server action refuses to set it, but a template can also become
--    cross-currency after the fact — by pointing at a different account, or by
--    an account changing currency. If that ever happens the flag must not be
--    silently carried forward waiting for the job to skip it every night.
--
--    This one reads the template's CURRENT accounts on purpose, unlike check 1.
--    The question here is about the state of the world now — "is a template
--    armed to do something it must refuse?" — not about what already happened,
--    so mutable state is the correct source. Do not "fix" it into check 1's
--    entry-derived shape: a template that has never posted has no entries to
--    read, and that is exactly the case this needs to catch.
with params as (
  select '__HOUSEHOLD_ID__'::uuid as household_id
)
select
  'UC-9 no cross-currency transfer template has auto_post on' as check_name,
  not exists (
    select 1
    from public.recurring_transactions r
    join public.accounts a_from on a_from.id = r.account_id
    join public.accounts a_to on a_to.id = r.to_account_id
    where r.household_id = (select household_id from params)
      and r.transaction_type = 'transfer'
      and r.auto_post = true
      and a_from.currency_code <> a_to.currency_code
  ) as passed;

-- 3. A transfer template carries no reporting category. This mirrors the
--    ledger rule that a transfer has entries but no allocation, and it is a
--    CHECK constraint today — asserted here so a future migration relaxing
--    the constraint shows up as a failing invariant rather than as transfers
--    quietly appearing in the category breakdown.
with params as (
  select '__HOUSEHOLD_ID__'::uuid as household_id
)
select
  'UC-9 transfer templates carry no category' as check_name,
  not exists (
    select 1
    from public.recurring_transactions r
    where r.household_id = (select household_id from params)
      and r.transaction_type = 'transfer'
      and r.category_id is not null
  ) as passed;

-- 4. What the job actually wrote is a transfer, not an expense in disguise.
--    Every transaction the autopost log links to a transfer template must have
--    at least two entries that net to zero in base currency, and no
--    allocation. Same shape `create_transfer_transaction` produces by hand.
with params as (
  select '__HOUSEHOLD_ID__'::uuid as household_id
),
autoposted as (
  select distinct l.transaction_id
  from public.recurring_autopost_log l
  join public.recurring_transactions r
    on r.id = l.recurring_id
    and r.household_id = l.household_id
  where l.household_id = (select household_id from params)
    and l.status = 'posted'
    and l.transaction_id is not null
    and r.transaction_type = 'transfer'
),
shape as (
  select
    t.id,
    (select count(*) from public.transaction_entries e where e.transaction_id = t.id) as entries,
    (select coalesce(sum(e.amount_base_currency), 0)
       from public.transaction_entries e where e.transaction_id = t.id) as net_base,
    (select count(*) from public.transaction_allocations a where a.transaction_id = t.id) as allocations
  from public.transactions t
  join autoposted x on x.transaction_id = t.id
  where t.status = 'posted'
    and t.deleted_at is null
)
select
  'UC-9 auto-posted transfers balance to zero and hold no allocation' as check_name,
  not exists (
    select 1
    from shape
    where entries < 2
       or allocations <> 0
       or abs(net_base) > 0.01
  ) as passed;

-- 5. A failed autopost left nothing behind. The job flags-and-skips rather
--    than half-writing, so a `failed` row must not carry a transaction id: if
--    it does, something posted and then reported failure, and the ledger has a
--    row nobody is accounting for.
with params as (
  select '__HOUSEHOLD_ID__'::uuid as household_id
)
select
  'UC-9 a failed autopost wrote no transaction' as check_name,
  not exists (
    select 1
    from public.recurring_autopost_log l
    where l.household_id = (select household_id from params)
      and l.status = 'failed'
      and l.transaction_id is not null
  ) as passed;
