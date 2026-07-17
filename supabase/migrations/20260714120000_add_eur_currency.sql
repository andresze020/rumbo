-- Sprint 14: add EUR as a supported currency.
-- The `currencies` table is the single source of truth for every currency
-- picker and server-side validation. Adding a currency is a data change only.

insert into public.currencies (code, name, symbol, decimal_places, is_active)
values ('EUR', 'Euro', '€', 2, true)
on conflict (code) do nothing;
