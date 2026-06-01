-- ============================================================
-- App Finanzas — 001_identity_household.sql
-- Sprint 2.1
-- Purpose: Auth profile + household onboarding foundation
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- Utility
-- ------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ------------------------------------------------------------
-- Core identity tables
-- ------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  email text not null,
  default_household_id uuid,
  locale text default 'en-CA',
  timezone text default 'America/Montreal',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_profiles_updated_at on public.profiles;

create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  base_currency varchar(3) not null default 'CAD',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,

  constraint households_base_currency_format_chk
    check (base_currency = upper(base_currency) and length(base_currency) = 3)
);

drop trigger if exists trg_households_updated_at on public.households;

create trigger trg_households_updated_at
before update on public.households
for each row execute function public.set_updated_at();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_default_household_fk'
  ) then
    alter table public.profiles
    add constraint profiles_default_household_fk
    foreign key (default_household_id)
    references public.households(id)
    on delete set null;
  end if;
end $$;

create table if not exists public.household_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner',
  status text not null default 'active',
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint household_members_role_chk
    check (role in ('owner', 'admin', 'member', 'viewer')),

  constraint household_members_status_chk
    check (status in ('active', 'invited', 'removed')),

  constraint household_members_unique_user_household
    unique (household_id, user_id)
);

drop trigger if exists trg_household_members_updated_at on public.household_members;

create trigger trg_household_members_updated_at
before update on public.household_members
for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- Currencies
-- ------------------------------------------------------------

create table if not exists public.currencies (
  code varchar(3) primary key,
  name text not null,
  symbol text,
  decimal_places integer not null default 2,
  is_active boolean not null default true,

  constraint currencies_code_format_chk
    check (code = upper(code) and length(code) = 3),

  constraint currencies_decimal_places_chk
    check (decimal_places between 0 and 8)
);

insert into public.currencies (code, name, symbol, decimal_places, is_active)
values
  ('CAD', 'Canadian Dollar', '$', 2, true),
  ('USD', 'US Dollar', 'US$', 2, true),
  ('COP', 'Colombian Peso', 'COP$', 2, true)
on conflict (code) do nothing;

-- ------------------------------------------------------------
-- Auto-create profile when auth user is created
-- ------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    coalesce(new.email, ''),
    nullif(new.raw_user_meta_data ->> 'display_name', '')
  )
  on conflict (id) do update
    set email = excluded.email;

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ------------------------------------------------------------
-- RLS helper functions
-- ------------------------------------------------------------

create or replace function public.is_household_member(p_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.household_members hm
    where hm.household_id = p_household_id
      and hm.user_id = auth.uid()
      and hm.status = 'active'
  );
$$;

create or replace function public.has_household_role(p_household_id uuid, p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.household_members hm
    where hm.household_id = p_household_id
      and hm.user_id = auth.uid()
      and hm.status = 'active'
      and hm.role = any(p_roles)
  );
$$;

create or replace function public.is_household_admin(p_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_household_role(p_household_id, array['owner', 'admin']);
$$;

create or replace function public.is_household_editor(p_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_household_role(p_household_id, array['owner', 'admin', 'member']);
$$;

create or replace function public.is_household_creator(p_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.households h
    where h.id = p_household_id
      and h.created_by = auth.uid()
  );
$$;

grant execute on function public.is_household_member(uuid) to authenticated;
grant execute on function public.has_household_role(uuid, text[]) to authenticated;
grant execute on function public.is_household_admin(uuid) to authenticated;
grant execute on function public.is_household_editor(uuid) to authenticated;
grant execute on function public.is_household_creator(uuid) to authenticated;

-- ------------------------------------------------------------
-- Indexes
-- ------------------------------------------------------------

create index if not exists idx_profiles_default_household
on public.profiles(default_household_id);

create index if not exists idx_households_created_by
on public.households(created_by);

create index if not exists idx_households_deleted_at
on public.households(deleted_at);

create index if not exists idx_household_members_user_id
on public.household_members(user_id);

create index if not exists idx_household_members_household_id
on public.household_members(household_id);

create index if not exists idx_household_members_user_household
on public.household_members(user_id, household_id);

-- ------------------------------------------------------------
-- Enable RLS
-- ------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.currencies enable row level security;

-- ------------------------------------------------------------
-- Policies
-- ------------------------------------------------------------

drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;

create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using (id = auth.uid());

create policy "profiles_insert_own"
on public.profiles
for insert
to authenticated
with check (id = auth.uid());

create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists "households_select_member_or_creator" on public.households;
drop policy if exists "households_insert_creator" on public.households;
drop policy if exists "households_update_admin" on public.households;

create policy "households_select_member_or_creator"
on public.households
for select
to authenticated
using (
  public.is_household_member(id)
  or created_by = auth.uid()
);

create policy "households_insert_creator"
on public.households
for insert
to authenticated
with check (created_by = auth.uid());

create policy "households_update_admin"
on public.households
for update
to authenticated
using (public.is_household_admin(id))
with check (public.is_household_admin(id));

drop policy if exists "household_members_select_member" on public.household_members;
drop policy if exists "household_members_insert_owner_or_admin" on public.household_members;
drop policy if exists "household_members_update_admin" on public.household_members;

create policy "household_members_select_member"
on public.household_members
for select
to authenticated
using (public.is_household_member(household_id));

create policy "household_members_insert_owner_or_admin"
on public.household_members
for insert
to authenticated
with check (
  (
    user_id = auth.uid()
    and role = 'owner'
    and status = 'active'
    and public.is_household_creator(household_id)
  )
  or public.is_household_admin(household_id)
);

create policy "household_members_update_admin"
on public.household_members
for update
to authenticated
using (public.is_household_admin(household_id))
with check (public.is_household_admin(household_id));

drop policy if exists "currencies_select_all_authenticated" on public.currencies;

create policy "currencies_select_all_authenticated"
on public.currencies
for select
to authenticated
using (true);