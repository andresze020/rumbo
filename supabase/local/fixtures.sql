-- ============================================================
-- Rumbo — generated regression fixtures (RUM-010b)
--
-- LOCAL ONLY. Loaded by scripts/db-local.mjs into a throwaway Postgres that
-- has supabase-shim.sql + every migration applied. Never run this against a
-- real Supabase project: it creates users and thousands of rows.
--
-- Contains no real financial data. Every amount comes from a seeded PRNG
-- (setseed) so the dataset is identical run to run, and every id that tests
-- reference is fixed below.
--
-- Every financial write goes through the same path the app uses — the RPCs
-- (create_manual_transaction, create_transfer_transaction, void_transaction,
-- create_refund_transaction, create_opening_balance, create_debt_with_account,
-- create_monthly_budget, upsert_budget_line) or a plain insert the app itself
-- does — executed as `authenticated` with the acting user's JWT claims, so
-- RLS and every RPC guard apply exactly as in production.
--
-- Shape (backlog §RUM-010b "Dataset de prueba recomendado"):
--   Household A "Fixture Family"  base CAD, 2 members, ~22 accounts, 4 years
--   Household B "Fixture Solo"    base COP, 1 member,   7 accounts, 3 years
--   Outsider user with no household (RLS: must see nothing).
--   CAD + COP (+ USD with rates, + EUR with NO rates: controlled missing FX)
--   Transfers (same- and cross-currency), opening balances, voids, refunds,
--   pending rows, credit cards owing and overpaid, archived and
--   net-worth-excluded accounts, budgets, a debt, a goal, recurring rules,
--   and one month in B with zero income (savings rate must be null).
-- ============================================================

\set ON_ERROR_STOP on

-- ── Fixed identities ────────────────────────────────────────────────────────
-- Users
--   A1 00000000-0000-4000-a000-0000000000a1  owner of A
--   A2 00000000-0000-4000-a000-0000000000a2  member of A
--   B1 00000000-0000-4000-a000-0000000000b1  owner of B
--   O  00000000-0000-4000-a000-0000000000ff  no household
-- Households
--   A  10000000-0000-4000-a000-00000000000a
--   B  10000000-0000-4000-a000-00000000000b

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-a000-0000000000a1', 'fixture-a1@example.test', '{"display_name":"Fixture A1"}'),
  ('00000000-0000-4000-a000-0000000000a2', 'fixture-a2@example.test', '{"display_name":"Fixture A2"}'),
  ('00000000-0000-4000-a000-0000000000b1', 'fixture-b1@example.test', '{"display_name":"Fixture B1"}'),
  ('00000000-0000-4000-a000-0000000000ff', 'fixture-outsider@example.test', '{"display_name":"Outsider"}');

-- ── Helpers (local-only schema; SECURITY INVOKER so RLS still applies) ──────
create schema fixture;
grant usage on schema fixture to authenticated;

create function fixture.cat(p_household uuid, p_name text) returns uuid
language sql stable as $$
  select id from public.categories
  where household_id = p_household and name = p_name and deleted_at is null
$$;

-- Uniform pseudo-random amount in [lo, hi), 2 decimals.
create function fixture.amt(lo numeric, hi numeric) returns numeric
language sql volatile as $$
  select round((lo + random()::numeric * (hi - lo)), 2)
$$;

-- Month-varying FX, deterministic (no PRNG) so rates are reproducible alone.
create function fixture.cop_to_cad(d date) returns numeric
language sql immutable as $$
  select round(0.000310 + 0.000030 * sin(extract(epoch from d) / 5000000.0)::numeric, 8)
$$;
create function fixture.usd_to_cad(d date) returns numeric
language sql immutable as $$
  select round(1.33 + 0.06 * cos(extract(epoch from d) / 7000000.0)::numeric, 8)
$$;

-- Every transfer goes through the full (12-argument) create_transfer_transaction,
-- the overload the app calls; positional calls are ambiguous between the two.
create function fixture.xfer(
  p_household uuid, p_from uuid, p_to uuid, p_amount numeric, p_date date,
  p_description text, p_rate numeric default 1, p_to_amount numeric default null
) returns uuid
language sql volatile as $$
  select public.create_transfer_transaction(
    p_household, p_from, p_to, p_amount, p_date, p_description,
    null::text, 'posted'::text, p_rate, p_to_amount, null::numeric, null::uuid)
$$;

grant execute on all functions in schema fixture to authenticated;

-- ============================================================
-- Household A (as A1)
-- ============================================================
begin;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-0000000000a1","role":"authenticated"}', true);

do $$
declare
  hh constant uuid := '10000000-0000-4000-a000-00000000000a';
  a1 constant uuid := '00000000-0000-4000-a000-0000000000a1';
begin
  insert into public.households (id, name, base_currency, created_by)
  values (hh, 'Fixture Family', 'CAD', a1);
  insert into public.household_members (household_id, user_id, role, status, joined_at)
  values (hh, a1, 'owner', 'active', now());
  update public.profiles set default_household_id = hh where id = a1;
  perform public.create_default_categories_for_household(hh);
end $$;

-- Accounts. Ids 2000…-0000000000NN. account_class follows the app's rule
-- (credit_card/debt → liability).
insert into public.accounts
  (id, household_id, name, account_type, account_class, currency_code,
   opening_balance_date, include_in_net_worth, created_by)
select id::uuid, '10000000-0000-4000-a000-00000000000a', name, type,
       case when type in ('credit_card', 'debt') then 'liability' else 'asset' end,
       ccy, date '2022-10-01', nw, '00000000-0000-4000-a000-0000000000a1'
from (values
  ('20000000-0000-4000-a000-000000000001', 'Main checking',        'checking',    'CAD', true),
  ('20000000-0000-4000-a000-000000000002', 'Joint checking',       'checking',    'CAD', true),
  ('20000000-0000-4000-a000-000000000003', 'Emergency savings',    'savings',     'CAD', true),
  ('20000000-0000-4000-a000-000000000004', 'Travel savings',       'savings',     'CAD', true),
  ('20000000-0000-4000-a000-000000000005', 'Wallet',               'cash',        'CAD', true),
  ('20000000-0000-4000-a000-000000000006', 'Visa',                 'credit_card', 'CAD', true),
  ('20000000-0000-4000-a000-000000000007', 'Mastercard (overpaid)','credit_card', 'CAD', true),
  ('20000000-0000-4000-a000-000000000008', 'Amex (unused)',        'credit_card', 'CAD', true),
  ('20000000-0000-4000-a000-000000000009', 'Store card (archived)','credit_card', 'CAD', true),
  ('20000000-0000-4000-a000-000000000010', 'Bancolombia',          'checking',    'COP', true),
  ('20000000-0000-4000-a000-000000000011', 'Nequi savings',        'savings',     'COP', true),
  ('20000000-0000-4000-a000-000000000012', 'COP cash',             'cash',        'COP', true),
  ('20000000-0000-4000-a000-000000000013', 'US checking',          'checking',    'USD', true),
  ('20000000-0000-4000-a000-000000000014', 'Euro savings (no FX)', 'savings',     'EUR', true),
  ('20000000-0000-4000-a000-000000000015', 'TFSA',                 'investment',  'CAD', true),
  ('20000000-0000-4000-a000-000000000016', 'RRSP (excluded)',      'investment',  'CAD', false),
  ('20000000-0000-4000-a000-000000000017', 'Kids savings (excl.)', 'savings',     'CAD', false),
  ('20000000-0000-4000-a000-000000000018', 'Old checking (archived)','checking',  'CAD', true),
  ('20000000-0000-4000-a000-000000000019', 'Old wallet (archived)','cash',        'CAD', true),
  ('20000000-0000-4000-a000-000000000020', 'Line of credit',       'debt',        'CAD', true),
  ('20000000-0000-4000-a000-000000000021', 'Brokerage',            'investment',  'CAD', true)
) as v(id, name, type, ccy, nw);

-- FX on file for A: COP→CAD and USD→CAD monthly. Deliberately NO EUR rows:
-- the EUR account is the controlled missing-FX case.
insert into public.exchange_rates
  (household_id, from_currency_code, to_currency_code, rate, rate_date, source, created_by)
select '10000000-0000-4000-a000-00000000000a', f, 'CAD',
       case f when 'COP' then fixture.cop_to_cad(d) else fixture.usd_to_cad(d) end,
       d, 'manual', '00000000-0000-4000-a000-0000000000a1'
from generate_series(date '2022-10-01', date '2026-09-01', interval '1 month') as g(d0)
cross join lateral (select g.d0::date as d) x
cross join (values ('COP'), ('USD')) as c(f);

do $$
declare
  hh constant uuid := '10000000-0000-4000-a000-00000000000a';
  main   constant uuid := '20000000-0000-4000-a000-000000000001';
  joint  constant uuid := '20000000-0000-4000-a000-000000000002';
  emerg  constant uuid := '20000000-0000-4000-a000-000000000003';
  travel constant uuid := '20000000-0000-4000-a000-000000000004';
  wallet constant uuid := '20000000-0000-4000-a000-000000000005';
  visa   constant uuid := '20000000-0000-4000-a000-000000000006';
  mc     constant uuid := '20000000-0000-4000-a000-000000000007';
  store  constant uuid := '20000000-0000-4000-a000-000000000009';
  bcol   constant uuid := '20000000-0000-4000-a000-000000000010';
  nequi  constant uuid := '20000000-0000-4000-a000-000000000011';
  copcash constant uuid := '20000000-0000-4000-a000-000000000012';
  usd    constant uuid := '20000000-0000-4000-a000-000000000013';
  eur    constant uuid := '20000000-0000-4000-a000-000000000014';
  tfsa   constant uuid := '20000000-0000-4000-a000-000000000015';
  rrsp   constant uuid := '20000000-0000-4000-a000-000000000016';
  kids   constant uuid := '20000000-0000-4000-a000-000000000017';
  oldchk constant uuid := '20000000-0000-4000-a000-000000000018';
  brok   constant uuid := '20000000-0000-4000-a000-000000000021';
  expense_cats text[] := array['Groceries','Restaurants','Transportation','Utilities',
    'Internet','Mobile','Health','Pets','Shopping','Entertainment','Subscriptions','Fees','Travel'];
  m date;
  d date;
  i int;
  n int;
  acct uuid;
  cat uuid;
  tx uuid;
  rate numeric;
  visa_spend numeric;
  mc_spend numeric;
  wallet_spend numeric;
  last_expense uuid;
  last_expense_amt numeric;
begin
  perform setseed(0.4242);

  -- Opening balances (lineage: create_opening_balance, same as the app).
  perform public.create_opening_balance(hh, main,   5000,     date '2022-10-01', 1, 'fixture');
  perform public.create_opening_balance(hh, emerg,  12000,    date '2022-10-01', 1, 'fixture');
  perform public.create_opening_balance(hh, visa,   -1200,    date '2022-10-01', 1, 'fixture');
  perform public.create_opening_balance(hh, bcol,   8000000,  date '2022-10-01', fixture.cop_to_cad(date '2022-10-01'), 'fixture');
  perform public.create_opening_balance(hh, usd,    2000,     date '2022-10-01', fixture.usd_to_cad(date '2022-10-01'), 'fixture');
  perform public.create_opening_balance(hh, eur,    1500,     date '2022-10-01', 1.45, 'fixture');
  perform public.create_opening_balance(hh, tfsa,   20000,    date '2022-10-01', 1, 'fixture');
  perform public.create_opening_balance(hh, rrsp,   30000,    date '2022-10-01', 1, 'fixture');
  perform public.create_opening_balance(hh, kids,   800,      date '2022-10-01', 1, 'fixture');
  perform public.create_opening_balance(hh, oldchk, 300,      date '2022-10-01', 1, 'fixture');
  perform public.create_opening_balance(hh, store,  -85.40,   date '2022-10-01', 1, 'fixture');

  for m in select g::date from generate_series(date '2022-10-01', date '2026-09-01', interval '1 month') g loop
    rate := fixture.cop_to_cad(m);
    visa_spend := 0;
    mc_spend := 0;
    wallet_spend := 0;

    -- Income: two salaries into main checking, interest into savings.
    perform public.create_manual_transaction(hh, 'income', m, main, fixture.cat(hh, 'Salary'),
      fixture.amt(4100, 4300), 'Salary A1', 'Employer One', null, 'posted', 1, 'Employer One');
    perform public.create_manual_transaction(hh, 'income', m + 14, joint, fixture.cat(hh, 'Salary'),
      fixture.amt(3000, 3200), 'Salary A2', 'Employer Two', null, 'posted', 1, 'Employer Two');
    perform public.create_manual_transaction(hh, 'income', m + 27, emerg, fixture.cat(hh, 'Interest Income'),
      fixture.amt(20, 45), 'Interest', null, null, 'posted', 1, null);

    -- Rent from joint checking.
    perform public.create_manual_transaction(hh, 'expense', m + 1, joint, fixture.cat(hh, 'Rent'),
      2100, 'Rent', 'Landlord', null, 'posted', 1, 'Landlord');

    -- ~45 day-to-day expenses across accounts and categories.
    n := 40 + floor(random() * 10)::int;
    for i in 1..n loop
      d := m + floor(random() * 28)::int;
      cat := fixture.cat(hh, expense_cats[1 + floor(random() * array_length(expense_cats, 1))::int]);
      case
        when random() < 0.40 then acct := main;
        when random() < 0.55 then acct := visa;
        when random() < 0.30 then acct := wallet;
        when random() < 0.50 then acct := mc;
        else acct := bcol;
      end case;
      if acct = bcol then
        tx := public.create_manual_transaction(hh, 'expense', d, bcol, cat,
          fixture.amt(20000, 180000), 'COP expense', null, null, 'posted', rate, null);
      else
        last_expense_amt := fixture.amt(4, 160);
        tx := public.create_manual_transaction(hh, 'expense', d, acct, cat,
          last_expense_amt, 'Expense', null, null, 'posted', 1, null);
        if acct = visa then visa_spend := visa_spend + last_expense_amt; end if;
        if acct = mc then mc_spend := mc_spend + last_expense_amt; end if;
        if acct = wallet then wallet_spend := wallet_spend + last_expense_amt; end if;
        last_expense := tx;
      end if;
      -- ~2% voided: must vanish from every total.
      if random() < 0.02 then
        perform public.void_transaction(tx, 'fixture void');
      end if;
    end loop;

    -- Transfers (neutral for income/expense).
    perform fixture.xfer(hh, main, emerg, 400, m + 2, 'To emergency');
    perform fixture.xfer(hh, main, tfsa, 250, m + 3, 'To TFSA');
    perform fixture.xfer(hh, joint, main, 500, m + 16, 'Joint to main');
    perform fixture.xfer(hh, main, visa, round(visa_spend * 0.97, 2), m + 20, 'Visa payment');
    -- Card payments and cash top-ups follow the month's spend, so balances
    -- stay realistic (a card owes a little, the wallet never goes negative).
    if mc_spend > 0 then
      perform fixture.xfer(hh, main, mc, mc_spend, m + 21, 'Mastercard payment');
    end if;
    perform fixture.xfer(hh, main, wallet, round(wallet_spend + 20, 2), m, 'ATM withdrawal');
    if extract(month from m)::int % 3 = 0 then
      -- Cross-currency CAD → COP; the rate is the CAD-per-COP of the day.
      perform fixture.xfer(hh, main, bcol, 300, m + 5, 'Send to Colombia', 1, round(300 / rate, 2));
      perform fixture.xfer(hh, main, travel, 150, m + 6, 'Travel fund');
      perform fixture.xfer(hh, main, brok, 500, m + 7, 'Brokerage deposit');
    end if;

    -- A USD expense and a EUR expense now and then (EUR has no rate on file).
    if extract(month from m)::int % 2 = 0 then
      perform public.create_manual_transaction(hh, 'expense', m + 9, usd, fixture.cat(hh, 'Travel'),
        fixture.amt(30, 120), 'USD expense', null, null, 'posted', fixture.usd_to_cad(m), null);
    end if;
    if extract(month from m)::int in (4, 10) then
      perform public.create_manual_transaction(hh, 'expense', m + 10, eur, fixture.cat(hh, 'Travel'),
        fixture.amt(40, 90), 'EUR expense', null, null, 'posted', 1.47, null);
    end if;

    -- Quarterly partial refund of the last CAD expense.
    if extract(month from m)::int % 3 = 1 and last_expense is not null then
      perform public.create_refund_transaction(hh,
        (select account_id from public.transaction_entries where transaction_id = last_expense limit 1),
        (select category_id from public.transaction_allocations where transaction_id = last_expense limit 1),
        round(last_expense_amt / 2, 2), m + 26, 'Partial refund', last_expense, null, null, 1);
    end if;
  end loop;

  -- Mastercard ends overpaid (credit balance): an extra payment larger than
  -- anything owed. Displayed liability must be 0, net worth must include +.
  perform fixture.xfer(hh, main, mc,
    (select round(-coalesce(sum(e.amount_account_currency), 0) + 1500, 2)
     from public.transaction_entries e
     join public.transactions t on t.id = e.transaction_id
     where e.account_id = mc and t.status = 'posted' and t.deleted_at is null),
    date '2026-09-10', 'MC overpayment');

  -- Pending rows in the current month (excluded from posted totals).
  perform public.create_manual_transaction(hh, 'expense', date '2026-09-22', visa, fixture.cat(hh, 'Groceries'),
    88.10, 'Pending groceries', null, null, 'pending', 1, null);
  perform public.create_manual_transaction(hh, 'income', date '2026-09-23', main, fixture.cat(hh, 'Side Income'),
    150, 'Pending side income', null, null, 'pending', 1, null);

  -- Future-dated rows, RELATIVE to the day the fixtures load (the one
  -- deliberate exception to fixed dates): booked ahead of time, as the
  -- transaction form allows. Accounts counts them, "as of today" snapshots
  -- do not; the release invariants reconcile the difference exactly.
  perform public.create_manual_transaction(hh, 'expense', current_date + 5, visa, fixture.cat(hh, 'Subscriptions'),
    19.99, 'Booked ahead: annual plan', null, null, 'posted', 1, null);
  perform public.create_manual_transaction(hh, 'expense', current_date + 12, main, fixture.cat(hh, 'Insurance'),
    140, 'Booked ahead: insurance', null, null, 'pending', 1, null);

  -- A debt (liability account + debts row) the Debt Planner knows about.
  perform public.create_debt_with_account(hh, 'Car loan', null, 'debt', 'CAD', 14000, date '2023-03-01', 1,
    18000, 6.9, 'annual', 380, 15, 'Fixture Bank', 'fixture');

  -- Budgets for the last 12 months.
  for m in select g::date from generate_series(date '2025-10-01', date '2026-09-01', interval '1 month') g loop
    tx := public.create_monthly_budget(hh, m);
    perform public.upsert_budget_line(tx, fixture.cat(hh, 'Groceries'), 600);
    perform public.upsert_budget_line(tx, fixture.cat(hh, 'Restaurants'), 250);
    perform public.upsert_budget_line(tx, fixture.cat(hh, 'Rent'), 2100);
    perform public.upsert_budget_line(tx, fixture.cat(hh, 'Shopping'), 200);
  end loop;

  insert into public.goals (household_id, name, goal_type, target_amount, current_amount, currency_code, linked_account_id, created_by)
  values (hh, 'Emergency fund', 'emergency_fund', 25000, 0, 'CAD', emerg, '00000000-0000-4000-a000-0000000000a1');

  insert into public.recurring_transactions
    (household_id, name, transaction_type, account_id, category_id, amount, currency_code, frequency, start_date, next_run_date, created_by)
  values
    (hh, 'Rent', 'expense', joint, fixture.cat(hh, 'Rent'), 2100, 'CAD', 'monthly', date '2026-10-01', date '2026-10-01', '00000000-0000-4000-a000-0000000000a1'),
    (hh, 'Salary A1', 'income', main, fixture.cat(hh, 'Salary'), 4200, 'CAD', 'monthly', date '2026-10-01', date '2026-10-01', '00000000-0000-4000-a000-0000000000a1');

  -- Archive the two retired accounts (after their history exists).
  update public.accounts set is_archived = true
  where id in (store, oldchk, '20000000-0000-4000-a000-000000000019');

  -- Second member.
  insert into public.household_members (household_id, user_id, role, status, joined_at)
  values (hh, '00000000-0000-4000-a000-0000000000a2', 'member', 'active', now());
end $$;
commit;

-- A2's default household (their own profile row; RLS lets a user edit it).
begin;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-0000000000a2","role":"authenticated"}', true);
update public.profiles set default_household_id = '10000000-0000-4000-a000-00000000000a'
where id = '00000000-0000-4000-a000-0000000000a2';
commit;

-- ============================================================
-- Household B (as B1) — base COP, smaller, 3 years
-- ============================================================
begin;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-0000000000b1","role":"authenticated"}', true);

do $$
declare
  hh constant uuid := '10000000-0000-4000-a000-00000000000b';
  b1 constant uuid := '00000000-0000-4000-a000-0000000000b1';
begin
  insert into public.households (id, name, base_currency, created_by)
  values (hh, 'Fixture Solo', 'COP', b1);
  insert into public.household_members (household_id, user_id, role, status, joined_at)
  values (hh, b1, 'owner', 'active', now());
  update public.profiles set default_household_id = hh where id = b1;
  perform public.create_default_categories_for_household(hh);
end $$;

insert into public.accounts
  (id, household_id, name, account_type, account_class, currency_code,
   opening_balance_date, include_in_net_worth, created_by)
select id::uuid, '10000000-0000-4000-a000-00000000000b', name, type,
       case when type in ('credit_card', 'debt') then 'liability' else 'asset' end,
       ccy, date '2023-09-01', true, '00000000-0000-4000-a000-0000000000b1'
from (values
  ('30000000-0000-4000-a000-000000000001', 'Davivienda',   'checking',    'COP'),
  ('30000000-0000-4000-a000-000000000002', 'Ahorros',      'savings',     'COP'),
  ('30000000-0000-4000-a000-000000000003', 'Efectivo',     'cash',        'COP'),
  ('30000000-0000-4000-a000-000000000004', 'Tarjeta Visa', 'credit_card', 'COP'),
  ('30000000-0000-4000-a000-000000000005', 'CDT',          'investment',  'COP'),
  ('30000000-0000-4000-a000-000000000006', 'Canada acct',  'checking',    'CAD'),
  ('30000000-0000-4000-a000-000000000007', 'Tarjeta vieja','credit_card', 'COP')
) as v(id, name, type, ccy);

insert into public.exchange_rates
  (household_id, from_currency_code, to_currency_code, rate, rate_date, source, created_by)
select '10000000-0000-4000-a000-00000000000b', 'CAD', 'COP',
       round(1 / fixture.cop_to_cad(g::date), 8), g::date, 'manual', '00000000-0000-4000-a000-0000000000b1'
from generate_series(date '2023-09-01', date '2026-09-01', interval '1 month') g;

do $$
declare
  hh constant uuid := '10000000-0000-4000-a000-00000000000b';
  chk  constant uuid := '30000000-0000-4000-a000-000000000001';
  sav  constant uuid := '30000000-0000-4000-a000-000000000002';
  cash constant uuid := '30000000-0000-4000-a000-000000000003';
  visa constant uuid := '30000000-0000-4000-a000-000000000004';
  cdt  constant uuid := '30000000-0000-4000-a000-000000000005';
  cad  constant uuid := '30000000-0000-4000-a000-000000000006';
  cats text[] := array['Groceries','Restaurants','Transportation','Utilities','Mobile','Health','Shopping'];
  m date;
  i int;
  tx uuid;
begin
  perform setseed(0.1717);
  perform public.create_opening_balance(hh, chk, 3500000, date '2023-09-01', 1, 'fixture');
  perform public.create_opening_balance(hh, sav, 12000000, date '2023-09-01', 1, 'fixture');
  perform public.create_opening_balance(hh, cad, 900, date '2023-09-01', round(1 / fixture.cop_to_cad(date '2023-09-01'), 4), 'fixture');

  for m in select g::date from generate_series(date '2023-09-01', date '2026-09-01', interval '1 month') g loop
    -- 2025-02 has NO income at all: savings rate for that month must be null.
    if m <> date '2025-02-01' then
      perform public.create_manual_transaction(hh, 'income', m, chk, fixture.cat(hh, 'Salary'),
        fixture.amt(5800000, 6200000), 'Salario', 'Empresa', null, 'posted', 1, 'Empresa');
    end if;
    for i in 1..(15 + floor(random() * 10)::int) loop
      tx := public.create_manual_transaction(hh, 'expense', m + floor(random() * 28)::int,
        case when random() < 0.5 then chk when random() < 0.6 then visa else cash end,
        fixture.cat(hh, cats[1 + floor(random() * array_length(cats, 1))::int]),
        fixture.amt(15000, 400000), 'Gasto', null, null, 'posted', 1, null);
      if random() < 0.03 then
        perform public.void_transaction(tx, 'fixture void');
      end if;
    end loop;
    perform fixture.xfer(hh, chk, sav, 500000, m + 2, 'Ahorro');
    perform fixture.xfer(hh, chk, visa, 1200000, m + 20, 'Pago tarjeta');
    if extract(month from m)::int % 4 = 0 then
      perform fixture.xfer(hh, sav, cdt, 2000000, m + 8, 'CDT');
    end if;
  end loop;

  update public.accounts set is_archived = true where id = '30000000-0000-4000-a000-000000000007';
end $$;
commit;

-- ============================================================
-- Every household-scoped table gets at least one row in EACH household, so the
-- isolation check ("a non-member sees zero rows") is never trivially true for
-- an empty table (RUM-010b review). fixture-expectations.sql enforces it.
-- ============================================================

-- As each household's owner (RLS applies), through RPCs where they exist.
create function fixture.seed_household_extras(
  p_household uuid, p_owner uuid, p_account uuid, p_expense_cat uuid, p_currency text
) returns void
language plpgsql as $$
declare
  v_tag uuid;
  v_batch uuid;
  v_tx uuid;
begin
  insert into public.tags (household_id, name) values (p_household, 'fixture-tag') returning id into v_tag;
  select id into v_tx from public.transactions
  where household_id = p_household and transaction_type = 'expense' and status = 'posted'
  order by transaction_date desc, id limit 1;
  perform public.set_transaction_tags(v_tx, array[v_tag]);

  insert into public.notes (household_id, note_date, title, created_by)
  values (p_household, date '2026-08-15', 'Fixture note', p_owner);
  insert into public.month_closures (household_id, closure_month, closed_by)
  values (p_household, date '2026-07-01', p_owner);
  insert into public.csv_import_presets (household_id, name, created_by)
  values (p_household, 'Fixture preset', p_owner);
  insert into public.categorization_rules (household_id, match_field, operator, match_value, category_id)
  values (p_household, 'description', 'contains', 'fixture', p_expense_cat);
  insert into public.import_batches (household_id, uploaded_by, file_name)
  values (p_household, p_owner, 'fixture.csv') returning id into v_batch;
  insert into public.import_rows (household_id, import_batch_id, row_number)
  values (p_household, v_batch, 1);

  -- A real plan: the RPC writes all N installments (BR-035 checks that).
  perform public.create_installment_plan(p_household, p_account, p_expense_cat, 600, 3,
    date '2026-06-01', 'Fixture laptop', null, null, 1);
end $$;
grant execute on function fixture.seed_household_extras(uuid, uuid, uuid, uuid, text) to authenticated;

begin;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-0000000000a1","role":"authenticated"}', true);
select fixture.seed_household_extras('10000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-0000000000a1',
  '20000000-0000-4000-a000-000000000006', fixture.cat('10000000-0000-4000-a000-00000000000a', 'Shopping'), 'CAD');
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-0000000000b1","role":"authenticated"}', true);
do $$
declare
  hh constant uuid := '10000000-0000-4000-a000-00000000000b';
  b1 constant uuid := '00000000-0000-4000-a000-0000000000b1';
  budget uuid;
begin
  -- B's planning modules, so they are not empty either.
  budget := public.create_monthly_budget(hh, date '2026-09-01');
  perform public.upsert_budget_line(budget, fixture.cat(hh, 'Groceries'), 1500000);
  perform public.create_debt_with_account(hh, 'Préstamo', null, 'debt', 'COP', 5000000, date '2024-01-15', 1,
    8000000, 18.5, 'annual', 350000, 5, 'Banco Fixture', 'fixture');
  insert into public.goals (household_id, name, goal_type, target_amount, current_amount, currency_code, created_by)
  values (hh, 'Viaje', 'travel', 6000000, 0, 'COP', b1);
  insert into public.recurring_transactions
    (household_id, name, transaction_type, account_id, category_id, amount, currency_code, frequency, start_date, next_run_date, created_by)
  values (hh, 'Arriendo', 'expense', '30000000-0000-4000-a000-000000000001', fixture.cat(hh, 'Rent'),
    1800000, 'COP', 'monthly', date '2026-10-01', date '2026-10-01', b1);
end $$;
select fixture.seed_household_extras('10000000-0000-4000-a000-00000000000b', '00000000-0000-4000-a000-0000000000b1',
  '30000000-0000-4000-a000-000000000004', fixture.cat('10000000-0000-4000-a000-00000000000b', 'Shopping'), 'COP');
commit;

-- recurring_autopost_log is written only by the autopost job (it has a SELECT
-- policy and nothing else), so its row is inserted as the table owner, the way
-- that job does.
insert into public.recurring_autopost_log (household_id, recurring_id, run_date, status)
select r.household_id, r.id, date '2026-09-01', 'posted'
from public.recurring_transactions r
where r.id in (select distinct on (household_id) id from public.recurring_transactions order by household_id, created_at, id);

-- Planner stats so plans resemble a real, analysed database.
analyze;
