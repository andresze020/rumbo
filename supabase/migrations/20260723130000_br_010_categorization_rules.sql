-- ============================================================
-- App Finanzas — BR-010: categorization rules
-- Target: Supabase / PostgreSQL
-- ------------------------------------------------------------
-- The `categorization_rules` table was designed in the benchmark review but
-- never migrated. It lets a household define "when <field> <operator> <value>,
-- file the transaction under <category>" rules, applied highest-priority-first.
--
-- Rules are applied in the app layer (shared TS matcher in src/lib/rules/match.ts):
--  * CSV import — a row with no mapped category is auto-categorized in the
--    import preview, so it passes validation and imports with the rule's
--    category.
-- The matcher is intentionally kept out of the SQL RPCs (create_manual_transaction
-- / create_csv_import) to avoid re-issuing those large security-sensitive
-- functions; the table + RLS live here and the engine lives in TS.
-- ============================================================

create table if not exists public.categorization_rules (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,

  -- Optional human label; when blank the UI shows "<field> <operator> <value>".
  name text,

  match_field text not null,
  operator text not null,
  match_value text not null,

  category_id uuid not null references public.categories(id) on delete cascade,

  -- Lower runs first. Ties break by created_at (older rule wins).
  priority integer not null default 100,
  is_active boolean not null default true,

  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint categorization_rules_match_field_chk
    check (match_field in ('description', 'merchant_name', 'amount', 'account_name')),

  constraint categorization_rules_operator_chk
    check (operator in ('contains', 'equals', 'starts_with', 'ends_with', 'regex', 'gt', 'lt')),

  constraint categorization_rules_value_not_blank_chk
    check (length(btrim(match_value)) > 0),

  -- Amount comparisons only make sense with the numeric operators, and text
  -- comparisons only with the text operators.
  constraint categorization_rules_field_operator_chk
    check (
      (match_field = 'amount' and operator in ('equals', 'gt', 'lt'))
      or (match_field <> 'amount' and operator in ('contains', 'equals', 'starts_with', 'ends_with', 'regex'))
    )
);

create index if not exists idx_categorization_rules_household
  on public.categorization_rules(household_id);

create index if not exists idx_categorization_rules_active
  on public.categorization_rules(household_id, is_active, priority);

drop trigger if exists trg_categorization_rules_updated_at on public.categorization_rules;

create trigger trg_categorization_rules_updated_at
before update on public.categorization_rules
for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- RLS — members read; editors (admins) write.
-- ------------------------------------------------------------

alter table public.categorization_rules enable row level security;

drop policy if exists categorization_rules_select on public.categorization_rules;
create policy categorization_rules_select
  on public.categorization_rules
  for select
  using (public.is_household_member(household_id));

drop policy if exists categorization_rules_insert on public.categorization_rules;
create policy categorization_rules_insert
  on public.categorization_rules
  for insert
  with check (public.is_household_editor(household_id));

drop policy if exists categorization_rules_update on public.categorization_rules;
create policy categorization_rules_update
  on public.categorization_rules
  for update
  using (public.is_household_editor(household_id))
  with check (public.is_household_editor(household_id));

drop policy if exists categorization_rules_delete on public.categorization_rules;
create policy categorization_rules_delete
  on public.categorization_rules
  for delete
  using (public.is_household_editor(household_id));
