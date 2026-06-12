-- ============================================================
-- Default categories: ship with a fitting color + icon
-- ------------------------------------------------------------
-- 1. Replace create_default_categories_for_household so NEW households
--    get colored/iconed system categories. Same signature (p_household_id
--    uuid) → CREATE OR REPLACE is a true replace, no overload created.
-- 2. Backfill existing system categories, filling only NULL color/icon so
--    any user customization is preserved.
-- No schema change (categories.color / categories.icon already exist).
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
    (p_household_id, 'Salary', 'income', 'income', true, false, false, 100, '#10b981', '💼', auth.uid()),
    (p_household_id, 'Side Income', 'income', 'income', true, false, false, 110, '#14b8a6', '💵', auth.uid()),
    (p_household_id, 'Interest Income', 'income', 'income', true, false, false, 120, '#0ea5e9', '📈', auth.uid()),
    (p_household_id, 'Refunds', 'income', 'income', true, false, false, 130, '#84cc16', '↩️', auth.uid()),
    (p_household_id, 'Other Income', 'income', 'income', true, false, false, 190, '#22c55e', '💰', auth.uid()),

    -- Expenses
    (p_household_id, 'Rent', 'expense', 'expense', true, false, false, 200, '#f97316', '🏠', auth.uid()),
    (p_household_id, 'Groceries', 'expense', 'expense', true, false, false, 210, '#f59e0b', '🛒', auth.uid()),
    (p_household_id, 'Restaurants', 'expense', 'expense', true, false, false, 220, '#ef4444', '🍽️', auth.uid()),
    (p_household_id, 'Transportation', 'expense', 'expense', true, false, false, 230, '#0ea5e9', '🚗', auth.uid()),
    (p_household_id, 'Insurance', 'expense', 'expense', true, false, false, 240, '#6366f1', '🛡️', auth.uid()),
    (p_household_id, 'Utilities', 'expense', 'expense', true, false, false, 250, '#eab308', '💡', auth.uid()),
    (p_household_id, 'Internet', 'expense', 'expense', true, false, false, 260, '#06b6d4', '🌐', auth.uid()),
    (p_household_id, 'Mobile', 'expense', 'expense', true, false, false, 270, '#8b5cf6', '📱', auth.uid()),
    (p_household_id, 'Health', 'expense', 'expense', true, false, false, 280, '#ec4899', '🏥', auth.uid()),
    (p_household_id, 'Pets', 'expense', 'expense', true, false, false, 290, '#f59e0b', '🐾', auth.uid()),
    (p_household_id, 'Travel', 'expense', 'expense', true, false, false, 300, '#14b8a6', '✈️', auth.uid()),
    (p_household_id, 'Shopping', 'expense', 'expense', true, false, false, 310, '#ec4899', '🛍️', auth.uid()),
    (p_household_id, 'Entertainment', 'expense', 'expense', true, false, false, 320, '#8b5cf6', '🎬', auth.uid()),
    (p_household_id, 'Subscriptions', 'expense', 'expense', true, false, false, 330, '#6366f1', '🔁', auth.uid()),
    (p_household_id, 'Fees', 'expense', 'expense', true, false, false, 340, '#64748b', '🧾', auth.uid()),
    (p_household_id, 'Other Expense', 'expense', 'expense', true, false, false, 390, '#64748b', '💸', auth.uid()),

    -- Financial
    (p_household_id, 'Debt Principal', 'financial', 'debt_principal', true, true, false, 400, '#f43f5e', '🏦', auth.uid()),
    (p_household_id, 'Debt Interest', 'expense', 'debt_interest', true, false, false, 410, '#f43f5e', '💳', auth.uid()),
    (p_household_id, 'Savings', 'financial', 'savings', true, true, false, 420, '#10b981', '🐷', auth.uid()),
    (p_household_id, 'Investments', 'financial', 'investment', true, true, false, 430, '#6366f1', '📊', auth.uid()),
    (p_household_id, 'Transfers', 'financial', 'transfer', true, true, true, 440, '#64748b', '🔄', auth.uid()),
    (p_household_id, 'Adjustments', 'adjustment', 'adjustment', true, true, true, 450, '#64748b', '⚖️', auth.uid())
  on conflict do nothing;
end;
$$;

-- ------------------------------------------------------------
-- Backfill existing system categories (fill NULLs only).
-- ------------------------------------------------------------
update public.categories c
set
  color = coalesce(c.color, m.color),
  icon = coalesce(c.icon, m.icon)
from (
  values
    ('Salary', '#10b981', '💼'),
    ('Side Income', '#14b8a6', '💵'),
    ('Interest Income', '#0ea5e9', '📈'),
    ('Refunds', '#84cc16', '↩️'),
    ('Other Income', '#22c55e', '💰'),
    ('Rent', '#f97316', '🏠'),
    ('Groceries', '#f59e0b', '🛒'),
    ('Restaurants', '#ef4444', '🍽️'),
    ('Transportation', '#0ea5e9', '🚗'),
    ('Insurance', '#6366f1', '🛡️'),
    ('Utilities', '#eab308', '💡'),
    ('Internet', '#06b6d4', '🌐'),
    ('Mobile', '#8b5cf6', '📱'),
    ('Health', '#ec4899', '🏥'),
    ('Pets', '#f59e0b', '🐾'),
    ('Travel', '#14b8a6', '✈️'),
    ('Shopping', '#ec4899', '🛍️'),
    ('Entertainment', '#8b5cf6', '🎬'),
    ('Subscriptions', '#6366f1', '🔁'),
    ('Fees', '#64748b', '🧾'),
    ('Other Expense', '#64748b', '💸'),
    ('Debt Principal', '#f43f5e', '🏦'),
    ('Debt Interest', '#f43f5e', '💳'),
    ('Savings', '#10b981', '🐷'),
    ('Investments', '#6366f1', '📊'),
    ('Transfers', '#64748b', '🔄'),
    ('Adjustments', '#64748b', '⚖️')
) as m(name, color, icon)
where c.is_system
  and lower(c.name) = lower(m.name)
  and (c.color is null or c.icon is null);
