-- ============================================================
-- Rumbo — HH-1 (3/5): private accounts — the policy clause
-- Spec: docs/features/household-sharing.md §4 "Policy clause", D2, D5,
-- PRV-4, S1, S22.
-- ------------------------------------------------------------
-- Every policy on a table that can hold private data keeps its existing
-- membership / role check and gains one clause. P below is
--
--     (private_owner_id is null or private_owner_id = (select auth.uid()))
--
--   * SELECT everywhere: P. On transactions instead:
--       visibility <> 'private' or private_owner_id = (select auth.uid())
--     so a mixed transfer's header stays readable by the household while its
--     private leg (an entry with an owner) does not (PRV-4).
--   * INSERT / UPDATE / DELETE everywhere: P. On transaction_entries,
--     transaction_allocations and transaction_tags the parent transaction must
--     pass P as well — that is what stops a co-member editing or deleting the
--     shared side of someone's mixed transfer (S22).
--   * accounts INSERT / UPDATE: a shared account is owner/admin work as
--     today; a private one is any editor's, for themselves (D5):
--       (private_owner_id is null and is_household_admin)
--       or (private_owner_id = auth.uid() and is_household_editor)
--   * recurring_transactions: same split (a private rule is its owner's).
--
-- Nobody is exempt — owner and admin included (D2). RLS is the boundary (S1);
-- the derivation triggers (20261009130000) run before WITH CHECK, so the value
-- a policy checks is the derived one, never the client's.
--
-- Style: the five RUM-004 SELECT policies keep their inlined membership
-- subquery and add P; every other table keeps its helper call. Policy names
-- are unchanged; their meaning is widened where noted.
-- ============================================================

-- ------------------------------------------------------------
-- accounts
-- ------------------------------------------------------------
drop policy if exists "accounts_select_member" on public.accounts;
create policy "accounts_select_member"
on public.accounts
for select
to authenticated
using (
  deleted_at is null
  and household_id in (
    select hm.household_id
    from public.household_members hm
    where hm.user_id = (select auth.uid())
      and hm.status = 'active'
  )
  and (private_owner_id is null or private_owner_id = (select auth.uid()))
);

-- Name kept; meaning widened: a private account is any editor's, for themselves.
drop policy if exists "accounts_insert_admin" on public.accounts;
create policy "accounts_insert_admin"
on public.accounts
for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and (
    (private_owner_id is null and public.is_household_admin(household_id))
    or (private_owner_id = (select auth.uid()) and public.is_household_editor(household_id))
  )
);

drop policy if exists "accounts_update_admin" on public.accounts;
create policy "accounts_update_admin"
on public.accounts
for update
to authenticated
using (
  deleted_at is null
  and (
    (private_owner_id is null and public.is_household_admin(household_id))
    or (private_owner_id = (select auth.uid()) and public.is_household_editor(household_id))
  )
)
with check (
  (private_owner_id is null and public.is_household_admin(household_id))
  or (private_owner_id = (select auth.uid()) and public.is_household_editor(household_id))
);

-- ------------------------------------------------------------
-- transactions
-- ------------------------------------------------------------
drop policy if exists "transactions_select_member" on public.transactions;
create policy "transactions_select_member"
on public.transactions
for select
to authenticated
using (
  household_id in (
    select hm.household_id
    from public.household_members hm
    where hm.user_id = (select auth.uid())
      and hm.status = 'active'
  )
  and (visibility <> 'private' or private_owner_id = (select auth.uid()))
);

drop policy if exists "transactions_insert_editor" on public.transactions;
create policy "transactions_insert_editor"
on public.transactions
for insert
to authenticated
with check (
  public.is_household_editor(household_id)
  and created_by = (select auth.uid())
  and (private_owner_id is null or private_owner_id = (select auth.uid()))
);

-- A mixed transfer has an owner, so only that owner can change it (S22).
drop policy if exists "transactions_update_editor" on public.transactions;
create policy "transactions_update_editor"
on public.transactions
for update
to authenticated
using (
  public.is_household_editor(household_id)
  and (private_owner_id is null or private_owner_id = (select auth.uid()))
)
with check (
  public.is_household_editor(household_id)
  and (private_owner_id is null or private_owner_id = (select auth.uid()))
);

-- ------------------------------------------------------------
-- transaction_entries
-- ------------------------------------------------------------
drop policy if exists "transaction_entries_select_member" on public.transaction_entries;
create policy "transaction_entries_select_member"
on public.transaction_entries
for select
to authenticated
using (
  household_id in (
    select hm.household_id
    from public.household_members hm
    where hm.user_id = (select auth.uid())
      and hm.status = 'active'
  )
  and (private_owner_id is null or private_owner_id = (select auth.uid()))
);

drop policy if exists "transaction_entries_insert_editor" on public.transaction_entries;
create policy "transaction_entries_insert_editor"
on public.transaction_entries
for insert
to authenticated
with check (
  public.is_household_editor(household_id)
  and (private_owner_id is null or private_owner_id = (select auth.uid()))
  and exists (
    select 1
    from public.transactions t
    where t.id = transaction_id
      and t.household_id = transaction_entries.household_id
      and (t.private_owner_id is null or t.private_owner_id = (select auth.uid()))
  )
  and exists (
    select 1
    from public.accounts a
    where a.id = account_id
      and a.household_id = transaction_entries.household_id
  )
);

drop policy if exists "transaction_entries_update_editor" on public.transaction_entries;
create policy "transaction_entries_update_editor"
on public.transaction_entries
for update
to authenticated
using (
  public.is_household_editor(household_id)
  and (private_owner_id is null or private_owner_id = (select auth.uid()))
  and exists (
    select 1
    from public.transactions t
    where t.id = transaction_id
      and (t.private_owner_id is null or t.private_owner_id = (select auth.uid()))
  )
)
with check (
  public.is_household_editor(household_id)
  and (private_owner_id is null or private_owner_id = (select auth.uid()))
  and exists (
    select 1
    from public.transactions t
    where t.id = transaction_id
      and t.household_id = transaction_entries.household_id
      and (t.private_owner_id is null or t.private_owner_id = (select auth.uid()))
  )
  and exists (
    select 1
    from public.accounts a
    where a.id = account_id
      and a.household_id = transaction_entries.household_id
  )
);

drop policy if exists "transaction_entries_delete_editor" on public.transaction_entries;
create policy "transaction_entries_delete_editor"
on public.transaction_entries
for delete
to authenticated
using (
  public.is_household_editor(household_id)
  and (private_owner_id is null or private_owner_id = (select auth.uid()))
  and exists (
    select 1
    from public.transactions t
    where t.id = transaction_id
      and (t.private_owner_id is null or t.private_owner_id = (select auth.uid()))
  )
);

-- ------------------------------------------------------------
-- transaction_allocations
-- ------------------------------------------------------------
drop policy if exists "transaction_allocations_select_member" on public.transaction_allocations;
create policy "transaction_allocations_select_member"
on public.transaction_allocations
for select
to authenticated
using (
  household_id in (
    select hm.household_id
    from public.household_members hm
    where hm.user_id = (select auth.uid())
      and hm.status = 'active'
  )
  and (private_owner_id is null or private_owner_id = (select auth.uid()))
);

drop policy if exists "transaction_allocations_insert_editor" on public.transaction_allocations;
create policy "transaction_allocations_insert_editor"
on public.transaction_allocations
for insert
to authenticated
with check (
  public.is_household_editor(household_id)
  and (private_owner_id is null or private_owner_id = (select auth.uid()))
  and exists (
    select 1
    from public.transactions t
    where t.id = transaction_id
      and t.household_id = transaction_allocations.household_id
      and (t.private_owner_id is null or t.private_owner_id = (select auth.uid()))
  )
  and exists (
    select 1
    from public.categories c
    where c.id = category_id
      and c.household_id = transaction_allocations.household_id
  )
);

drop policy if exists "transaction_allocations_update_editor" on public.transaction_allocations;
create policy "transaction_allocations_update_editor"
on public.transaction_allocations
for update
to authenticated
using (
  public.is_household_editor(household_id)
  and (private_owner_id is null or private_owner_id = (select auth.uid()))
  and exists (
    select 1
    from public.transactions t
    where t.id = transaction_id
      and (t.private_owner_id is null or t.private_owner_id = (select auth.uid()))
  )
)
with check (
  public.is_household_editor(household_id)
  and (private_owner_id is null or private_owner_id = (select auth.uid()))
  and exists (
    select 1
    from public.transactions t
    where t.id = transaction_id
      and t.household_id = transaction_allocations.household_id
      and (t.private_owner_id is null or t.private_owner_id = (select auth.uid()))
  )
  and exists (
    select 1
    from public.categories c
    where c.id = category_id
      and c.household_id = transaction_allocations.household_id
  )
);

drop policy if exists "transaction_allocations_delete_editor" on public.transaction_allocations;
create policy "transaction_allocations_delete_editor"
on public.transaction_allocations
for delete
to authenticated
using (
  public.is_household_editor(household_id)
  and (private_owner_id is null or private_owner_id = (select auth.uid()))
  and exists (
    select 1
    from public.transactions t
    where t.id = transaction_id
      and (t.private_owner_id is null or t.private_owner_id = (select auth.uid()))
  )
);

-- ------------------------------------------------------------
-- transaction_tags
-- ------------------------------------------------------------
drop policy if exists "transaction_tags_select_member" on public.transaction_tags;
create policy "transaction_tags_select_member"
on public.transaction_tags
for select
to authenticated
using (
  household_id in (
    select hm.household_id
    from public.household_members hm
    where hm.user_id = (select auth.uid())
      and hm.status = 'active'
  )
  and (private_owner_id is null or private_owner_id = (select auth.uid()))
);

drop policy if exists "transaction_tags_insert_editor" on public.transaction_tags;
create policy "transaction_tags_insert_editor"
on public.transaction_tags
for insert
to authenticated
with check (
  public.is_household_editor(household_id)
  and (private_owner_id is null or private_owner_id = (select auth.uid()))
  and exists (
    select 1
    from public.transactions t
    where t.id = transaction_id
      and (t.private_owner_id is null or t.private_owner_id = (select auth.uid()))
  )
);

drop policy if exists "transaction_tags_delete_editor" on public.transaction_tags;
create policy "transaction_tags_delete_editor"
on public.transaction_tags
for delete
to authenticated
using (
  public.is_household_editor(household_id)
  and (private_owner_id is null or private_owner_id = (select auth.uid()))
  and exists (
    select 1
    from public.transactions t
    where t.id = transaction_id
      and (t.private_owner_id is null or t.private_owner_id = (select auth.uid()))
  )
);

-- ------------------------------------------------------------
-- payees
-- ------------------------------------------------------------
drop policy if exists "payees_select_member" on public.payees;
create policy "payees_select_member"
on public.payees for select to authenticated
using (
  public.is_household_member(household_id)
  and (private_owner_id is null or private_owner_id = (select auth.uid()))
);

drop policy if exists "payees_insert_editor" on public.payees;
create policy "payees_insert_editor"
on public.payees for insert to authenticated
with check (
  public.is_household_editor(household_id)
  and (private_owner_id is null or private_owner_id = (select auth.uid()))
);

drop policy if exists "payees_update_editor" on public.payees;
create policy "payees_update_editor"
on public.payees for update to authenticated
using (
  public.is_household_editor(household_id)
  and (private_owner_id is null or private_owner_id = (select auth.uid()))
)
with check (
  public.is_household_editor(household_id)
  and (private_owner_id is null or private_owner_id = (select auth.uid()))
);

-- ------------------------------------------------------------
-- debts
-- ------------------------------------------------------------
drop policy if exists "debts_select_member" on public.debts;
create policy "debts_select_member"
on public.debts
for select
to authenticated
using (
  deleted_at is null
  and public.is_household_member(household_id)
  and (private_owner_id is null or private_owner_id = (select auth.uid()))
);

drop policy if exists "debts_insert_editor" on public.debts;
create policy "debts_insert_editor"
on public.debts
for insert
to authenticated
with check (
  public.is_household_editor(household_id)
  and created_by = (select auth.uid())
  and (private_owner_id is null or private_owner_id = (select auth.uid()))
);

drop policy if exists "debts_update_editor" on public.debts;
create policy "debts_update_editor"
on public.debts
for update
to authenticated
using (
  deleted_at is null
  and public.is_household_editor(household_id)
  and (private_owner_id is null or private_owner_id = (select auth.uid()))
)
with check (
  public.is_household_editor(household_id)
  and (private_owner_id is null or private_owner_id = (select auth.uid()))
);

drop policy if exists "debts_delete_editor" on public.debts;
create policy "debts_delete_editor"
on public.debts
for delete
to authenticated
using (
  public.is_household_editor(household_id)
  and (private_owner_id is null or private_owner_id = (select auth.uid()))
);

-- ------------------------------------------------------------
-- installment_plans
-- ------------------------------------------------------------
drop policy if exists "installment_plans_select_member" on public.installment_plans;
create policy "installment_plans_select_member"
on public.installment_plans
for select
to authenticated
using (
  public.is_household_member(household_id)
  and (private_owner_id is null or private_owner_id = (select auth.uid()))
);

drop policy if exists "installment_plans_insert_editor" on public.installment_plans;
create policy "installment_plans_insert_editor"
on public.installment_plans
for insert
to authenticated
with check (
  public.is_household_editor(household_id)
  and created_by = (select auth.uid())
  and (private_owner_id is null or private_owner_id = (select auth.uid()))
);

drop policy if exists "installment_plans_update_editor" on public.installment_plans;
create policy "installment_plans_update_editor"
on public.installment_plans
for update
to authenticated
using (
  public.is_household_editor(household_id)
  and (private_owner_id is null or private_owner_id = (select auth.uid()))
)
with check (
  public.is_household_editor(household_id)
  and (private_owner_id is null or private_owner_id = (select auth.uid()))
);

-- ------------------------------------------------------------
-- goals
-- ------------------------------------------------------------
drop policy if exists "goals_select_member" on public.goals;
create policy "goals_select_member"
on public.goals for select to authenticated
using (
  public.is_household_member(household_id)
  and (private_owner_id is null or private_owner_id = (select auth.uid()))
);

drop policy if exists "goals_insert_editor" on public.goals;
create policy "goals_insert_editor"
on public.goals for insert to authenticated
with check (
  public.is_household_editor(household_id)
  and (private_owner_id is null or private_owner_id = (select auth.uid()))
);

drop policy if exists "goals_update_editor" on public.goals;
create policy "goals_update_editor"
on public.goals for update to authenticated
using (
  public.is_household_editor(household_id)
  and (private_owner_id is null or private_owner_id = (select auth.uid()))
)
with check (
  public.is_household_editor(household_id)
  and (private_owner_id is null or private_owner_id = (select auth.uid()))
);

-- ------------------------------------------------------------
-- recurring_transactions: a shared rule is admin work as today; a rule on a
-- private account is its owner's (HH-1: "admin-only … must also allow the
-- owner of a private account acting on it"). Names kept, meaning widened.
-- ------------------------------------------------------------
drop policy if exists "recurring_transactions_select_member" on public.recurring_transactions;
create policy "recurring_transactions_select_member"
on public.recurring_transactions for select to authenticated
using (
  public.is_household_member(household_id)
  and (private_owner_id is null or private_owner_id = (select auth.uid()))
);

drop policy if exists "recurring_transactions_insert_admin" on public.recurring_transactions;
create policy "recurring_transactions_insert_admin"
on public.recurring_transactions for insert to authenticated
with check (
  (private_owner_id is null and public.is_household_admin(household_id))
  or (private_owner_id = (select auth.uid()) and public.is_household_editor(household_id))
);

drop policy if exists "recurring_transactions_update_admin" on public.recurring_transactions;
create policy "recurring_transactions_update_admin"
on public.recurring_transactions for update to authenticated
using (
  (private_owner_id is null and public.is_household_admin(household_id))
  or (private_owner_id = (select auth.uid()) and public.is_household_editor(household_id))
)
with check (
  (private_owner_id is null and public.is_household_admin(household_id))
  or (private_owner_id = (select auth.uid()) and public.is_household_editor(household_id))
);

drop policy if exists "recurring_transactions_delete_admin" on public.recurring_transactions;
create policy "recurring_transactions_delete_admin"
on public.recurring_transactions for delete to authenticated
using (
  (private_owner_id is null and public.is_household_admin(household_id))
  or (private_owner_id = (select auth.uid()) and public.is_household_editor(household_id))
);

-- ------------------------------------------------------------
-- recurring_autopost_log (written only by the definer job)
-- ------------------------------------------------------------
drop policy if exists recurring_autopost_log_select on public.recurring_autopost_log;
create policy recurring_autopost_log_select
on public.recurring_autopost_log
for select
to authenticated
using (
  public.is_household_member(household_id)
  and (private_owner_id is null or private_owner_id = (select auth.uid()))
);

-- ------------------------------------------------------------
-- import_batches / import_rows
-- ------------------------------------------------------------
drop policy if exists "import_batches_select_member" on public.import_batches;
create policy "import_batches_select_member"
on public.import_batches
for select
to authenticated
using (
  deleted_at is null
  and public.is_household_member(household_id)
  and (private_owner_id is null or private_owner_id = (select auth.uid()))
);

drop policy if exists "import_batches_insert_editor" on public.import_batches;
create policy "import_batches_insert_editor"
on public.import_batches
for insert
to authenticated
with check (
  public.is_household_editor(household_id)
  and uploaded_by = (select auth.uid())
  and (private_owner_id is null or private_owner_id = (select auth.uid()))
);

drop policy if exists "import_batches_update_editor" on public.import_batches;
create policy "import_batches_update_editor"
on public.import_batches
for update
to authenticated
using (
  deleted_at is null
  and public.is_household_editor(household_id)
  and (private_owner_id is null or private_owner_id = (select auth.uid()))
)
with check (
  public.is_household_editor(household_id)
  and (private_owner_id is null or private_owner_id = (select auth.uid()))
);

drop policy if exists "import_batches_delete_editor" on public.import_batches;
create policy "import_batches_delete_editor"
on public.import_batches
for delete
to authenticated
using (
  public.is_household_editor(household_id)
  and (private_owner_id is null or private_owner_id = (select auth.uid()))
);

drop policy if exists "import_rows_select_member" on public.import_rows;
create policy "import_rows_select_member"
on public.import_rows
for select
to authenticated
using (
  public.is_household_member(household_id)
  and (private_owner_id is null or private_owner_id = (select auth.uid()))
);

drop policy if exists "import_rows_insert_editor" on public.import_rows;
create policy "import_rows_insert_editor"
on public.import_rows
for insert
to authenticated
with check (
  public.is_household_editor(household_id)
  and (private_owner_id is null or private_owner_id = (select auth.uid()))
  and exists (
    select 1
    from public.import_batches ib
    where ib.id = import_batch_id
      and ib.household_id = import_rows.household_id
      and ib.deleted_at is null
  )
);

drop policy if exists "import_rows_update_editor" on public.import_rows;
create policy "import_rows_update_editor"
on public.import_rows
for update
to authenticated
using (
  public.is_household_editor(household_id)
  and (private_owner_id is null or private_owner_id = (select auth.uid()))
)
with check (
  public.is_household_editor(household_id)
  and (private_owner_id is null or private_owner_id = (select auth.uid()))
);

drop policy if exists "import_rows_delete_editor" on public.import_rows;
create policy "import_rows_delete_editor"
on public.import_rows
for delete
to authenticated
using (
  public.is_household_editor(household_id)
  and (private_owner_id is null or private_owner_id = (select auth.uid()))
);

-- ------------------------------------------------------------
-- csv_import_presets
-- ------------------------------------------------------------
drop policy if exists "csv_import_presets_select_member" on public.csv_import_presets;
create policy "csv_import_presets_select_member"
on public.csv_import_presets for select to authenticated
using (
  public.is_household_member(household_id)
  and (private_owner_id is null or private_owner_id = (select auth.uid()))
);

drop policy if exists "csv_import_presets_insert_editor" on public.csv_import_presets;
create policy "csv_import_presets_insert_editor"
on public.csv_import_presets for insert to authenticated
with check (
  public.is_household_editor(household_id)
  and created_by = (select auth.uid())
  and (private_owner_id is null or private_owner_id = (select auth.uid()))
);

drop policy if exists "csv_import_presets_update_editor" on public.csv_import_presets;
create policy "csv_import_presets_update_editor"
on public.csv_import_presets for update to authenticated
using (
  public.is_household_editor(household_id)
  and (private_owner_id is null or private_owner_id = (select auth.uid()))
)
with check (
  public.is_household_editor(household_id)
  and (private_owner_id is null or private_owner_id = (select auth.uid()))
);

drop policy if exists "csv_import_presets_delete_editor" on public.csv_import_presets;
create policy "csv_import_presets_delete_editor"
on public.csv_import_presets for delete to authenticated
using (
  public.is_household_editor(household_id)
  and (private_owner_id is null or private_owner_id = (select auth.uid()))
);
