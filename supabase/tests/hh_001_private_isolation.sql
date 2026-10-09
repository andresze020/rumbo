-- rumbo-test: run-as=co-member
-- ============================================================
-- Rumbo — HH-1 private-account isolation (docs/features/household-sharing.md
-- D2, PRV-4, S5, S17, S22).
--
-- Runs as one active member (the caller) about another (__SUBJECT_USER_ID__).
-- Locally: in fixture household A, as A2 about A1 and then as A1 — the owner
-- and an admin — about A2, so "no override for owner or admin" (D2) is tested
-- from the strongest side. Live: with --co-member and --subject only.
--
-- 1. S17: in every table with a private_owner_id column — discovered at run
--    time, so a table added later is covered the day it ships — the caller
--    reads none of the subject's private rows. fixture-expectations.sql makes
--    sure each table really holds private rows for both owners.
-- 2. A mixed transfer of the subject's shows the caller its header and its
--    shared leg only (PRV-4).
-- 3. The reporting RPCs return none of the subject's private accounts,
--    transactions or payees.
-- 4. S5: every write path answers the subject's private account exactly as it
--    answers an account that does not exist.
-- 5. S22: the caller cannot edit, void, retag or delete the shared side of the
--    subject's mixed transfer.
-- 6. A shared account's balance is the same for both members.
-- 7. A transaction cannot touch two members' private accounts.
-- 8. D6: no account can be made private while the household has two members.
-- 9. The caller cannot pull someone else's shared transaction into their
--    private account by adding or moving a leg, by first claiming to have
--    created it, or by moving its leg or allocation into a transaction of
--    their own (it would vanish from the household's view).
--
-- Where a check needs the subject's private ids, it reads them as the table
-- owner (`reset role`, read-only) into a transaction-local setting, then acts
-- as the caller again. Every block rolls back.
-- ============================================================

-- check: HH-1 the caller reads none of the subject's private rows, in any table (discovered at run time)
do $$
declare
  t text;
  n bigint;
  checked int := 0;
  leaked text[] := '{}';
begin
  for t in
    select c.relname::text
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace ns on ns.oid = c.relnamespace
    join pg_catalog.pg_attribute a
      on a.attrelid = c.oid and a.attname = 'private_owner_id' and not a.attisdropped
    where ns.nspname = 'public' and c.relkind in ('r', 'p')
    order by 1
  loop
    checked := checked + 1;
    if t = 'transactions' then
      -- A mixed transfer's header is shared by design; a private one is not.
      execute format(
        'select count(*) from public.%I where private_owner_id = %L and visibility = ''private''',
        t, '__SUBJECT_USER_ID__') into n;
    else
      execute format('select count(*) from public.%I where private_owner_id = %L', t, '__SUBJECT_USER_ID__') into n;
    end if;
    if n > 0 then leaked := leaked || format('%s (%s)', t, n); end if;
  end loop;

  if checked < 14 then
    raise exception 'only % tables have private_owner_id — the check would be vacuous', checked;
  end if;
  if cardinality(leaked) > 0 then
    raise exception 'LEAK: the caller reads the subject''s private rows in: %', array_to_string(leaked, ', ');
  end if;
end $$;

-- check: HH-1 a mixed transfer of the subject's shows the caller its shared leg only
do $$
declare
  v_bad bigint;
begin
  -- Every entry the caller can see of the subject's mixed transfers is shared,
  -- and each such header shows at least that shared leg.
  select count(*) into v_bad
  from public.transactions t
  where t.household_id = '__HOUSEHOLD_ID__'::uuid
    and t.visibility = 'mixed'
    and t.private_owner_id = '__SUBJECT_USER_ID__'::uuid
    and (
      exists (select 1 from public.transaction_entries e where e.transaction_id = t.id and e.private_owner_id is not null)
      or not exists (select 1 from public.transaction_entries e where e.transaction_id = t.id)
    );
  if v_bad > 0 then
    raise exception 'LEAK or gap: % of the subject''s mixed transfers show a private leg or no leg', v_bad;
  end if;
end $$;

-- check: HH-1 the reporting RPCs return nothing of the subject's private side
begin;
reset role;
select set_config('hh1.private_accounts', coalesce((
  select string_agg(a.id::text, ',') from public.accounts a
  where a.household_id = '__HOUSEHOLD_ID__'::uuid and a.private_owner_id = '__SUBJECT_USER_ID__'::uuid), ''), true);
select set_config('hh1.private_transactions', coalesce((
  select string_agg(t.id::text, ',') from public.transactions t
  where t.household_id = '__HOUSEHOLD_ID__'::uuid and t.private_owner_id = '__SUBJECT_USER_ID__'::uuid
    and t.visibility = 'private'), ''), true);
select set_config('hh1.private_payees', coalesce((
  select string_agg(p.id::text, ',') from public.payees p
  where p.household_id = '__HOUSEHOLD_ID__'::uuid and p.private_owner_id = '__SUBJECT_USER_ID__'::uuid), ''), true);
set local role authenticated;
do $$
declare
  hh constant uuid := '__HOUSEHOLD_ID__';
  accounts uuid[] := string_to_array(nullif(current_setting('hh1.private_accounts'), ''), ',')::uuid[];
  txs uuid[] := string_to_array(nullif(current_setting('hh1.private_transactions'), ''), ',')::uuid[];
  payees uuid[] := string_to_array(nullif(current_setting('hh1.private_payees'), ''), ',')::uuid[];
  n bigint;
begin
  select count(*) into n from public.get_account_balances(hh) b where b.account_id = any(coalesce(accounts, '{}'));
  if n > 0 then raise exception 'LEAK: get_account_balances returned % of the subject''s private accounts', n; end if;

  select count(*) into n
  from public.get_account_balances_as_of_many(hh, array[current_date], true) b
  where b.account_id = any(coalesce(accounts, '{}'));
  if n > 0 then raise exception 'LEAK: get_account_balances_as_of_many returned % private accounts', n; end if;

  select count(*) into n from public.get_card_cycle_summaries(hh) c where c.account_id = any(coalesce(accounts, '{}'));
  if n > 0 then raise exception 'LEAK: get_card_cycle_summaries returned % private cards', n; end if;

  select count(*) into n
  from public.search_household_transactions(hh, null, null, null, null, null, null, null, null, null, null, 1000000, 0) s
  where s.id = any(coalesce(txs, '{}'));
  if n > 0 then raise exception 'LEAK: search_household_transactions returned % private transactions', n; end if;

  select count(*) into n from public.get_payees_with_stats(hh) p where p.id = any(coalesce(payees, '{}'));
  if n > 0 then raise exception 'LEAK: get_payees_with_stats returned % private payees', n; end if;
end $$;
rollback;

-- S5: an account that is someone else's private one and an account that does
-- not exist must be indistinguishable to the caller.
-- check: HH-1 every write path answers the subject's private account like a missing one (S5)
begin;
reset role;
select set_config('hh1.private_account', coalesce((
  select a.id::text from public.accounts a
  where a.household_id = '__HOUSEHOLD_ID__'::uuid and a.private_owner_id = '__SUBJECT_USER_ID__'::uuid
    and a.deleted_at is null
  order by a.created_at limit 1), ''), true);
set local role authenticated;
do $$
declare
  hh constant uuid := '__HOUSEHOLD_ID__';
  hidden uuid := nullif(current_setting('hh1.private_account'), '')::uuid;
  missing constant uuid := '00000000-0000-4000-a000-00000000dead';
  shared uuid;
  cat uuid;
  probe text;
  v_hidden text;
  v_missing text;
  mismatches text[] := '{}';
begin
  if hidden is null then return; end if; -- no private account to probe (e.g. live)

  select a.id into shared from public.accounts a
  where a.household_id = hh and a.private_owner_id is null and a.deleted_at is null and not a.is_archived
  order by a.created_at limit 1;
  select c.id into cat from public.categories c
  where c.household_id = hh and c.category_type = 'expense' and c.deleted_at is null
  order by c.sort_order limit 1;

  foreach probe in array array[
    'select public.create_manual_transaction($1, ''expense'', current_date, $2, $3, 1, ''probe'', null, null, ''posted'', 1, null)',
    'select public.create_transfer_transaction($1, $4, $2, 1, current_date, ''probe'', null::text, ''posted''::text, 1::numeric, null::numeric, null::numeric, null::uuid)',
    'select public.create_balance_adjustment($1, $2, 1, current_date, 1, ''probe'')',
    'select public.create_opening_balance($1, $2, 1, current_date, 1, ''probe'')',
    'select public.get_or_create_payee($1, ''probe'', array[$2])'
  ] loop
    v_hidden := null;
    v_missing := null;
    begin execute probe using hh, hidden, cat, shared; exception when others then v_hidden := sqlerrm; end;
    begin execute probe using hh, missing, cat, shared; exception when others then v_missing := sqlerrm; end;
    if v_hidden is null then
      raise exception 'LEAK: a write into the subject''s private account succeeded: %', probe;
    end if;
    if v_hidden is distinct from v_missing then
      mismatches := mismatches || format('%s → hidden "%s" vs missing "%s"', left(probe, 40), v_hidden, v_missing);
    end if;
  end loop;

  if cardinality(mismatches) > 0 then
    raise exception 'ORACLE: %', array_to_string(mismatches, ' | ');
  end if;
end $$;
rollback;

-- S22: the subject's mixed transfer is theirs to change. Every refusal must be
-- explicit — a silent "0 rows" would let an RPC report success.
-- check: HH-1 the caller cannot edit, void, retag or delete the subject's mixed transfer (S22)
begin;
do $$
declare
  hh constant uuid := '__HOUSEHOLD_ID__';
  v_tx uuid;
  v_from uuid;
  v_to uuid;
  v_amount numeric;
  n bigint;
  attempt text;
begin
  select t.id into v_tx from public.transactions t
  where t.household_id = hh and t.visibility = 'mixed' and t.private_owner_id = '__SUBJECT_USER_ID__'::uuid
    and t.status = 'posted' and t.deleted_at is null
  order by t.transaction_date limit 1;
  if v_tx is null then return; end if; -- no mixed transfer to probe (e.g. live)

  -- The leg the caller can see, and another shared account in its currency,
  -- so the edit is valid in every respect but who is making it.
  select e.account_id, abs(e.amount_account_currency) into v_from, v_amount
  from public.transaction_entries e where e.transaction_id = v_tx limit 1;
  select a.id into v_to from public.accounts a
  where a.household_id = hh and a.private_owner_id is null and a.deleted_at is null and not a.is_archived
    and a.id <> v_from
    and a.currency_code = (select f.currency_code from public.accounts f where f.id = v_from)
  order by a.created_at limit 1;

  foreach attempt in array array[
    format('select public.void_transaction(%L, ''probe'')', v_tx),
    format('select public.set_transaction_tags(%L, array[]::uuid[])', v_tx),
    format('select public.update_transfer_transaction(%L, %L, %L, %s, current_date)', v_tx, v_from, v_to, v_amount)
  ] loop
    begin
      execute attempt;
      raise exception 'LEAK: % succeeded on the subject''s mixed transfer', attempt;
    exception when others then
      if sqlerrm <> 'Only the member who owns the private account can change this transaction' then
        raise exception '% failed for the wrong reason: %', attempt, sqlerrm;
      end if;
    end;
  end loop;

  update public.transactions set description = 'probe' where id = v_tx;
  get diagnostics n = row_count;
  if n > 0 then raise exception 'LEAK: the caller updated the subject''s mixed transfer header'; end if;

  delete from public.transaction_entries where transaction_id = v_tx;
  get diagnostics n = row_count;
  if n > 0 then raise exception 'LEAK: the caller deleted % leg(s) of the subject''s mixed transfer', n; end if;
end $$;
rollback;

-- check: HH-1 every shared account's balance is the same for both members
do $$
declare
  hh constant uuid := '__HOUSEHOLD_ID__';
  me constant text := (select auth.uid())::text;
  mine jsonb;
  theirs jsonb;
begin
  select coalesce(jsonb_object_agg(b.account_id, b.posted_balance_account_currency), '{}') into mine
  from public.get_account_balances(hh) b
  join public.accounts a on a.id = b.account_id
  where a.private_owner_id is null;

  perform set_config('request.jwt.claims',
    json_build_object('sub', '__SUBJECT_USER_ID__', 'role', 'authenticated')::text, true);
  select coalesce(jsonb_object_agg(b.account_id, b.posted_balance_account_currency), '{}') into theirs
  from public.get_account_balances(hh) b
  join public.accounts a on a.id = b.account_id
  where a.private_owner_id is null;
  perform set_config('request.jwt.claims', json_build_object('sub', me, 'role', 'authenticated')::text, true);

  if mine is distinct from theirs then
    raise exception 'shared balances differ between members: % vs %', mine, theirs;
  end if;
  if mine = '{}'::jsonb then
    raise exception 'setup: no shared account balance to compare';
  end if;
end $$;

-- The trigger, not just RLS: even the table owner cannot write one.
-- check: HH-1 a transaction cannot touch two members' private accounts
begin;
reset role;
do $$
declare
  hh constant uuid := '__HOUSEHOLD_ID__';
  ccy text := (select h.base_currency from public.households h where h.id = hh);
  me constant uuid := (current_setting('request.jwt.claims', true)::jsonb ->> 'sub')::uuid;
  v_mine uuid;
  v_theirs uuid;
  v_tx uuid;
begin
  insert into public.accounts (household_id, name, account_type, account_class, currency_code, private_owner_id, created_by)
  values (hh, 'HH-1 two-owner probe (caller)', 'cash', 'asset', ccy, me, me) returning id into v_mine;
  insert into public.accounts (household_id, name, account_type, account_class, currency_code, private_owner_id, created_by)
  values (hh, 'HH-1 two-owner probe (subject)', 'cash', 'asset', ccy, '__SUBJECT_USER_ID__', '__SUBJECT_USER_ID__')
  returning id into v_theirs;

  insert into public.transactions (household_id, transaction_date, transaction_type, status, created_by)
  values (hh, current_date, 'transfer', 'posted', me) returning id into v_tx;
  insert into public.transaction_entries
    (household_id, transaction_id, account_id, amount_account_currency, currency_code, exchange_rate_to_base, amount_base_currency)
  values (hh, v_tx, v_mine, -1, ccy, 1, -1);
  begin
    insert into public.transaction_entries
      (household_id, transaction_id, account_id, amount_account_currency, currency_code, exchange_rate_to_base, amount_base_currency)
    values (hh, v_tx, v_theirs, 1, ccy, 1, 1);
    raise exception 'LEAK: one transaction touched two members'' private accounts';
  exception when others then
    if sqlerrm <> 'A transaction cannot touch private accounts of two different members' then raise; end if;
  end;
end $$;
rollback;

-- check: HH-1 no account can be made private while the household has two members (D6)
begin;
do $$
declare
  v_account uuid;
begin
  select a.id into v_account from public.accounts a
  where a.household_id = '__HOUSEHOLD_ID__'::uuid and a.private_owner_id is null and a.deleted_at is null
  order by a.created_at limit 1;
  begin
    perform public.set_account_private(v_account, true);
    raise exception 'LEAK: set_account_private accepted a shared account in a two-member household';
  exception when others then
    if sqlerrm not in (
      'An account can only be made private while you are the only member of the household',
      'Not authorized to change this account'
    ) then
      raise;
    end if;
  end;
end $$;
rollback;

-- A private leg only goes into a transaction its owner created: otherwise a
-- member could hide anyone's shared expense by adding a private leg to it.
-- The subject's shared expense is created here, acting as the subject (as the
-- balance check above does), so both directions have one to probe.
-- check: HH-1 the caller cannot add or move a private leg into someone else's transaction
begin;
do $$
declare
  hh constant uuid := '__HOUSEHOLD_ID__';
  me constant uuid := (select auth.uid());
  ccy text := (select h.base_currency from public.households h where h.id = hh);
  v_cat uuid;
  v_shared uuid;
  v_private uuid;
  v_tx uuid;
  v_entry uuid;
  v_mine_tx uuid;
  n bigint;
begin
  select c.id into v_cat from public.categories c
  where c.household_id = hh and c.category_type = 'expense' and c.deleted_at is null and not c.is_archived
  order by c.sort_order limit 1;
  select a.id into v_shared from public.accounts a
  where a.household_id = hh and a.private_owner_id is null and a.deleted_at is null and not a.is_archived
    and a.currency_code = ccy
  order by a.created_at limit 1;
  if v_cat is null or v_shared is null then
    raise exception 'setup: no shared account or expense category';
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', '__SUBJECT_USER_ID__', 'role', 'authenticated')::text, true);
  v_tx := public.create_manual_transaction(hh, 'expense', current_date, v_shared, v_cat, 8,
    'HH-1 hijack target', null, null, 'posted', 1, null);
  perform set_config('request.jwt.claims', json_build_object('sub', me, 'role', 'authenticated')::text, true);
  select e.id into v_entry from public.transaction_entries e where e.transaction_id = v_tx limit 1;

  insert into public.accounts (household_id, name, account_type, account_class, currency_code, private_owner_id, created_by)
  values (hh, 'HH-1 hijack probe', 'cash', 'asset', ccy, me, me) returning id into v_private;
  v_mine_tx := public.create_manual_transaction(hh, 'expense', current_date, v_private, v_cat, 1,
    'HH-1 hijack mine', null, null, 'posted', 1, null);

  begin
    insert into public.transaction_entries
      (household_id, transaction_id, account_id, amount_account_currency, currency_code, exchange_rate_to_base, amount_base_currency)
    values (hh, v_tx, v_private, 0.01, ccy, 1, 0.01);
    raise exception 'LEAK: a private leg was added to someone else''s transaction';
  exception when insufficient_privilege then null;
  end;

  begin
    update public.transaction_entries set account_id = v_private where id = v_entry;
    get diagnostics n = row_count;
    if n > 0 then
      raise exception 'LEAK: a leg of someone else''s transaction was moved into a private account';
    end if;
  exception when insufficient_privilege then null;
  end;

  -- Claiming to have created it first is refused too.
  begin
    update public.transactions set created_by = me where id = v_tx;
    get diagnostics n = row_count;
    if n > 0 then
      raise exception 'LEAK: the caller rewrote who created someone else''s transaction';
    end if;
  exception when others then
    if sqlerrm <> 'A transaction''s creator cannot be changed' then raise; end if;
  end;

  -- …and so is moving its leg or its allocation into the caller's own
  -- private transaction.
  begin
    update public.transaction_entries set transaction_id = v_mine_tx where id = v_entry;
    get diagnostics n = row_count;
    if n > 0 then
      raise exception 'LEAK: a leg of someone else''s transaction was moved into the caller''s';
    end if;
  exception when others then
    if sqlerrm <> 'A ledger row cannot be moved to another transaction' then raise; end if;
  end;
  begin
    update public.transaction_allocations set transaction_id = v_mine_tx where transaction_id = v_tx;
    get diagnostics n = row_count;
    if n > 0 then
      raise exception 'LEAK: an allocation of someone else''s transaction was moved into the caller''s';
    end if;
  exception when others then
    if sqlerrm <> 'A ledger row cannot be moved to another transaction' then raise; end if;
  end;

  if (select visibility from public.transactions where id = v_tx) <> 'shared'
     or (select created_by from public.transactions where id = v_tx) = me then
    raise exception 'LEAK: someone else''s transaction is no longer shared, or no longer theirs';
  end if;
end $$;
rollback;
