-- ============================================================
-- App Finanzas — unvoid_transaction_rpc.sql
-- BR-015: Undo for "void transaction"
-- Target: Supabase / PostgreSQL
--
-- Reverses public.void_transaction: restores a voided transaction back to a
-- live posting status (posted/pending) and clears the void metadata. The
-- underlying ledger rows were never touched by voiding, so balances and
-- reports re-derive automatically once the status flips back.
--
-- The original posting status isn't stored on the row, so the caller passes
-- the status to restore to (captured client-side just before voiding). It is
-- validated here and constrained to posted/pending.
-- ============================================================

create or replace function public.unvoid_transaction(
  p_transaction_id uuid,
  p_restore_status text default 'posted'
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_household_id uuid;
  v_status text;
  v_deleted_at timestamptz;
  v_restore_status text;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if p_transaction_id is null then
    raise exception 'transaction_id is required';
  end if;

  v_restore_status := coalesce(nullif(trim(p_restore_status), ''), 'posted');
  if v_restore_status not in ('posted', 'pending') then
    raise exception 'Can only restore a transaction to posted or pending';
  end if;

  select
    t.household_id,
    t.status,
    t.deleted_at
  into
    v_household_id,
    v_status,
    v_deleted_at
  from public.transactions t
  where t.id = p_transaction_id;

  if v_household_id is null then
    raise exception 'transaction not found';
  end if;

  if not public.is_household_editor(v_household_id) then
    raise exception 'Not authorized to restore transactions for this household';
  end if;

  if v_deleted_at is not null then
    raise exception 'Cannot restore a deleted transaction';
  end if;

  if v_status <> 'voided' then
    raise exception 'Only voided transactions can be restored';
  end if;

  update public.transactions
  set
    status = v_restore_status,
    voided_at = null,
    voided_by = null,
    void_reason = null,
    updated_by = auth.uid()
  where id = p_transaction_id
    and household_id = v_household_id;

  return p_transaction_id;
end;
$$;

grant execute on function public.unvoid_transaction(uuid, text)
to authenticated;
