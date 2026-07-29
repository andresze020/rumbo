-- ============================================================================
-- App Finanzas — br_032_038_ui_preferences.sql
-- ============================================================================
-- BR-032 (configurable transaction-form fields) + BR-038 (display preferences).
--
-- Both tickets need the same thing: a place to keep per-USER (not per-household)
-- interface preferences, so they share one column instead of one migration each.
-- `profiles` is the natural home — it already carries `locale` and `timezone`,
-- and its existing `profiles_update_own` policy means no new RLS is needed.
--
-- Additive and safe: the column defaults to an empty object, so every existing
-- profile keeps today's behaviour. The app owns the JSON shape and ignores
-- unknown keys, which lets later preferences land without another migration.
-- ============================================================================

alter table public.profiles
  add column if not exists ui_preferences jsonb not null default '{}'::jsonb;

comment on column public.profiles.ui_preferences is
  'Per-user UI preferences (BR-032 transaction-form fields, BR-038 display defaults). Shape owned by the app; unknown keys are ignored.';

-- Guard against a scalar or array being written here: every reader expects an
-- object and would otherwise have to defend against `null`/`[]`/`"x"`.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_ui_preferences_object_chk'
  ) then
    alter table public.profiles
      add constraint profiles_ui_preferences_object_chk
      check (jsonb_typeof(ui_preferences) = 'object');
  end if;
end $$;
