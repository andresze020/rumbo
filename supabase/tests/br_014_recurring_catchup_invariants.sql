-- ============================================================
-- Rumbo — BR-014 recurring auto-post CATCH-UP behaviour
-- ------------------------------------------------------------
-- Same runner and style as `br_019_goals_invariants.sql`: replace
-- `__HOUSEHOLD_ID__` with a real household id and run via `npm run db:test`.
-- Each block is a `-- check:` do-block inside `begin; ... rollback;`: it
-- creates a throwaway template, calls `run_recurring_autopost()`, asserts, and
-- rolls everything back — nothing is persisted. A failed assert is a failure.
--
-- Notes for whoever runs this against the live project:
--   * `run_recurring_autopost` is revoked from PUBLIC, so the block runs
--     `reset role` first (back to the connection's own role) after capturing
--     auth.uid(). That is the only privilege step and it is inside the rolled
--     back transaction.
--   * The job is global: it also processes any OTHER household's due template
--     inside the transaction (then rolled back). Assertions therefore look only
--     at the throwaway template, never at the function's return value.
--   * The mid-failure block creates a trigger on public.transactions to force
--     the 3rd occurrence to fail. CREATE TRIGGER briefly takes a
--     SHARE ROW EXCLUSIVE lock on that table until the rollback (milliseconds
--     to a couple of seconds): writes to transactions wait, reads do not.
--   * Needs one active base-currency account and one active expense category
--     in the household (the fixtures and any real household have them).
--   * 100 below mirrors c_max_per_template in the migration
--     20261002120000_br_014_recurring_autopost_catchup.sql.
-- ============================================================

-- check: BR-014 catch-up posts every overdue occurrence on its own date, once
begin;

do $test$
declare
  v_household uuid := '__HOUSEHOLD_ID__'::uuid;
  v_user uuid;
  v_account uuid;
  v_category uuid;
  v_currency varchar(3);
  v_rec uuid;
  v_run date := current_date;
  v_txns integer;
  v_dates integer;
  v_min date;
  v_max date;
  v_entries integer;
  v_allocs integer;
  v_cursor date;
  v_active boolean;
begin
  v_user := coalesce(
    auth.uid(),
    (select m.user_id from public.household_members m
      where m.household_id = v_household and m.status = 'active'
      order by m.created_at limit 1)
  );
  execute 'reset role';

  select h.base_currency into v_currency from public.households h where h.id = v_household;
  select a.id into v_account from public.accounts a
    where a.household_id = v_household and not a.is_archived and a.deleted_at is null
      and a.currency_code = v_currency
    order by a.created_at limit 1;
  select c.id into v_category from public.categories c
    where c.household_id = v_household and c.reporting_type = 'expense'
      and not c.is_archived and c.deleted_at is null
    order by c.created_at limit 1;
  assert v_account is not null, 'needs an active base-currency account in the household';
  assert v_category is not null, 'needs an active expense category in the household';

  -- Weekly, first occurrence 3 weeks ago: due on run-21, run-14, run-7, run.
  insert into public.recurring_transactions (
    household_id, name, transaction_type, account_id, category_id, amount,
    currency_code, frequency, start_date, next_run_date, auto_post, is_active, created_by
  ) values (
    v_household, 'BR-014 catch-up test', 'expense', v_account, v_category, 10,
    v_currency, 'weekly', v_run - 21, v_run - 21, true, true, v_user
  ) returning id into v_rec;

  perform public.run_recurring_autopost(v_run);

  select count(*), count(distinct t.transaction_date), min(t.transaction_date), max(t.transaction_date)
    into v_txns, v_dates, v_min, v_max
  from public.recurring_autopost_log l
  join public.transactions t on t.id = l.transaction_id
  where l.recurring_id = v_rec and l.status = 'posted';

  assert v_txns = 4, format('expected 4 posted occurrences, got %s', v_txns);
  assert v_dates = 4, format('expected 4 distinct transaction dates, got %s', v_dates);
  assert v_min = v_run - 21 and v_max = v_run,
    'occurrences must be dated by their own next_run_date, not by p_run_date';

  -- Ledger shape: 1 entry (-10) + 1 allocation per expense occurrence.
  select count(*) into v_entries
  from public.recurring_autopost_log l
  join public.transaction_entries e on e.transaction_id = l.transaction_id
  where l.recurring_id = v_rec and l.status = 'posted' and e.amount_account_currency = -10;
  select count(*) into v_allocs
  from public.recurring_autopost_log l
  join public.transaction_allocations al on al.transaction_id = l.transaction_id
  where l.recurring_id = v_rec and l.status = 'posted'
    and al.allocation_type = 'expense' and al.amount_original_currency = 10;
  assert v_entries = 4 and v_allocs = 4, 'each occurrence needs exactly one -10 entry and one 10 allocation';

  select r.next_run_date, r.is_active into v_cursor, v_active
  from public.recurring_transactions r where r.id = v_rec;
  assert v_cursor = v_run + 7, format('cursor should be run+7, got %s', v_cursor);
  assert v_cursor > v_run and v_active, 'cursor must be past the run date and the template still active';

  -- Idempotent: the same run date again posts nothing for this template.
  perform public.run_recurring_autopost(v_run);
  select count(*) into v_txns
  from public.recurring_autopost_log l
  where l.recurring_id = v_rec and l.status = 'posted';
  assert v_txns = 4, format('second run with same date must not post again, got %s', v_txns);
end
$test$;

rollback;

-- check: BR-014 catch-up respects end_date (no occurrence after it, template retired)
begin;

do $test$
declare
  v_household uuid := '__HOUSEHOLD_ID__'::uuid;
  v_user uuid;
  v_account uuid;
  v_category uuid;
  v_currency varchar(3);
  v_rec uuid;
  v_run date := current_date;
  v_txns integer;
  v_max date;
  v_active boolean;
begin
  v_user := coalesce(
    auth.uid(),
    (select m.user_id from public.household_members m
      where m.household_id = v_household and m.status = 'active'
      order by m.created_at limit 1)
  );
  execute 'reset role';

  select h.base_currency into v_currency from public.households h where h.id = v_household;
  select a.id into v_account from public.accounts a
    where a.household_id = v_household and not a.is_archived and a.deleted_at is null
      and a.currency_code = v_currency
    order by a.created_at limit 1;
  select c.id into v_category from public.categories c
    where c.household_id = v_household and c.reporting_type = 'expense'
      and not c.is_archived and c.deleted_at is null
    order by c.created_at limit 1;
  assert v_account is not null and v_category is not null, 'needs an account and an expense category';

  -- Due run-21, run-14, run-7, run; ends run-10 -> only run-21 and run-14 post.
  insert into public.recurring_transactions (
    household_id, name, transaction_type, account_id, category_id, amount,
    currency_code, frequency, start_date, end_date, next_run_date, auto_post, is_active, created_by
  ) values (
    v_household, 'BR-014 end_date test', 'expense', v_account, v_category, 10,
    v_currency, 'weekly', v_run - 21, v_run - 10, v_run - 21, true, true, v_user
  ) returning id into v_rec;

  perform public.run_recurring_autopost(v_run);

  select count(*), max(t.transaction_date) into v_txns, v_max
  from public.recurring_autopost_log l
  join public.transactions t on t.id = l.transaction_id
  where l.recurring_id = v_rec and l.status = 'posted';
  select r.is_active into v_active from public.recurring_transactions r where r.id = v_rec;

  assert v_txns = 2, format('expected 2 occurrences up to end_date, got %s', v_txns);
  assert v_max = v_run - 14, 'no occurrence may be dated after end_date';
  assert v_active = false, 'template must be deactivated once the next date passes end_date';
end
$test$;

rollback;

-- check: BR-014 catch-up stops at the 100-occurrence cap and the next run resumes
begin;

do $test$
declare
  v_household uuid := '__HOUSEHOLD_ID__'::uuid;
  v_user uuid;
  v_account uuid;
  v_category uuid;
  v_currency varchar(3);
  v_rec uuid;
  v_run date := current_date;
  v_txns integer;
  v_cursor date;
begin
  v_user := coalesce(
    auth.uid(),
    (select m.user_id from public.household_members m
      where m.household_id = v_household and m.status = 'active'
      order by m.created_at limit 1)
  );
  execute 'reset role';

  select h.base_currency into v_currency from public.households h where h.id = v_household;
  select a.id into v_account from public.accounts a
    where a.household_id = v_household and not a.is_archived and a.deleted_at is null
      and a.currency_code = v_currency
    order by a.created_at limit 1;
  select c.id into v_category from public.categories c
    where c.household_id = v_household and c.reporting_type = 'expense'
      and not c.is_archived and c.deleted_at is null
    order by c.created_at limit 1;
  assert v_account is not null and v_category is not null, 'needs an account and an expense category';

  -- Daily, 150 days behind: 151 occurrences due (run-150 .. run).
  insert into public.recurring_transactions (
    household_id, name, transaction_type, account_id, category_id, amount,
    currency_code, frequency, start_date, next_run_date, auto_post, is_active, created_by
  ) values (
    v_household, 'BR-014 cap test', 'expense', v_account, v_category, 1,
    v_currency, 'daily', v_run - 150, v_run - 150, true, true, v_user
  ) returning id into v_rec;

  perform public.run_recurring_autopost(v_run);
  select count(*) into v_txns from public.recurring_autopost_log l
    where l.recurring_id = v_rec and l.status = 'posted';
  select r.next_run_date into v_cursor from public.recurring_transactions r where r.id = v_rec;
  assert v_txns = 100, format('first run must stop at the cap of 100, got %s', v_txns);
  assert v_cursor = v_run - 50, format('cursor should rest at run-50, got %s', v_cursor);

  perform public.run_recurring_autopost(v_run);
  select count(*) into v_txns from public.recurring_autopost_log l
    where l.recurring_id = v_rec and l.status = 'posted';
  select r.next_run_date into v_cursor from public.recurring_transactions r where r.id = v_rec;
  assert v_txns = 151, format('second run must finish the remaining 51, total %s', v_txns);
  assert v_cursor = v_run + 1, format('cursor should end at run+1, got %s', v_cursor);
end
$test$;

rollback;

-- check: BR-014 a mid-way failure rolls back only that occurrence, keeps the earlier ones, stops, and recovers
begin;

do $test$
declare
  v_household uuid := '__HOUSEHOLD_ID__'::uuid;
  v_user uuid;
  v_account uuid;
  v_category uuid;
  v_currency varchar(3);
  v_rec uuid;
  v_run date := current_date;
  v_txns integer;
  v_failed integer;
  v_cursor date;
  v_failures integer;
  v_error text;
  v_orphans integer;
begin
  v_user := coalesce(
    auth.uid(),
    (select m.user_id from public.household_members m
      where m.household_id = v_household and m.status = 'active'
      order by m.created_at limit 1)
  );
  execute 'reset role';

  select h.base_currency into v_currency from public.households h where h.id = v_household;
  select a.id into v_account from public.accounts a
    where a.household_id = v_household and not a.is_archived and a.deleted_at is null
      and a.currency_code = v_currency
    order by a.created_at limit 1;
  select c.id into v_category from public.categories c
    where c.household_id = v_household and c.reporting_type = 'expense'
      and not c.is_archived and c.deleted_at is null
    order by c.created_at limit 1;
  assert v_account is not null and v_category is not null, 'needs an account and an expense category';

  -- Force the 3rd occurrence (run-7) of THIS template to fail at insert time.
  -- Dropped by the rollback; matches nothing else (description + date).
  execute $f$
    create function public._br014_force_failure() returns trigger
    language plpgsql as $body$
    begin
      if new.description = 'BR-014 midfail test' and new.transaction_date = current_date - 7 then
        raise exception 'forced failure for BR-014 test';
      end if;
      return new;
    end
    $body$
  $f$;
  execute 'create trigger trg_br014_force_failure before insert on public.transactions
           for each row execute function public._br014_force_failure()';

  insert into public.recurring_transactions (
    household_id, name, transaction_type, account_id, category_id, amount,
    currency_code, frequency, start_date, next_run_date, auto_post, is_active, created_by
  ) values (
    v_household, 'BR-014 midfail test', 'expense', v_account, v_category, 10,
    v_currency, 'weekly', v_run - 21, v_run - 21, true, true, v_user
  ) returning id into v_rec;

  perform public.run_recurring_autopost(v_run);

  select count(*) into v_txns from public.recurring_autopost_log l
    where l.recurring_id = v_rec and l.status = 'posted';
  select count(*) into v_failed from public.recurring_autopost_log l
    where l.recurring_id = v_rec and l.status = 'failed' and l.transaction_id is null;
  select r.next_run_date, r.consecutive_failures, r.last_error
    into v_cursor, v_failures, v_error
  from public.recurring_transactions r where r.id = v_rec;

  assert v_txns = 2, format('the two occurrences before the failure must stay posted, got %s', v_txns);
  assert v_failed = 1, format('exactly one failed log row expected, got %s', v_failed);
  assert v_cursor = v_run - 7, format('cursor must stay on the failing occurrence, got %s', v_cursor);
  assert v_failures = 1 and v_error like '%forced failure%',
    'consecutive_failures and last_error must record the failure';

  -- The failed occurrence left nothing behind: no transaction on that date,
  -- and no 3rd/4th occurrence was attempted.
  select count(*) into v_orphans from public.transactions t
    where t.household_id = v_household and t.description = 'BR-014 midfail test'
      and t.transaction_date >= v_run - 7;
  assert v_orphans = 0, 'failed occurrence (and later ones) must not exist in the ledger';

  -- Remove the cause and run again: the remaining occurrences post, errors clear.
  execute 'drop trigger trg_br014_force_failure on public.transactions';
  perform public.run_recurring_autopost(v_run);

  select count(*) into v_txns from public.recurring_autopost_log l
    where l.recurring_id = v_rec and l.status = 'posted';
  select r.next_run_date, r.consecutive_failures, r.last_error
    into v_cursor, v_failures, v_error
  from public.recurring_transactions r where r.id = v_rec;
  assert v_txns = 4, format('recovery run must post the remaining 2, total %s', v_txns);
  assert v_cursor = v_run + 7, format('cursor should end at run+7, got %s', v_cursor);
  assert v_failures = 0 and v_error is null, 'success must reset consecutive_failures and last_error';
end
$test$;

rollback;

-- check: BR-014 the autopost job is not callable by app roles (SECURITY DEFINER, all households)
do $test$
begin
  assert not has_function_privilege('anon', 'public.run_recurring_autopost(date)', 'execute'),
    'anon must not be able to execute run_recurring_autopost';
  assert not has_function_privilege('authenticated', 'public.run_recurring_autopost(date)', 'execute'),
    'authenticated must not be able to execute run_recurring_autopost';
end
$test$;
