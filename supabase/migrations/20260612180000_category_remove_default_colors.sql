-- ============================================================
-- Remove default colors from system categories (icon-only)
-- ------------------------------------------------------------
-- Migration 20260612144936 shipped default colors + icons for system
-- categories and has already been applied. After review, the colored
-- dots felt too saturated next to the icons, so default categories go
-- icon-only from here on.
--
-- 1. Re-replace create_default_categories_for_household so NEW
--    households get icon-only system categories (color = null). Same
--    signature → safe CREATE OR REPLACE, no overload created.
-- 2. Revert the color backfill from 20260612144936: reset color back to
--    null for existing system categories whose color exactly matches the
--    value that migration seeded. Any color a user has since changed
--    (no longer matching the seeded value) is left untouched. Icons stay.
-- ============================================================

create or replace function public.create_default_categories_for_household(
  p_household_id uuid
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_household_id is null then
    raise exception 'household_id is required';
  end if;

  if not public.is_household_admin(p_household_id) then
    raise exception 'Not authorized to create default categories for this household';
  end if;

  insert into public.categories (
    household_id,
    name,
    category_type,
    reporting_type,
    is_system,
    exclude_from_budget,
    exclude_from_reports,
    sort_order,
    color,
    icon,
    created_by
  )
  values
    -- Income
    (p_household_id, 'Salary', 'income', 'income', true, false, false, 100, null, '💼', auth.uid()),
    (p_household_id, 'Side Income', 'income', 'income', true, false, false, 110, null, '💵', auth.uid()),
    (p_household_id, 'Interest Income', 'income', 'income', true, false, false, 120, null, '📈', auth.uid()),
    (p_household_id, 'Refunds', 'income', 'income', true, false, false, 130, null, '↩️', auth.uid()),
    (p_household_id, 'Other Income', 'income', 'income', true, false, false, 190, null, '💰', auth.uid()),

    -- Expenses
    (p_household_id, 'Rent', 'expense', 'expense', true, false, false, 200, null, '🏠', auth.uid()),
    (p_household_id, 'Groceries', 'expense', 'expense', true, false, false, 210, null, '🛒', auth.uid()),
    (p_household_id, 'Restaurants', 'expense', 'expense', true, false, false, 220, null, '🍽️', auth.uid()),
    (p_household_id, 'Transportation', 'expense', 'expense', true, false, false, 230, null, '🚗', auth.uid()),
    (p_household_id, 'Insurance', 'expense', 'expense', true, false, false, 240, null, '🛡️', auth.uid()),
    (p_household_id, 'Utilities', 'expense', 'expense', true, false, false, 250, null, '💡', auth.uid()),
    (p_household_id, 'Internet', 'expense', 'expense', true, false, false, 260, null, '🌐', auth.uid()),
    (p_household_id, 'Mobile', 'expense', 'expense', true, false, false, 270, null, '📱', auth.uid()),
    (p_household_id, 'Health', 'expense', 'expense', true, false, false, 280, null, '🏥', auth.uid()),
    (p_household_id, 'Pets', 'expense', 'expense', true, false, false, 290, null, '🐾', auth.uid()),
    (p_household_id, 'Travel', 'expense', 'expense', true, false, false, 300, null, '✈️', auth.uid()),
    (p_household_id, 'Shopping', 'expense', 'expense', true, false, false, 310, null, '🛍️', auth.uid()),
    (p_household_id, 'Entertainment', 'expense', 'expense', true, false, false, 320, null, '🎬', auth.uid()),
    (p_household_id, 'Subscriptions', 'expense', 'expense', true, false, false, 330, null, '🔁', auth.uid()),
    (p_household_id, 'Fees', 'expense', 'expense', true, false, false, 340, null, '🧾', auth.uid()),
    (p_household_id, 'Other Expense', 'expense', 'expense', true, false, false, 390, null, '💸', auth.uid()),

    -- Financial
    (p_household_id, 'Debt Principal', 'financial', 'debt_principal', true, true, false, 400, null, '🏦', auth.uid()),
    (p_household_id, 'Debt Interest', 'expense', 'debt_interest', true, false, false, 410, null, '💳', auth.uid()),
    (p_household_id, 'Savings', 'financial', 'savings', true, true, false, 420, null, '🐷', auth.uid()),
    (p_household_id, 'Investments', 'financial', 'investment', true, true, false, 430, null, '📊', auth.uid()),
    (p_household_id, 'Transfers', 'financial', 'transfer', true, true, true, 440, null, '🔄', auth.uid()),
    (p_household_id, 'Adjustments', 'adjustment', 'adjustment', true, true, true, 450, null, '⚖️', auth.uid())
  on conflict do nothing;
end;
$$;

-- ------------------------------------------------------------
-- Revert the color backfill from 20260612144936 (icon stays).
-- Only resets colors that still match the value that migration seeded.
-- ------------------------------------------------------------
update public.categories c
set color = null
from (
  values
    ('Salary', '#10b981'),
    ('Side Income', '#14b8a6'),
    ('Interest Income', '#0ea5e9'),
    ('Refunds', '#84cc16'),
    ('Other Income', '#22c55e'),
    ('Rent', '#f97316'),
    ('Groceries', '#f59e0b'),
    ('Restaurants', '#ef4444'),
    ('Transportation', '#0ea5e9'),
    ('Insurance', '#6366f1'),
    ('Utilities', '#eab308'),
    ('Internet', '#06b6d4'),
    ('Mobile', '#8b5cf6'),
    ('Health', '#ec4899'),
    ('Pets', '#f59e0b'),
    ('Travel', '#14b8a6'),
    ('Shopping', '#ec4899'),
    ('Entertainment', '#8b5cf6'),
    ('Subscriptions', '#6366f1'),
    ('Fees', '#64748b'),
    ('Other Expense', '#64748b'),
    ('Debt Principal', '#f43f5e'),
    ('Debt Interest', '#f43f5e'),
    ('Savings', '#10b981'),
    ('Investments', '#6366f1'),
    ('Transfers', '#64748b'),
    ('Adjustments', '#64748b')
) as m(name, color)
where c.is_system
  and lower(c.name) = lower(m.name)
  and c.color = m.color;
