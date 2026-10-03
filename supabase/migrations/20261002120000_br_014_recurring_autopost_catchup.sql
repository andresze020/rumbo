-- ============================================================
-- App Finanzas — BR-014: recurring auto-post CATCH-UP
-- Target: Supabase / PostgreSQL
-- ------------------------------------------------------------
-- BUG. run_recurring_autopost() posted exactly ONE occurrence per template per
-- run. A template created with a start_date in the past (the app now leaves
-- next_run_date = start_date even when that is in the past) has several overdue
-- occurrences, and the daily job drained them at one per day.
--
-- FIX. For every due template the job now loops, posting each overdue
-- occurrence with transaction_date = THAT occurrence's date (not p_run_date),
-- advancing the cursor with advance_recurring_next_run(), until the cursor is
-- past p_run_date, or past end_date, or a safety cap is reached.
--
-- Base version: 20260730130000_uc_009_recurring_transfers.sql. No later
-- migration redefines run_recurring_autopost (20261001120000_mq_001 is
-- groundwork and explicitly leaves it alone). Every ledger rule of that
-- version is kept verbatim: income/expense = 1 entry + 1 allocation, transfer =
-- 2 balancing entries and NO allocation, cross-currency transfer is
-- flag-and-skip, archived/deleted account or category, amount > 0, FX = last
-- known rate (never a silent 1:1).
--
-- DESIGN DECISIONS
--
-- 1. Atomic per OCCURRENCE. Each occurrence runs in its own BEGIN/EXCEPTION
--    sub-block (a savepoint). The transaction, its entries, its allocation AND
--    the cursor advance are inside it, so a failure undoes only that
--    occurrence. Earlier occurrences of the same run stay posted, the loop for
--    that template STOPS (the cursor sits on the failing occurrence, so the
--    next run retries it and nothing is skipped or reordered), and the failure
--    is recorded exactly as before: last_error / last_error_at /
--    consecutive_failures on the template plus a 'failed' row in
--    recurring_autopost_log. Other templates are never affected. The failure
--    bookkeeping is itself wrapped so that even it cannot abort the batch.
--    PL/pgSQL local variables are NOT rolled back with a savepoint, so the
--    in-memory cursor (v_cur) and the counter are only assigned as the very
--    last statements of the success path.
--
-- 2. Safety cap: 100 occurrences per template per run. A daily template that
--    is years behind would otherwise post thousands of rows in one job
--    transaction. At the cap the loop simply stops with the cursor where it
--    is; the next daily run continues. Nothing is lost, it just converges over
--    several nights.
--
-- 3. end_date. Same semantics as before: after posting an occurrence, if the
--    NEXT date is past end_date the template is deactivated. New, defensive:
--    an occurrence dated after end_date is never posted — if an active
--    template's cursor is already past end_date (e.g. end_date edited earlier
--    than next_run_date) it is deactivated instead of posting once more.
--
-- 4. recurring_autopost_log. There is NO unique key or index on
--    (recurring_id, run_date) — the table only has the two non-unique indexes
--    from BR-014 (the MQ-001 migration comment that mentions a "unique key" is
--    mistaken). So several 'posted' rows with the same (recurring_id, run_date)
--    are legal and nothing had to change: one row per posted occurrence, with
--    run_date = p_run_date (when the job ran) and transaction_id pointing at
--    the transaction whose transaction_date is the occurrence date. No unique
--    index is added on purpose: historical 'failed' rows can already repeat
--    for the same pair, and it would make this migration fail on real data.
--    Idempotency does not need the log; it comes from the cursor.
--
-- 5. Idempotency and concurrency. Running twice with the same p_run_date posts
--    nothing the second time (the cursor is already past it). The template
--    rows are selected FOR UPDATE SKIP LOCKED: two overlapping runs (cron
--    retry, manual call) never work on the same template, and the row lock is
--    held until the job transaction ends, so a user editing the template
--    waits instead of racing the cursor. A locked template is simply left for
--    the next run.
--
-- Signature and return type are unchanged (returns the number of occurrences
-- posted), so `create or replace` replaces the function in place — no
-- overload is created and no DROP is needed. The ACL of the existing function
-- is preserved by create or replace; the revoke below is re-stated as in the
-- previous versions.
-- ============================================================

create or replace function public.run_recurring_autopost(
  p_run_date date default current_date
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Max occurrences posted (or attempted) per template per run.
  c_max_per_template constant integer := 100;

  v_rec record;
  v_base_currency varchar(3);
  v_account_currency varchar(3);
  v_account_archived boolean;
  v_account_deleted timestamptz;
  v_to_currency varchar(3);
  v_to_archived boolean;
  v_to_deleted timestamptz;
  v_category_reporting text;
  v_category_archived boolean;
  v_category_deleted timestamptz;
  v_rate numeric(18,8);
  v_signed numeric(18,4);
  v_alloc_type text;
  v_txn_id uuid;
  v_next date;
  v_cur date;          -- occurrence being processed (the in-memory cursor)
  v_iter integer;
  v_failed boolean;
  v_posted integer := 0;
  v_error text;
begin
  for v_rec in
    select r.*
    from public.recurring_transactions r
    where r.auto_post = true
      and r.is_active = true
      and r.next_run_date is not null
      and r.next_run_date <= p_run_date
    order by r.next_run_date asc, r.id asc
    for update of r skip locked
  loop
    v_cur := v_rec.next_run_date;
    v_iter := 0;
    v_failed := false;

    while v_cur <= p_run_date and v_iter < c_max_per_template loop
      v_iter := v_iter + 1;

      -- Never post an occurrence dated after end_date; retire the template.
      if v_rec.end_date is not null and v_cur > v_rec.end_date then
        update public.recurring_transactions
        set is_active = false,
            updated_at = now()
        where id = v_rec.id;
        exit;
      end if;

      -- Per-occurrence block: a failure undoes ONLY this occurrence.
      begin
        if v_rec.transaction_type not in ('income', 'expense', 'transfer') then
          raise exception 'Only income, expense and transfer templates can auto-post.';
        end if;

        if v_rec.account_id is null then
          raise exception 'Template is missing an account.';
        end if;

        if v_rec.amount is null or v_rec.amount <= 0 then
          raise exception 'Template amount must be greater than 0.';
        end if;

        select h.base_currency into v_base_currency
        from public.households h where h.id = v_rec.household_id;

        select a.currency_code, a.is_archived, a.deleted_at
        into v_account_currency, v_account_archived, v_account_deleted
        from public.accounts a
        where a.id = v_rec.account_id and a.household_id = v_rec.household_id;

        if v_account_currency is null then
          raise exception 'Account not found for this household.';
        end if;
        if v_account_archived or v_account_deleted is not null then
          raise exception 'Account is archived or deleted.';
        end if;

        -- FX: last known rate for the account currency (1 for base currency).
        -- Shared by both branches; a transfer values both of its legs at the
        -- source rate, which is what keeps a same-currency move base-neutral.
        if v_account_currency = v_base_currency then
          v_rate := 1;
        else
          select te.exchange_rate_to_base
          into v_rate
          from public.transaction_entries te
          where te.household_id = v_rec.household_id
            and te.currency_code = v_account_currency
            and te.exchange_rate_to_base > 0
          order by te.created_at desc
          limit 1;

          if v_rate is null then
            raise exception 'No known exchange rate for % to %; post one manually first.',
              v_account_currency, v_base_currency;
          end if;
        end if;

        if v_rec.transaction_type = 'transfer' then
          -- ── UC-9: transfer ──────────────────────────────────────────────
          if v_rec.to_account_id is null then
            raise exception 'Transfer template is missing its destination account.';
          end if;

          select a.currency_code, a.is_archived, a.deleted_at
          into v_to_currency, v_to_archived, v_to_deleted
          from public.accounts a
          where a.id = v_rec.to_account_id and a.household_id = v_rec.household_id;

          if v_to_currency is null then
            raise exception 'Destination account not found for this household.';
          end if;
          if v_to_archived or v_to_deleted is not null then
            raise exception 'Destination account is archived or deleted.';
          end if;

          -- Flag and skip: the amount received is a real value only the user
          -- knows, so an unattended job must not invent it. The cursor stays
          -- on this occurrence and the template can be posted by hand.
          if v_to_currency <> v_account_currency then
            raise exception
              'Cross-currency transfers cannot post automatically — the amount received in % must be entered. Post this one manually.',
              v_to_currency;
          end if;

          insert into public.transactions (
            household_id, transaction_type, transaction_date,
            description, notes, status, source, created_by
          )
          values (
            v_rec.household_id, 'transfer', v_cur,
            v_rec.name, 'Auto-posted from a recurring template',
            'posted', 'system', v_rec.created_by
          )
          returning id into v_txn_id;

          -- Two balancing entries at the same rate: net zero in base currency.
          insert into public.transaction_entries (
            household_id, transaction_id, account_id,
            amount_account_currency, currency_code,
            exchange_rate_to_base, amount_base_currency, entry_type, notes
          )
          values
            (v_rec.household_id, v_txn_id, v_rec.account_id,
             -v_rec.amount, v_account_currency,
             v_rate, (-v_rec.amount * v_rate)::numeric(18,4), 'movement', 'Transfer out'),
            (v_rec.household_id, v_txn_id, v_rec.to_account_id,
             v_rec.amount, v_to_currency,
             v_rate, (v_rec.amount * v_rate)::numeric(18,4), 'movement', 'Transfer in');

          -- No allocation: a transfer is not income or expense.

        else
          -- ── income / expense ────────────────────────────────────────────
          if v_rec.category_id is null then
            raise exception 'Template is missing a category.';
          end if;

          select c.reporting_type, c.is_archived, c.deleted_at
          into v_category_reporting, v_category_archived, v_category_deleted
          from public.categories c
          where c.id = v_rec.category_id and c.household_id = v_rec.household_id;

          if v_category_reporting is null then
            raise exception 'Category not found for this household.';
          end if;
          if v_category_archived or v_category_deleted is not null then
            raise exception 'Category is archived or deleted.';
          end if;
          if v_rec.transaction_type = 'income' and v_category_reporting <> 'income' then
            raise exception 'Income template requires an income category.';
          end if;
          if v_rec.transaction_type = 'expense' and v_category_reporting not in ('expense', 'debt_interest') then
            raise exception 'Expense template requires an expense category.';
          end if;

          if v_rec.transaction_type = 'income' then
            v_signed := v_rec.amount;
            v_alloc_type := 'income';
          else
            v_signed := -v_rec.amount;
            v_alloc_type := 'expense';
          end if;

          insert into public.transactions (
            household_id, transaction_type, transaction_date,
            description, payee_id, notes, status, source, created_by
          )
          values (
            v_rec.household_id, v_rec.transaction_type, v_cur,
            v_rec.name, v_rec.payee_id, 'Auto-posted from a recurring template',
            'posted', 'system', v_rec.created_by
          )
          returning id into v_txn_id;

          insert into public.transaction_entries (
            household_id, transaction_id, account_id,
            amount_account_currency, currency_code,
            exchange_rate_to_base, amount_base_currency, entry_type
          )
          values (
            v_rec.household_id, v_txn_id, v_rec.account_id,
            v_signed, v_account_currency,
            v_rate, (v_signed * v_rate)::numeric(18,4), 'movement'
          );

          insert into public.transaction_allocations (
            household_id, transaction_id, category_id, allocation_type,
            amount_original_currency, currency_code, exchange_rate_to_base, amount_base_currency
          )
          values (
            v_rec.household_id, v_txn_id, v_rec.category_id, v_alloc_type,
            v_rec.amount, v_account_currency, v_rate, (v_rec.amount * v_rate)::numeric(18,4)
          );
        end if;

        -- Advance one step; deactivate once past end_date.
        v_next := public.advance_recurring_next_run(v_cur, v_rec.frequency);
        if v_next <= v_cur then
          -- Cannot happen with the current frequency set; guards a runaway loop.
          raise exception 'Recurrence did not advance (% -> %).', v_cur, v_next;
        end if;

        update public.recurring_transactions
        set next_run_date = v_next,
            is_active = case
              when v_rec.end_date is not null and v_next > v_rec.end_date then false
              else is_active
            end,
            last_auto_post_at = now(),
            last_error = null,
            last_error_at = null,
            consecutive_failures = 0,
            updated_at = now()
        where id = v_rec.id;

        insert into public.recurring_autopost_log (
          household_id, recurring_id, run_date, status, transaction_id
        )
        values (v_rec.household_id, v_rec.id, p_run_date, 'posted', v_txn_id);

        -- LAST statements of the success path: plpgsql variables are not
        -- rolled back with the savepoint, so only move them once nothing in
        -- this occurrence can fail any more.
        v_posted := v_posted + 1;
        v_cur := v_next;

      exception when others then
        -- Everything this occurrence wrote (transaction, entries, allocation,
        -- cursor advance, log row) has been rolled back. Earlier occurrences
        -- of this run are untouched.
        v_error := SQLERRM;
        v_failed := true;
        begin
          update public.recurring_transactions
          set last_error = v_error,
              last_error_at = now(),
              consecutive_failures = consecutive_failures + 1,
              updated_at = now()
          where id = v_rec.id;

          insert into public.recurring_autopost_log (
            household_id, recurring_id, run_date, status, error
          )
          values (v_rec.household_id, v_rec.id, p_run_date, 'failed', v_error);
        exception when others then
          -- Bookkeeping must never abort the batch.
          raise warning 'run_recurring_autopost: could not record failure for template %: %',
            v_rec.id, SQLERRM;
        end;
      end;

      -- A failure stops this template (cursor stays on the failing
      -- occurrence); the batch moves on to the next template.
      exit when v_failed;

      -- Past end_date: the template was deactivated by the update above.
      exit when v_rec.end_date is not null and v_cur > v_rec.end_date;
    end loop;

    if not v_failed and v_cur <= p_run_date
       and (v_rec.end_date is null or v_cur <= v_rec.end_date) then
      raise notice 'run_recurring_autopost: template % hit the % occurrence cap; resuming from % next run.',
        v_rec.id, c_max_per_template, v_cur;
    end if;
  end loop;

  return v_posted;
end;
$$;

-- This SECURITY DEFINER job bypasses RLS and posts across
-- every household, so only the scheduler (pg_cron, running as the table
-- owner) and DB admins may call it. Supabase grants EXECUTE on new public
-- functions to anon and authenticated by default, and "from public" does not
-- remove those, so they are revoked by name (the cap bounds what one call can
-- do, but a caller must not be able to run it at all). Nothing in the app
-- calls it.
revoke all on function public.run_recurring_autopost(date) from public, anon, authenticated;

-- The existing daily `recurring-autopost` cron job picks this up with no
-- change — same function name, same signature.

-- ------------------------------------------------------------
-- Rollback (manual): re-run the `create or replace function
-- public.run_recurring_autopost(date)` block from
-- 20260730130000_uc_009_recurring_transfers.sql (same signature, so it
-- replaces this version in place). Posted data is not touched by a rollback.
-- ------------------------------------------------------------
