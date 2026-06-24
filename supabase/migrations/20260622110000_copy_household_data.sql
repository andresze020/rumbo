-- ============================================================
-- Copy all household data into another household (dev/demo utility)
-- ------------------------------------------------------------
-- Lets you duplicate a real household's full dataset (accounts, categories,
-- payees, transactions + entries/allocations, budgets, debts, recurring
-- templates, goals, exchange rates) into a different household — typically
-- a demo/test household — so QA and demos have realistic, structured data
-- instead of hand-seeded fixtures.
--
-- Deliberately scoped:
--   * Every copied row gets a brand-new id (no PK/FK collisions with the
--     source); cross-references (parent category, account, transaction,
--     budget, payee) are remapped via temporary id maps built up front.
--   * created_by/updated_by/deleted_by/voided_by on copied rows are set to
--     p_actor_user_id, not preserved from the source. The source household's
--     real users are not necessarily members of the target household, and
--     several RLS insert policies require created_by = auth.uid() anyway.
--   * import_batches/import_rows are NOT copied (CSV import provenance from
--     the source household isn't meaningful in a demo); transactions that
--     came from an import keep their other fields but lose the
--     import_batch_id/import_row_id link (set to null).
--   * household_members are NOT copied — the target household is expected
--     to already exist with its own members (e.g. a demo user's household).
--   * DESTRUCTIVE FOR THE TARGET: before copying, every row already in the
--     target household across all 12 copied tables is permanently deleted
--     (see the wipe step below). This makes the target an exact mirror of
--     the source every time the function runs, and avoids unique-constraint
--     collisions with whatever the target already had (at minimum the
--     default categories every household is seeded with on creation). The
--     source household is never modified.
--
-- security definer is intentional here: the function is run as a one-off
-- maintenance action directly from the Supabase SQL editor (which already
-- bypasses RLS), specifically to push data into a *different* demo user's
-- household. p_actor_user_id is only validated against auth.users (it must
-- be a real user) and used to stamp created_by/updated_by — it is NOT
-- required to be a member of either household.
-- ============================================================

create or replace function public.copy_household_data(
  p_source_household_id uuid,
  p_target_household_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_n_categories int;
  v_n_accounts int;
  v_n_payees int;
  v_n_transactions int;
  v_n_entries int;
  v_n_allocations int;
  v_n_budgets int;
  v_n_budget_lines int;
  v_n_debts int;
  v_n_recurring int;
  v_n_goals int;
  v_n_exchange_rates int;
begin
  if p_source_household_id is null or p_target_household_id is null or p_actor_user_id is null then
    raise exception 'source_household_id, target_household_id, and actor_user_id are all required';
  end if;

  if p_source_household_id = p_target_household_id then
    raise exception 'source and target household must be different';
  end if;

  if not exists (
    select 1 from public.households where id = p_source_household_id and deleted_at is null
  ) then
    raise exception 'source household not found';
  end if;

  if not exists (
    select 1 from public.households where id = p_target_household_id and deleted_at is null
  ) then
    raise exception 'target household not found';
  end if;

  -- actor_user_id is only used to stamp created_by/updated_by/deleted_by on
  -- copied rows (several RLS insert policies require created_by = auth.uid(),
  -- so the rows need a real, consistent owner). It is intentionally NOT
  -- required to already be a member of either household: this function is
  -- a trusted maintenance tool run from the SQL editor (which bypasses RLS
  -- entirely), used precisely to seed a *separate* demo user's household
  -- from a real one — the real user and the demo user are different
  -- people/accounts on purpose.
  if not exists (
    select 1 from auth.users where id = p_actor_user_id
  ) then
    raise exception 'actor_user_id does not match an existing user';
  end if;

  -- ── Wipe the target household first. ────────────────────────────────────
  -- The copy is meant to leave the target as an exact mirror of the source,
  -- and target households normally already have data (at minimum the
  -- default categories every household gets seeded with on creation), which
  -- would otherwise collide with the copied rows on unique constraints
  -- (account/category names, budget month, etc.). This is the destructive
  -- part of this function: anything already in the target household is
  -- permanently gone after this runs. Order respects FKs without cascade
  -- (debts/recurring_transactions reference accounts/categories directly;
  -- transactions/budgets cascade their entries/allocations/lines, but they
  -- are deleted explicitly anyway for clarity).
  delete from public.transaction_allocations where household_id = p_target_household_id;
  delete from public.transaction_entries where household_id = p_target_household_id;
  delete from public.transactions where household_id = p_target_household_id;
  delete from public.budget_lines where household_id = p_target_household_id;
  delete from public.budgets where household_id = p_target_household_id;
  delete from public.debts where household_id = p_target_household_id;
  delete from public.recurring_transactions where household_id = p_target_household_id;
  delete from public.goals where household_id = p_target_household_id;
  delete from public.payees where household_id = p_target_household_id;
  delete from public.accounts where household_id = p_target_household_id;
  delete from public.categories where household_id = p_target_household_id;
  delete from public.exchange_rates where household_id = p_target_household_id;

  -- ── Id maps (old id -> new id), populated up front so every insert below
  --    can remap cross-references in a single pass. Dropped explicitly
  --    (rather than `on commit drop`) so the function can be called more
  --    than once in the same session/transaction. ─────────────────────────
  drop table if exists map_category, map_account, map_payee, map_transaction, map_budget;

  create temp table map_category (old_id uuid primary key, new_id uuid not null default gen_random_uuid());
  create temp table map_account (old_id uuid primary key, new_id uuid not null default gen_random_uuid());
  create temp table map_payee (old_id uuid primary key, new_id uuid not null default gen_random_uuid());
  create temp table map_transaction (old_id uuid primary key, new_id uuid not null default gen_random_uuid());
  create temp table map_budget (old_id uuid primary key, new_id uuid not null default gen_random_uuid());

  insert into map_category (old_id) select id from public.categories where household_id = p_source_household_id;
  insert into map_account (old_id) select id from public.accounts where household_id = p_source_household_id;
  insert into map_payee (old_id) select id from public.payees where household_id = p_source_household_id;
  insert into map_transaction (old_id) select id from public.transactions where household_id = p_source_household_id;
  insert into map_budget (old_id) select id from public.budgets where household_id = p_source_household_id;

  -- ── Categories (self-referencing parent_category_id) ───────────────────
  insert into public.categories (
    id, household_id, name, category_type, reporting_type, parent_category_id,
    is_system, is_archived, exclude_from_budget, exclude_from_reports,
    color, icon, sort_order, created_by, updated_by,
    created_at, updated_at, deleted_at, deleted_by
  )
  select
    mc.new_id, p_target_household_id, c.name, c.category_type, c.reporting_type, mp.new_id,
    c.is_system, c.is_archived, c.exclude_from_budget, c.exclude_from_reports,
    c.color, c.icon, c.sort_order, p_actor_user_id, p_actor_user_id,
    c.created_at, c.updated_at, c.deleted_at, case when c.deleted_at is not null then p_actor_user_id end
  from public.categories c
  join map_category mc on mc.old_id = c.id
  left join map_category mp on mp.old_id = c.parent_category_id
  where c.household_id = p_source_household_id;
  get diagnostics v_n_categories = row_count;

  -- ── Accounts ─────────────────────────────────────────────────────────
  insert into public.accounts (
    id, household_id, name, account_type, account_class, currency_code,
    institution_name, last_four, color, icon, opening_balance_date,
    is_archived, include_in_net_worth, sort_order, notes,
    created_by, updated_by, created_at, updated_at, deleted_at, deleted_by
  )
  select
    ma.new_id, p_target_household_id, a.name, a.account_type, a.account_class, a.currency_code,
    a.institution_name, a.last_four, a.color, a.icon, a.opening_balance_date,
    a.is_archived, a.include_in_net_worth, a.sort_order, a.notes,
    p_actor_user_id, p_actor_user_id, a.created_at, a.updated_at, a.deleted_at,
    case when a.deleted_at is not null then p_actor_user_id end
  from public.accounts a
  join map_account ma on ma.old_id = a.id
  where a.household_id = p_source_household_id;
  get diagnostics v_n_accounts = row_count;

  -- ── Payees ───────────────────────────────────────────────────────────
  insert into public.payees (id, household_id, name, created_at, updated_at)
  select mpy.new_id, p_target_household_id, py.name, py.created_at, py.updated_at
  from public.payees py
  join map_payee mpy on mpy.old_id = py.id
  where py.household_id = p_source_household_id;
  get diagnostics v_n_payees = row_count;

  -- ── Transactions (import_batch_id / import_row_id intentionally dropped) ─
  insert into public.transactions (
    id, household_id, transaction_date, transaction_type, status, source,
    description, notes, merchant_name, review_status, payee_id,
    created_by, updated_by, created_at, updated_at, deleted_at, deleted_by,
    voided_at, voided_by, void_reason
  )
  select
    mt.new_id, p_target_household_id, t.transaction_date, t.transaction_type, t.status, t.source,
    t.description, t.notes, t.merchant_name, t.review_status, mpy.new_id,
    p_actor_user_id, p_actor_user_id, t.created_at, t.updated_at, t.deleted_at,
    case when t.deleted_at is not null then p_actor_user_id end,
    t.voided_at, case when t.voided_at is not null then p_actor_user_id end, t.void_reason
  from public.transactions t
  join map_transaction mt on mt.old_id = t.id
  left join map_payee mpy on mpy.old_id = t.payee_id
  where t.household_id = p_source_household_id;
  get diagnostics v_n_transactions = row_count;

  -- ── Transaction entries ──────────────────────────────────────────────
  insert into public.transaction_entries (
    id, household_id, transaction_id, account_id, currency_code,
    entry_type, amount_account_currency, exchange_rate_to_base, amount_base_currency,
    notes, created_at, updated_at
  )
  select
    gen_random_uuid(), p_target_household_id, mt.new_id, ma.new_id, te.currency_code,
    te.entry_type, te.amount_account_currency, te.exchange_rate_to_base, te.amount_base_currency,
    te.notes, te.created_at, te.updated_at
  from public.transaction_entries te
  join map_transaction mt on mt.old_id = te.transaction_id
  join map_account ma on ma.old_id = te.account_id
  where te.household_id = p_source_household_id;
  get diagnostics v_n_entries = row_count;

  -- ── Transaction allocations ──────────────────────────────────────────
  insert into public.transaction_allocations (
    id, household_id, transaction_id, category_id, currency_code,
    allocation_type, amount_original_currency, exchange_rate_to_base, amount_base_currency,
    notes, created_at
  )
  select
    gen_random_uuid(), p_target_household_id, mt.new_id, mc.new_id, ta.currency_code,
    ta.allocation_type, ta.amount_original_currency, ta.exchange_rate_to_base, ta.amount_base_currency,
    ta.notes, ta.created_at
  from public.transaction_allocations ta
  join map_transaction mt on mt.old_id = ta.transaction_id
  join map_category mc on mc.old_id = ta.category_id
  where ta.household_id = p_source_household_id;
  get diagnostics v_n_allocations = row_count;

  -- ── Budgets ──────────────────────────────────────────────────────────
  insert into public.budgets (
    id, household_id, budget_month, status, currency_code,
    created_by, updated_by, created_at, updated_at, deleted_at, deleted_by
  )
  select
    mb.new_id, p_target_household_id, b.budget_month, b.status, b.currency_code,
    p_actor_user_id, p_actor_user_id, b.created_at, b.updated_at, b.deleted_at,
    case when b.deleted_at is not null then p_actor_user_id end
  from public.budgets b
  join map_budget mb on mb.old_id = b.id
  where b.household_id = p_source_household_id;
  get diagnostics v_n_budgets = row_count;

  -- ── Budget lines ─────────────────────────────────────────────────────
  insert into public.budget_lines (
    id, household_id, budget_id, category_id, planned_amount, notes,
    created_by, updated_by, created_at, updated_at, deleted_at, deleted_by
  )
  select
    gen_random_uuid(), p_target_household_id, mb.new_id, mc.new_id, bl.planned_amount, bl.notes,
    p_actor_user_id, p_actor_user_id, bl.created_at, bl.updated_at, bl.deleted_at,
    case when bl.deleted_at is not null then p_actor_user_id end
  from public.budget_lines bl
  join map_budget mb on mb.old_id = bl.budget_id
  join map_category mc on mc.old_id = bl.category_id
  where bl.household_id = p_source_household_id;
  get diagnostics v_n_budget_lines = row_count;

  -- ── Debts ────────────────────────────────────────────────────────────
  insert into public.debts (
    id, household_id, account_id, name, lender_name, original_principal,
    interest_rate, interest_rate_period, minimum_payment, payment_due_day,
    status, notes, created_by, updated_by, created_at, updated_at, deleted_at, deleted_by
  )
  select
    gen_random_uuid(), p_target_household_id, ma.new_id, d.name, d.lender_name, d.original_principal,
    d.interest_rate, d.interest_rate_period, d.minimum_payment, d.payment_due_day,
    d.status, d.notes, p_actor_user_id, p_actor_user_id, d.created_at, d.updated_at, d.deleted_at,
    case when d.deleted_at is not null then p_actor_user_id end
  from public.debts d
  join map_account ma on ma.old_id = d.account_id
  where d.household_id = p_source_household_id;
  get diagnostics v_n_debts = row_count;

  -- ── Recurring transaction templates ──────────────────────────────────
  insert into public.recurring_transactions (
    id, household_id, name, transaction_type, account_id, category_id,
    amount, currency_code, frequency, start_date, end_date, next_run_date,
    auto_post, is_active, created_by, created_at, updated_at
  )
  select
    gen_random_uuid(), p_target_household_id, r.name, r.transaction_type, ma.new_id, mc.new_id,
    r.amount, r.currency_code, r.frequency, r.start_date, r.end_date, r.next_run_date,
    r.auto_post, r.is_active, p_actor_user_id, r.created_at, r.updated_at
  from public.recurring_transactions r
  left join map_account ma on ma.old_id = r.account_id
  left join map_category mc on mc.old_id = r.category_id
  where r.household_id = p_source_household_id;
  get diagnostics v_n_recurring = row_count;

  -- ── Goals ────────────────────────────────────────────────────────────
  insert into public.goals (
    id, household_id, name, goal_type, target_amount, current_amount,
    currency_code, target_date, linked_account_id, status, created_by, created_at, updated_at
  )
  select
    gen_random_uuid(), p_target_household_id, g.name, g.goal_type, g.target_amount, g.current_amount,
    g.currency_code, g.target_date, ma.new_id, g.status, p_actor_user_id, g.created_at, g.updated_at
  from public.goals g
  left join map_account ma on ma.old_id = g.linked_account_id
  where g.household_id = p_source_household_id;
  get diagnostics v_n_goals = row_count;

  -- ── Exchange rates ───────────────────────────────────────────────────
  insert into public.exchange_rates (
    id, household_id, from_currency_code, to_currency_code, rate, rate_date,
    source, notes, created_by, updated_by, created_at, updated_at
  )
  select
    gen_random_uuid(), p_target_household_id, e.from_currency_code, e.to_currency_code, e.rate, e.rate_date,
    e.source, e.notes, p_actor_user_id, p_actor_user_id, e.created_at, e.updated_at
  from public.exchange_rates e
  where e.household_id = p_source_household_id
  on conflict (household_id, from_currency_code, to_currency_code, rate_date) do nothing;
  get diagnostics v_n_exchange_rates = row_count;

  drop table map_category, map_account, map_payee, map_transaction, map_budget;

  v_result := jsonb_build_object(
    'categories', v_n_categories,
    'accounts', v_n_accounts,
    'payees', v_n_payees,
    'transactions', v_n_transactions,
    'transaction_entries', v_n_entries,
    'transaction_allocations', v_n_allocations,
    'budgets', v_n_budgets,
    'budget_lines', v_n_budget_lines,
    'debts', v_n_debts,
    'recurring_transactions', v_n_recurring,
    'goals', v_n_goals,
    'exchange_rates', v_n_exchange_rates
  );

  return v_result;
end;
$$;

-- Not granted to `authenticated` on purpose: this is a maintenance/demo-data
-- tool meant to be run from the Supabase SQL editor (or another trusted
-- admin context), not exposed as an app-callable RPC.
revoke all on function public.copy_household_data(uuid, uuid, uuid) from public, authenticated, anon;
