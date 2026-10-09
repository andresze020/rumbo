-- ============================================================
-- Rumbo — HH-1 private-account invariants (docs/features/household-sharing.md
-- §4, §5 S6/S19/S20/S23, PRV-7/PRV-8, D6).
--
-- Runs as one member (no directive): locally as each fixture household's
-- owner, live with --user. The checks that need a second member (isolation,
-- S5/S22 refusals, identical shared balances) are in
-- hh_001_private_isolation.sql (run-as=co-member).
--
-- 1. Derivation, as the table owner, for the whole household: every copy of
--    private_owner_id agrees with the account it comes from; every
--    transaction's visibility agrees with its entries; no transaction touches
--    two members' private accounts; every transfer nets to zero (the full
--    form of BR-006, which can only check the caller's visible legs).
-- 2. Behaviour, each in its own begin … rollback. Scenarios that need private
--    objects build them, mostly inside a throwaway "probe" household from
--    create_household_with_owner, so nothing real is touched and nothing
--    persists. `reset role` (as br_014 does) is used only where no client
--    could act: calling the definer jobs, or reading the true state.
-- ============================================================

-- ── 1. Derivation agrees with the source of truth ─────────────────────────

-- check: HH-1 every derived private_owner_id and visibility agrees with its source (table owner)
begin;
reset role;
do $$
declare
  hh constant uuid := '__HOUSEHOLD_ID__';
  v_bad bigint;
  v_problems text[] := '{}';
begin
  select count(*) into v_bad
  from public.transaction_entries e join public.accounts a on a.id = e.account_id
  where e.household_id = hh and e.private_owner_id is distinct from a.private_owner_id;
  if v_bad > 0 then v_problems := v_problems || format('entries≠account (%s)', v_bad); end if;

  with d as (
    select t.id, t.private_owner_id, t.visibility,
           array_agg(distinct e.private_owner_id) filter (where e.private_owner_id is not null) as owners,
           bool_or(e.private_owner_id is null) as has_shared,
           bool_or(e.private_owner_id is not null) as has_private
    from public.transactions t
    join public.transaction_entries e on e.transaction_id = t.id
    where t.household_id = hh
    group by t.id
  )
  select count(*) into v_bad from d
  where coalesce(cardinality(d.owners), 0) > 1
     or d.private_owner_id is distinct from d.owners[1]
     or d.visibility is distinct from case
          when not d.has_private then 'shared' when d.has_shared then 'mixed' else 'private' end;
  if v_bad > 0 then v_problems := v_problems || format('transactions≠entries (%s)', v_bad); end if;

  select count(*) into v_bad
  from public.transaction_allocations x join public.transactions t on t.id = x.transaction_id
  where x.household_id = hh
    and x.private_owner_id is distinct from (case when t.visibility = 'private' then t.private_owner_id end);
  if v_bad > 0 then v_problems := v_problems || format('allocations (%s)', v_bad); end if;

  select count(*) into v_bad
  from public.transaction_tags x join public.transactions t on t.id = x.transaction_id
  where x.household_id = hh
    and x.private_owner_id is distinct from (case when t.visibility = 'private' then t.private_owner_id end);
  if v_bad > 0 then v_problems := v_problems || format('tag links (%s)', v_bad); end if;

  select count(*) into v_bad
  from public.debts d join public.accounts a on a.id = d.account_id
  where d.household_id = hh and d.private_owner_id is distinct from a.private_owner_id;
  if v_bad > 0 then v_problems := v_problems || format('debts (%s)', v_bad); end if;

  select count(*) into v_bad
  from public.installment_plans p join public.accounts a on a.id = p.account_id
  where p.household_id = hh and p.private_owner_id is distinct from a.private_owner_id;
  if v_bad > 0 then v_problems := v_problems || format('installment_plans (%s)', v_bad); end if;

  select count(*) into v_bad
  from public.goals g left join public.accounts a on a.id = g.linked_account_id
  where g.household_id = hh and g.private_owner_id is distinct from a.private_owner_id;
  if v_bad > 0 then v_problems := v_problems || format('goals (%s)', v_bad); end if;

  select count(*) into v_bad
  from public.recurring_transactions r
  left join public.accounts a1 on a1.id = r.account_id
  left join public.accounts a2 on a2.id = r.to_account_id
  where r.household_id = hh
    and r.private_owner_id is distinct from coalesce(a1.private_owner_id, a2.private_owner_id);
  if v_bad > 0 then v_problems := v_problems || format('recurring_transactions (%s)', v_bad); end if;

  select count(*) into v_bad
  from public.recurring_autopost_log l join public.recurring_transactions r on r.id = l.recurring_id
  where l.household_id = hh and l.private_owner_id is distinct from r.private_owner_id;
  if v_bad > 0 then v_problems := v_problems || format('recurring_autopost_log (%s)', v_bad); end if;

  select count(*) into v_bad
  from public.import_batches b join public.accounts a on a.id = b.target_account_id
  where b.household_id = hh and b.private_owner_id is distinct from a.private_owner_id;
  if v_bad > 0 then v_problems := v_problems || format('import_batches (%s)', v_bad); end if;

  select count(*) into v_bad
  from public.import_rows r join public.import_batches b on b.id = r.import_batch_id
  where r.household_id = hh and r.private_owner_id is distinct from b.private_owner_id;
  if v_bad > 0 then v_problems := v_problems || format('import_rows (%s)', v_bad); end if;

  select count(*) into v_bad
  from public.csv_import_presets p left join public.accounts a on a.id = p.target_account_id
  where p.household_id = hh and p.private_owner_id is distinct from a.private_owner_id;
  if v_bad > 0 then v_problems := v_problems || format('csv_import_presets (%s)', v_bad); end if;

  if cardinality(v_problems) > 0 then
    raise exception 'derived privacy out of sync: %', array_to_string(v_problems, ', ');
  end if;
end $$;
rollback;

-- The full form of BR-006: every leg, whoever's account it is.
-- check: HH-1 every posted same-currency transfer nets to zero, all legs included (table owner)
begin;
reset role;
do $$
declare
  v_bad bigint;
begin
  select count(*) into v_bad
  from (
    select t.id
    from public.transactions t
    join public.transaction_entries e on e.transaction_id = t.id
    where t.household_id = '__HOUSEHOLD_ID__'::uuid
      and t.transaction_type = 'transfer'
      and t.status = 'posted'
      and t.deleted_at is null
    group by t.id
    having count(distinct e.currency_code) = 1 and sum(e.amount_base_currency) <> 0
  ) x;
  if v_bad > 0 then
    raise exception '% transfer(s) do not net to zero', v_bad;
  end if;
end $$;
rollback;

-- ── 2. Behaviour ──────────────────────────────────────────────────────────

-- A client can create a private account for itself, cannot fake a
-- transaction's privacy, and cannot flip an account's visibility directly.
-- check: HH-1 privacy is derived, never taken from the client
begin;
do $$
declare
  hh constant uuid := '__HOUSEHOLD_ID__';
  me constant uuid := (select auth.uid());
  v_account uuid;
  v_tx uuid;
  v_row record;
begin
  insert into public.accounts
    (household_id, name, account_type, account_class, currency_code, private_owner_id, created_by)
  values (hh, 'HH-1 probe private', 'cash', 'asset',
          (select h.base_currency from public.households h where h.id = hh), me, me)
  returning id into v_account;

  -- The header says "private, owned by me"; with no entries it is shared.
  insert into public.transactions
    (household_id, transaction_date, transaction_type, status, created_by, private_owner_id, visibility)
  values (hh, current_date, 'expense', 'posted', me, me, 'private')
  returning id into v_tx;
  select private_owner_id, visibility into v_row from public.transactions where id = v_tx;
  if v_row.private_owner_id is not null or v_row.visibility <> 'shared' then
    raise exception 'a client-sent visibility was kept: %', v_row;
  end if;

  begin
    update public.accounts set private_owner_id = null where id = v_account;
    raise exception 'LEAK: a client flipped an account''s visibility';
  exception when others then
    if sqlerrm not like 'An account''s visibility can only change%' then raise; end if;
  end;
end $$;
rollback;

-- S6: a private name never blocks, or reveals, a shared one — and vice versa.
-- check: HH-1 private and shared names do not collide (accounts, payees)
begin;
do $$
declare
  hh constant uuid := '__HOUSEHOLD_ID__';
  me constant uuid := (select auth.uid());
  ccy text := (select h.base_currency from public.households h where h.id = hh);
  v_private uuid;
  v_shared_account uuid;
  v_name text;
  v_private_payee uuid;
  v_shared_payee uuid;
begin
  select a.id, a.name into v_shared_account, v_name
  from public.accounts a
  where a.household_id = hh and a.private_owner_id is null and a.deleted_at is null and not a.is_archived
  order by a.created_at limit 1;
  if v_shared_account is null then return; end if;

  -- A private account named like a shared one: allowed.
  insert into public.accounts (household_id, name, account_type, account_class, currency_code, private_owner_id, created_by)
  values (hh, v_name, 'cash', 'asset', ccy, me, me)
  returning id into v_private;

  -- …but not twice for the same owner.
  begin
    insert into public.accounts (household_id, name, account_type, account_class, currency_code, private_owner_id, created_by)
    values (hh, upper(v_name), 'cash', 'asset', ccy, me, me);
    raise exception 'two private accounts of one owner share a name';
  exception when unique_violation then null;
  end;

  -- Payees (PRV-7): the same new name gives a private payee on a private
  -- account and a separate shared one on a shared account.
  v_private_payee := public.get_or_create_payee(hh, 'HH-1 probe payee', array[v_private]);
  v_shared_payee := public.get_or_create_payee(hh, 'hh-1 PROBE payee', array[v_shared_account]);
  if v_private_payee is null or v_shared_payee is null or v_private_payee = v_shared_payee then
    raise exception 'expected two payees, got % and %', v_private_payee, v_shared_payee;
  end if;
  if (select private_owner_id from public.payees where id = v_private_payee) is distinct from me then
    raise exception 'a payee typed on a private account is not private';
  end if;
  if (select private_owner_id from public.payees where id = v_shared_payee) is not null then
    raise exception 'a payee typed on a shared account is not shared';
  end if;
  -- A mixed context (a private and a shared account) is shared; a private
  -- context reuses the private payee, then the shared one if that is all there is.
  if public.get_or_create_payee(hh, 'HH-1 probe payee', array[v_private, v_shared_account]) <> v_shared_payee then
    raise exception 'a mixed context did not reuse the shared payee';
  end if;
  if public.get_or_create_payee(hh, 'HH-1 probe payee', array[v_private]) <> v_private_payee then
    raise exception 'a private context did not reuse the private payee';
  end if;
end $$;
rollback;

-- S23: a refund goes to an account with the purchase's visibility.
-- check: HH-1 a refund cannot cross from a shared purchase into a private account
begin;
do $$
declare
  hh constant uuid := '__HOUSEHOLD_ID__';
  me constant uuid := (select auth.uid());
  ccy text := (select h.base_currency from public.households h where h.id = hh);
  v_cat uuid;
  v_shared uuid;
  v_private uuid;
  v_purchase uuid;
begin
  select c.id into v_cat from public.categories c
  where c.household_id = hh and c.category_type = 'expense' and c.deleted_at is null and not c.is_archived
  order by c.sort_order limit 1;
  select a.id into v_shared from public.accounts a
  where a.household_id = hh and a.private_owner_id is null and a.deleted_at is null and not a.is_archived
    and a.currency_code = ccy
  order by a.created_at limit 1;
  if v_cat is null or v_shared is null then return; end if;

  insert into public.accounts (household_id, name, account_type, account_class, currency_code, private_owner_id, created_by)
  values (hh, 'HH-1 refund probe', 'cash', 'asset', ccy, me, me)
  returning id into v_private;

  v_purchase := public.create_manual_transaction(hh, 'expense', current_date, v_shared, v_cat, 40,
    'HH-1 shared purchase', null, null, 'posted', 1, null);

  begin
    perform public.create_refund_transaction(
      p_household_id => hh, p_account_id => v_private, p_category_id => v_cat, p_amount => 10,
      p_transaction_date => current_date, p_refunded_transaction_id => v_purchase);
    raise exception 'LEAK: a refund of a shared purchase landed in a private account';
  exception when others then
    if sqlerrm <> 'A refund must go to an account with the same visibility as the purchase' then raise; end if;
  end;
end $$;
rollback;

-- PRV-8, in a probe household where the caller is owner/admin.
-- check: HH-1 a shared card cannot be paid from a private account
begin;
select set_config('hh1.probe', public.create_household_with_owner(
  'HH-1 probe', (select h.base_currency from public.households h where h.id = '__HOUSEHOLD_ID__'::uuid))::text, true);
do $$
declare
  hh constant uuid := current_setting('hh1.probe')::uuid;
  me constant uuid := (select auth.uid());
  ccy text := (select h.base_currency from public.households h where h.id = hh);
  v_private uuid;
  v_shared_card uuid;
  v_private_card uuid;
begin
  insert into public.accounts (household_id, name, account_type, account_class, currency_code, private_owner_id, created_by)
  values (hh, 'Mine', 'checking', 'asset', ccy, me, me) returning id into v_private;
  insert into public.accounts (household_id, name, account_type, account_class, currency_code, created_by)
  values (hh, 'Shared card', 'credit_card', 'liability', ccy, me) returning id into v_shared_card;
  insert into public.accounts (household_id, name, account_type, account_class, currency_code, private_owner_id, created_by)
  values (hh, 'My card', 'credit_card', 'liability', ccy, me, me) returning id into v_private_card;

  update public.accounts set billing_account_id = v_private where id = v_private_card; -- allowed
  begin
    update public.accounts set billing_account_id = v_private where id = v_shared_card;
    raise exception 'LEAK: a shared card is paid from a private account';
  exception when others then
    if sqlerrm <> 'A shared card cannot be paid from a private account' then raise; end if;
  end;
end $$;
rollback;

-- create_debt_with_account(p_private): a new private liability account, and
-- everything it writes follows it.
-- check: HH-1 a private debt creates a private account, debt and opening balance
begin;
do $$
declare
  hh constant uuid := '__HOUSEHOLD_ID__';
  me constant uuid := (select auth.uid());
  v_debt uuid;
  v_account uuid;
begin
  v_debt := public.create_debt_with_account(
    p_household_id => hh, p_name => 'HH-1 probe private debt', p_account_type => 'debt',
    p_currency_code => (select h.base_currency from public.households h where h.id = hh),
    p_opening_balance_amount => 500, p_opening_balance_date => current_date, p_private => true);
  select d.account_id into v_account from public.debts d where d.id = v_debt;

  if (select private_owner_id from public.accounts where id = v_account) is distinct from me
     or (select private_owner_id from public.debts where id = v_debt) is distinct from me then
    raise exception 'the debt or its account is not private to its creator';
  end if;
  if exists (
    select 1 from public.transaction_entries e
    where e.account_id = v_account and e.private_owner_id is distinct from me
  ) then
    raise exception 'the opening balance is not private';
  end if;
end $$;
rollback;

-- D6 / PRV-5 / PRV-6, in a probe household (one member): make an account
-- private, then share it back; the dry runs change nothing; sharing flips a
-- private payee with no shared twin and merges one that has a twin.
-- check: HH-1 set_account_private and share_private_account move every dependent row
begin;
select set_config('hh1.probe', public.create_household_with_owner(
  'HH-1 probe', (select h.base_currency from public.households h where h.id = '__HOUSEHOLD_ID__'::uuid))::text, true);
do $$
declare
  hh constant uuid := current_setting('hh1.probe')::uuid;
  me constant uuid := (select auth.uid());
  ccy text := (select h.base_currency from public.households h where h.id = hh);
  v_cat uuid := (select c.id from public.categories c
                 where c.household_id = hh and c.category_type = 'expense' order by c.sort_order limit 1);
  v_account uuid;
  v_other uuid;
  v_tx uuid;
  v_result jsonb;
  v_twin uuid;
  v_flip uuid;
  v_merge uuid;
begin
  insert into public.accounts (household_id, name, account_type, account_class, currency_code, created_by)
  values (hh, 'Wallet', 'cash', 'asset', ccy, me) returning id into v_account;
  insert into public.accounts (household_id, name, account_type, account_class, currency_code, created_by)
  values (hh, 'Other', 'cash', 'asset', ccy, me) returning id into v_other;
  v_tx := public.create_manual_transaction(hh, 'expense', current_date, v_account, v_cat, 12,
    'probe', null, null, 'posted', 1, 'Probe shop');

  v_result := public.set_account_private(v_account, true);
  if (v_result ->> 'applied')::boolean or (v_result ->> 'transactions')::int <> 1 then
    raise exception 'dry run: %', v_result;
  end if;
  if (select private_owner_id from public.accounts where id = v_account) is not null then
    raise exception 'a dry run changed the account';
  end if;

  v_result := public.set_account_private(v_account);
  if (select visibility from public.transactions where id = v_tx) <> 'private' then
    raise exception 'the account''s transaction did not become private: %', v_result;
  end if;

  -- Now private: a payee typed on it is private. 'Twin' then also gets a
  -- shared payee of the same name, from a shared account (created second: a
  -- private context reuses an existing shared payee rather than shadow it).
  perform public.create_manual_transaction(hh, 'expense', current_date, v_account, v_cat, 3,
    'p1', null, null, 'posted', 1, 'Only mine');
  perform public.create_manual_transaction(hh, 'expense', current_date, v_account, v_cat, 4,
    'p2', null, null, 'posted', 1, 'Twin');
  v_twin := public.get_or_create_payee(hh, 'Twin', array[v_other]);
  select id into v_flip from public.payees where household_id = hh and name = 'Only mine';
  select id into v_merge from public.payees where household_id = hh and name = 'Twin' and private_owner_id = me;
  if v_flip is null or v_merge is null then
    raise exception 'setup: expected two private payees';
  end if;

  v_result := public.share_private_account(v_account, true);
  if (v_result ->> 'payees')::int <> 2 or (v_result ->> 'applied')::boolean then
    raise exception 'share dry run: %', v_result;
  end if;

  v_result := public.share_private_account(v_account);
  if exists (select 1 from public.transactions t where t.household_id = hh and t.visibility <> 'shared') then
    raise exception 'transactions stayed private after sharing';
  end if;
  if (select private_owner_id from public.payees where id = v_flip) is not null then
    raise exception 'a private payee with no shared twin was not flipped';
  end if;
  if not (select is_archived from public.payees where id = v_merge)
     or exists (select 1 from public.transactions where payee_id = v_merge) then
    raise exception 'a private payee with a shared twin was not merged';
  end if;
  if not exists (
    select 1 from public.household_audit_log l
    where l.household_id = hh and l.action = 'account_shared'
  ) or not exists (
    select 1 from public.household_audit_log l
    where l.household_id = hh and l.action = 'account_made_private'
  ) then
    raise exception 'missing audit rows';
  end if;
end $$;
rollback;

-- S19 / PRV-9, in a probe household whose only member (the caller) is then
-- retired by the table owner: their private rule is skipped, a shared rule
-- still posts. Dated in 2000 so the job finds nothing else to post.
-- check: HH-1 the autopost job skips a private rule whose owner is no longer a member
begin;
select set_config('hh1.probe', public.create_household_with_owner(
  'HH-1 probe', (select h.base_currency from public.households h where h.id = '__HOUSEHOLD_ID__'::uuid))::text, true);
do $$
declare
  hh constant uuid := current_setting('hh1.probe')::uuid;
  me constant uuid := (select auth.uid());
  ccy text := (select h.base_currency from public.households h where h.id = hh);
  v_cat uuid := (select c.id from public.categories c
                 where c.household_id = hh and c.category_type = 'expense' order by c.sort_order limit 1);
  v_private uuid;
  v_shared uuid;
begin
  insert into public.accounts (household_id, name, account_type, account_class, currency_code, private_owner_id, created_by)
  values (hh, 'Mine', 'cash', 'asset', ccy, me, me) returning id into v_private;
  insert into public.accounts (household_id, name, account_type, account_class, currency_code, created_by)
  values (hh, 'Ours', 'cash', 'asset', ccy, me) returning id into v_shared;
  insert into public.recurring_transactions
    (household_id, name, transaction_type, account_id, category_id, amount, currency_code,
     frequency, start_date, next_run_date, auto_post, created_by)
  values
    (hh, 'HH-1 private rule', 'expense', v_private, v_cat, 5, ccy, 'monthly', date '2000-01-01', date '2000-01-01', true, me),
    (hh, 'HH-1 shared rule', 'expense', v_shared, v_cat, 5, ccy, 'monthly', date '2000-01-01', date '2000-01-01', true, me);
end $$;
reset role;
update public.household_members set status = 'removed', removed_at = now()
where household_id = current_setting('hh1.probe')::uuid;
select public.run_recurring_autopost(date '2000-01-15');
do $$
declare
  hh constant uuid := current_setting('hh1.probe')::uuid;
begin
  if exists (
    select 1 from public.transactions t join public.transaction_entries e on e.transaction_id = t.id
    join public.accounts a on a.id = e.account_id
    where t.household_id = hh and a.private_owner_id is not null
  ) then
    raise exception 'a private rule posted although its owner left';
  end if;
  if not exists (select 1 from public.transactions t where t.household_id = hh) then
    raise exception 'setup: the shared rule did not post either (did the job run?)';
  end if;
end $$;
rollback;

-- S20: the definer copy tool refuses a source that holds private data. Both
-- households are probes: if the guard ever regressed, the copy would wipe a
-- throwaway target (and still roll back), never a real one.
-- check: HH-1 copy_household_data refuses a source with a private account
begin;
select set_config('hh1.target', public.create_household_with_owner(
  'HH-1 probe target', (select h.base_currency from public.households h where h.id = '__HOUSEHOLD_ID__'::uuid))::text, true);
select set_config('hh1.probe', public.create_household_with_owner(
  'HH-1 probe', (select h.base_currency from public.households h where h.id = '__HOUSEHOLD_ID__'::uuid))::text, true);
insert into public.accounts (household_id, name, account_type, account_class, currency_code, private_owner_id, created_by)
select current_setting('hh1.probe')::uuid, 'Mine', 'cash', 'asset', h.base_currency, (select auth.uid()), (select auth.uid())
from public.households h where h.id = current_setting('hh1.probe')::uuid;
select set_config('hh1.actor', (select auth.uid())::text, true);
reset role;
do $$
begin
  begin
    perform public.copy_household_data(current_setting('hh1.probe')::uuid, current_setting('hh1.target')::uuid,
      current_setting('hh1.actor')::uuid);
    raise exception 'LEAK: copy_household_data copied a source with private data';
  exception when others then
    if sqlerrm not like 'source household has private accounts or payees%' then raise; end if;
  end;
end $$;
rollback;
