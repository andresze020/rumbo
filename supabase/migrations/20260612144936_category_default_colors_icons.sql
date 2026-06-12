-- ============================================================
-- Default categories: ship with a fitting icon
-- ------------------------------------------------------------
-- 1. Replace create_default_categories_for_household so NEW households
--    get an icon per system category (no default color — kept neutral/
--    uncluttered). Same signature (p_household_id uuid) → CREATE OR
--    REPLACE is a true replace, no overload created.
-- 2. Backfill existing system categories, filling only NULL icon so any
--    user customization (including custom colors) is preserved.
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
-- Backfill existing system categories (fill NULL icon only).
-- ------------------------------------------------------------
update public.categories c
set icon = m.icon
from (
  values
    ('Salary', '💼'),
    ('Side Income', '💵'),
    ('Interest Income', '📈'),
    ('Refunds', '↩️'),
    ('Other Income', '💰'),
    ('Rent', '🏠'),
    ('Groceries', '🛒'),
    ('Restaurants', '🍽️'),
    ('Transportation', '🚗'),
    ('Insurance', '🛡️'),
    ('Utilities', '💡'),
    ('Internet', '🌐'),
    ('Mobile', '📱'),
    ('Health', '🏥'),
    ('Pets', '🐾'),
    ('Travel', '✈️'),
    ('Shopping', '🛍️'),
    ('Entertainment', '🎬'),
    ('Subscriptions', '🔁'),
    ('Fees', '🧾'),
    ('Other Expense', '💸'),
    ('Debt Principal', '🏦'),
    ('Debt Interest', '💳'),
    ('Savings', '🐷'),
    ('Investments', '📊'),
    ('Transfers', '🔄'),
    ('Adjustments', '⚖️')
) as m(name, icon)
where c.is_system
  and lower(c.name) = lower(m.name)
  and c.icon is null;
