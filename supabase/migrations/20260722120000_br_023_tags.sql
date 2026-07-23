-- ============================================================
-- App Finanzas — br_023_tags.sql
-- BR-023: flexible transaction tags (many-to-many).
-- ------------------------------------------------------------
-- Categories answer "what kind of spending is this?" (one per transaction,
-- drives reports/budgets). Tags are an orthogonal, free-form slicing layer:
-- a transaction can carry many (e.g. "vacation-2026", "reimbursable",
-- "tax-deductible") and they never touch the ledger, reports, or budgets.
--
-- This migration adds, all additive + backward-compatible:
--   1. `tags` — household-scoped label list (name + optional color), with
--      archive-over-delete like payees/categories (a tag can be referenced by
--      historical transactions, so it is never physically removed).
--   2. `transaction_tags` — the junction table (transaction ↔ tag), household
--      scoped, cascading with both parents.
--   3. `get_tags_with_stats(household)` — one row per tag with its live usage
--      count + last-used date, for the /dashboard/tags management page.
--   4. `set_transaction_tags(transaction, tag_ids[])` — replaces a
--      transaction's whole tag set in one call. The transaction create/update
--      RPCs are intentionally left untouched (no new overloads): the server
--      action posts/updates the transaction first, then calls this to attach
--      the chosen tags.
--
-- Depends on existing objects: public.households, public.transactions,
-- public.set_updated_at(), public.is_household_member(uuid),
-- public.is_household_editor(uuid).
-- ============================================================

-- ── 1. Tags table ───────────────────────────────────────────────────────────
create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  -- Optional display color (hex like '#7c3aed'); null renders a neutral chip.
  color text,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint tags_name_not_blank_chk check (length(trim(name)) > 0)
);

-- Case/whitespace-insensitive uniqueness per household (matches payees).
create unique index if not exists idx_tags_household_name_unique
  on public.tags(household_id, lower(name));

-- Speeds up the common "active tags for this household" listing/lookup.
create index if not exists idx_tags_household_active
  on public.tags(household_id)
  where is_archived = false;

drop trigger if exists trg_tags_updated_at on public.tags;
create trigger trg_tags_updated_at
before update on public.tags
for each row execute function public.set_updated_at();

alter table public.tags enable row level security;

drop policy if exists "tags_select_member" on public.tags;
create policy "tags_select_member"
on public.tags for select to authenticated
using (public.is_household_member(household_id));

drop policy if exists "tags_insert_editor" on public.tags;
create policy "tags_insert_editor"
on public.tags for insert to authenticated
with check (public.is_household_editor(household_id));

drop policy if exists "tags_update_editor" on public.tags;
create policy "tags_update_editor"
on public.tags for update to authenticated
using (public.is_household_editor(household_id))
with check (public.is_household_editor(household_id));

-- No delete policy: tags are referenced by historical transaction_tags rows and
-- should not be physically removed (archive-over-delete, matching payees).

-- ── 2. Junction table ───────────────────────────────────────────────────────
create table if not exists public.transaction_tags (
  household_id uuid not null references public.households(id) on delete cascade,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  created_at timestamptz not null default now(),

  primary key (transaction_id, tag_id)
);

create index if not exists idx_transaction_tags_tag
  on public.transaction_tags(tag_id);

create index if not exists idx_transaction_tags_household
  on public.transaction_tags(household_id);

alter table public.transaction_tags enable row level security;

drop policy if exists "transaction_tags_select_member" on public.transaction_tags;
create policy "transaction_tags_select_member"
on public.transaction_tags for select to authenticated
using (public.is_household_member(household_id));

drop policy if exists "transaction_tags_insert_editor" on public.transaction_tags;
create policy "transaction_tags_insert_editor"
on public.transaction_tags for insert to authenticated
with check (public.is_household_editor(household_id));

drop policy if exists "transaction_tags_delete_editor" on public.transaction_tags;
create policy "transaction_tags_delete_editor"
on public.transaction_tags for delete to authenticated
using (public.is_household_editor(household_id));

-- ── 3. List with usage stats ────────────────────────────────────────────────
create or replace function public.get_tags_with_stats(p_household_id uuid)
returns table (
  id uuid,
  name text,
  color text,
  is_archived boolean,
  txn_count bigint,
  last_txn_date date,
  created_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    tg.id,
    tg.name,
    tg.color,
    tg.is_archived,
    count(t.id) as txn_count,
    max(t.transaction_date) as last_txn_date,
    tg.created_at
  from public.tags tg
  left join public.transaction_tags tt
    on tt.tag_id = tg.id
    and tt.household_id = tg.household_id
  left join public.transactions t
    on t.id = tt.transaction_id
    and t.household_id = tg.household_id
    and t.deleted_at is null
  where tg.household_id = p_household_id
  group by tg.id, tg.name, tg.color, tg.is_archived, tg.created_at
$$;

grant execute on function public.get_tags_with_stats(uuid) to authenticated;

-- ── 4. Replace a transaction's tag set ──────────────────────────────────────
-- Idempotent "set" semantics: after this call the transaction is linked to
-- exactly the tags in p_tag_ids that belong to its household (unknown/foreign
-- ids are silently skipped). Passing null or an empty array clears all tags.
create or replace function public.set_transaction_tags(
  p_transaction_id uuid,
  p_tag_ids uuid[]
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_household_id uuid;
  v_count integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if p_transaction_id is null then
    raise exception 'transaction_id is required';
  end if;

  select household_id
  into v_household_id
  from public.transactions
  where id = p_transaction_id
    and deleted_at is null;

  if v_household_id is null then
    raise exception 'transaction not found';
  end if;

  if not public.is_household_editor(v_household_id) then
    raise exception 'Not authorized to tag transactions for this household';
  end if;

  -- Remove links that are no longer selected (or all of them when clearing).
  delete from public.transaction_tags tt
  where tt.transaction_id = p_transaction_id
    and (
      p_tag_ids is null
      or tt.tag_id <> all(p_tag_ids)
    );

  -- Add newly selected tags that belong to this household. Foreign or unknown
  -- ids never match the join, so they're skipped; existing links are no-ops.
  if p_tag_ids is not null and array_length(p_tag_ids, 1) is not null then
    insert into public.transaction_tags (household_id, transaction_id, tag_id)
    select v_household_id, p_transaction_id, tg.id
    from public.tags tg
    where tg.id = any(p_tag_ids)
      and tg.household_id = v_household_id
    on conflict (transaction_id, tag_id) do nothing;
  end if;

  select count(*)::integer
  into v_count
  from public.transaction_tags
  where transaction_id = p_transaction_id;

  return v_count;
end;
$$;

grant execute on function public.set_transaction_tags(uuid, uuid[]) to authenticated;
