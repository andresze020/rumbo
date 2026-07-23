-- ============================================================
-- App Finanzas — br_024_csv_import_presets_revert.sql
-- BR-024: saved column-mapping presets + import revert.
-- ------------------------------------------------------------
-- Two independent quality-of-life additions to the CSV importer:
--   1. `csv_import_presets` — a per-household named mapping (which CSV column
--      feeds which transaction field, plus an optional default account). Lets a
--      user who imports the same bank export every month skip re-mapping. Unlike
--      financial records these are plain config, so a full delete policy is fine.
--   2. `revert_csv_import(batch)` — undoes a whole import: soft-deletes every
--      transaction the batch created (ledger-safe — rows are kept, just marked
--      deleted_soft so they drop out of lists, balances, and reports) and marks
--      the batch `reverted`. Idempotent-guarded (a batch can only be reverted
--      once).
--
-- ADDITIVE. Depends on: public.households, public.accounts, public.transactions,
-- public.import_batches, public.set_updated_at(),
-- public.is_household_member(uuid), public.is_household_editor(uuid).
-- ============================================================

-- ── 1. Saved mapping presets ────────────────────────────────────────────────
create table if not exists public.csv_import_presets (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  -- The client CsvMapping object: { transaction_date, amount, description,
  -- account, category, merchant_name, currency, notes, transaction_type }.
  mapping jsonb not null default '{}'::jsonb,
  -- Optional default target account remembered with the preset. Set null if the
  -- account is later deleted, so the preset itself survives.
  target_account_id uuid references public.accounts(id) on delete set null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint csv_import_presets_name_not_blank_chk check (length(trim(name)) > 0)
);

create unique index if not exists idx_csv_import_presets_household_name_unique
  on public.csv_import_presets(household_id, lower(name));

create index if not exists idx_csv_import_presets_household
  on public.csv_import_presets(household_id);

drop trigger if exists trg_csv_import_presets_updated_at on public.csv_import_presets;
create trigger trg_csv_import_presets_updated_at
before update on public.csv_import_presets
for each row execute function public.set_updated_at();

alter table public.csv_import_presets enable row level security;

drop policy if exists "csv_import_presets_select_member" on public.csv_import_presets;
create policy "csv_import_presets_select_member"
on public.csv_import_presets for select to authenticated
using (public.is_household_member(household_id));

drop policy if exists "csv_import_presets_insert_editor" on public.csv_import_presets;
create policy "csv_import_presets_insert_editor"
on public.csv_import_presets for insert to authenticated
with check (
  public.is_household_editor(household_id)
  and created_by = auth.uid()
);

drop policy if exists "csv_import_presets_update_editor" on public.csv_import_presets;
create policy "csv_import_presets_update_editor"
on public.csv_import_presets for update to authenticated
using (public.is_household_editor(household_id))
with check (public.is_household_editor(household_id));

drop policy if exists "csv_import_presets_delete_editor" on public.csv_import_presets;
create policy "csv_import_presets_delete_editor"
on public.csv_import_presets for delete to authenticated
using (public.is_household_editor(household_id));

-- ── 2. Allow a batch to be marked reverted ──────────────────────────────────
alter table public.import_batches drop constraint if exists import_batches_status_chk;
alter table public.import_batches add constraint import_batches_status_chk
  check (status in (
    'uploaded', 'mapped', 'validated', 'imported', 'partial', 'failed', 'reverted'
  ));

-- ── 3. Revert a whole import ────────────────────────────────────────────────
create or replace function public.revert_csv_import(p_batch_id uuid)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_household_id uuid;
  v_status text;
  v_deleted_at timestamptz;
  v_reverted integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if p_batch_id is null then
    raise exception 'batch id is required';
  end if;

  select household_id, status, deleted_at
  into v_household_id, v_status, v_deleted_at
  from public.import_batches
  where id = p_batch_id;

  if v_household_id is null then
    raise exception 'import batch not found';
  end if;

  if not public.is_household_editor(v_household_id) then
    raise exception 'Not authorized to revert imports for this household';
  end if;

  if v_deleted_at is not null then
    raise exception 'This import batch is no longer available';
  end if;

  if v_status = 'reverted' then
    raise exception 'This import has already been reverted';
  end if;

  -- Soft-delete every still-live transaction the batch created. Ledger rows are
  -- preserved (deleted_soft) for traceability; balances, lists, and reports all
  -- exclude deleted_at-not-null / deleted_soft rows.
  update public.transactions
  set
    status = 'deleted_soft',
    deleted_at = now(),
    deleted_by = auth.uid(),
    updated_by = auth.uid()
  where household_id = v_household_id
    and import_batch_id = p_batch_id
    and deleted_at is null;

  get diagnostics v_reverted = row_count;

  update public.import_batches
  set
    status = 'reverted',
    metadata = metadata || jsonb_build_object(
      'revert', jsonb_build_object(
        'revertedAt', now(),
        'revertedBy', auth.uid(),
        'revertedTransactions', v_reverted
      )
    )
  where id = p_batch_id;

  return v_reverted;
end;
$$;

grant execute on function public.revert_csv_import(uuid) to authenticated;
