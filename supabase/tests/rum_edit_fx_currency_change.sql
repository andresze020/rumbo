-- ============================================================
-- Rumbo — EDIT-FX: update_manual_transaction and currency changes
-- ------------------------------------------------------------
-- Replace `__HOUSEHOLD_ID__` and run via `npm run db:test` (as a household
-- editor, i.e. with --user). Every probe is a `begin; … rollback;` block.
--
-- Moving a transaction to an account in another currency used to keep the old
-- exchange rate (50,000 COP stored as 50,000 CAD base). The edit is now
-- refused; a move between same-currency accounts still works.
-- ============================================================

-- check: update_manual_transaction rejects a move to an account in another currency and accepts a same-currency move
begin;
do $$
declare
  hh constant uuid := '__HOUSEHOLD_ID__';
  ccy text := (select h.base_currency from public.households h where h.id = hh);
  v_cat uuid;
  v_a uuid;
  v_b uuid;
  v_foreign uuid;
  v_tx uuid;
  v_rejected boolean := false;
  r record;
begin
  select c.id into v_cat from public.categories c
  where c.household_id = hh and c.reporting_type = 'expense' and c.deleted_at is null and not c.is_archived
  order by c.sort_order limit 1;
  select a.id into v_a from public.accounts a
  where a.household_id = hh and a.private_owner_id is null and a.deleted_at is null and not a.is_archived
    and a.currency_code = ccy
  order by a.created_at limit 1;
  select a.id into v_b from public.accounts a
  where a.household_id = hh and a.private_owner_id is null and a.deleted_at is null and not a.is_archived
    and a.currency_code = ccy and a.id <> v_a
  order by a.created_at limit 1;
  select a.id into v_foreign from public.accounts a
  where a.household_id = hh and a.private_owner_id is null and a.deleted_at is null and not a.is_archived
    and a.currency_code <> ccy
  order by a.created_at limit 1;
  if v_cat is null or v_a is null or v_b is null then
    raise exception 'setup: need two shared base-currency accounts and an expense category';
  end if;

  v_tx := public.create_manual_transaction(hh, 'expense', current_date, v_a, v_cat, 50000,
    'edit-fx probe', null, null, 'posted', 1, null);

  -- Same currency: accepted, and the base amount is untouched by the move.
  perform public.update_manual_transaction(v_tx, v_b, v_cat, 50000, current_date);
  select e.account_id, e.currency_code, e.amount_base_currency into r
  from public.transaction_entries e where e.transaction_id = v_tx;
  if r.account_id <> v_b or r.currency_code <> ccy or r.amount_base_currency <> -50000 then
    raise exception 'same-currency move was not applied cleanly (account %, ccy %, base %)',
      r.account_id, r.currency_code, r.amount_base_currency;
  end if;

  -- Other currency: refused (skipped when the household has no foreign account).
  if v_foreign is null then
    raise notice 'edit-fx: household has no foreign-currency account, cross-currency half skipped';
    return;
  end if;
  begin
    perform public.update_manual_transaction(v_tx, v_foreign, v_cat, 50000, current_date);
  exception when others then
    if sqlerrm <> 'This account uses a different currency. To move the transaction there, void it and record it again.' then
      raise exception 'unexpected error on cross-currency move: %', sqlerrm;
    end if;
    v_rejected := true;
  end;
  if not v_rejected then
    raise exception 'cross-currency move was accepted';
  end if;

  -- The refused edit left the ledger as it was.
  select e.account_id, e.currency_code, e.amount_base_currency into r
  from public.transaction_entries e where e.transaction_id = v_tx;
  if r.account_id <> v_b or r.currency_code <> ccy or r.amount_base_currency <> -50000 then
    raise exception 'refused edit changed the entry (account %, ccy %, base %)',
      r.account_id, r.currency_code, r.amount_base_currency;
  end if;
end $$;
rollback;
