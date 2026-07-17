-- ============================================================
-- App Finanzas — br_021_month_closures.sql
-- BR-021: lightweight "Close month" marker for /dashboard/month-review.
-- ------------------------------------------------------------
-- Records that a household has reviewed and closed a given month, with a
-- snapshot of that month's headline figures at close time. This is a LIGHT
-- close: it does NOT lock the ledger — transactions in a closed month can
-- still be added/edited/voided. Reopening simply deletes the marker.
--
-- Additive, household-scoped, RLS-guarded. No ledger tables touched.
-- Depends on: public.households, public.is_household_member(uuid),
-- public.is_household_editor(uuid).
-- ============================================================

create table if not exists public.month_closures (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  closure_month date not null,
  closed_by uuid not null references auth.users(id),
  closed_at timestamptz not null default now(),
  note text,
  snapshot jsonb,

  constraint month_closures_month_first_day_chk
    check (closure_month = date_trunc('month', closure_month)::date)
);

create unique index if not exists month_closures_unique_month
  on public.month_closures(household_id, closure_month);

create index if not exists idx_month_closures_household
  on public.month_closures(household_id);

alter table public.month_closures enable row level security;

drop policy if exists "month_closures_select_member" on public.month_closures;
create policy "month_closures_select_member"
on public.month_closures for select to authenticated
using (public.is_household_member(household_id));

drop policy if exists "month_closures_insert_editor" on public.month_closures;
create policy "month_closures_insert_editor"
on public.month_closures for insert to authenticated
with check (
  public.is_household_editor(household_id)
  and closed_by = auth.uid()
);

drop policy if exists "month_closures_delete_editor" on public.month_closures;
create policy "month_closures_delete_editor"
on public.month_closures for delete to authenticated
using (public.is_household_editor(household_id));

-- No update policy: a closure is either present (closed) or removed (reopened).
