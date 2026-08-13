-- ============================================================
-- App Finanzas — br_044_notes.sql
-- BR-044: standalone dated notes, independent of any transaction.
-- ------------------------------------------------------------
-- A transaction's `notes` column annotates a movement. This is the other thing:
-- a note about a *day* — "cheque from the landlord should clear", "renewed the
-- insurance, compare next year" — for days that may have no transaction at all.
--
-- Deliberately outside the ledger. `notes` references nothing in
-- transactions / transaction_entries / transaction_allocations and nothing
-- references it, so creating, editing or archiving a note cannot move a balance
-- or change a report. Slice 1 is exactly this table plus a list/detail view: no
-- attachments, no reminders, no link to a transaction.
--
-- Archive-over-delete, matching tags and payees: there is no delete policy, so a
-- note is hidden rather than destroyed and "Undo" after archiving is possible.
-- (Notes are not financial records, but the app has one lifecycle for
-- user-created lists and a second one would be a trap, not a feature.)
--
-- Depends on: public.households, public.set_updated_at(),
-- public.is_household_member(uuid), public.is_household_editor(uuid).
-- ============================================================

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,

  -- The day the note is *about*, not when it was written (that is created_at).
  -- A plain date, like transaction_date, so it never shifts across timezones.
  note_date date not null,
  title text not null,
  body text,
  -- Optional hex swatch from the shared note palette; null renders neutral.
  color text,

  is_archived boolean not null default false,

  created_by uuid not null references auth.users(id),
  updated_by uuid references auth.users(id),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint notes_title_not_blank_chk check (length(trim(title)) > 0)
);

-- The list view reads a household's notes newest day first, optionally narrowed
-- to one month; the partial index covers the common "active notes" case.
create index if not exists idx_notes_household_date
  on public.notes(household_id, note_date desc);

create index if not exists idx_notes_household_active
  on public.notes(household_id, note_date desc)
  where is_archived = false;

drop trigger if exists trg_notes_updated_at on public.notes;
create trigger trg_notes_updated_at
before update on public.notes
for each row execute function public.set_updated_at();

alter table public.notes enable row level security;

drop policy if exists "notes_select_member" on public.notes;
create policy "notes_select_member"
on public.notes for select to authenticated
using (public.is_household_member(household_id));

drop policy if exists "notes_insert_editor" on public.notes;
create policy "notes_insert_editor"
on public.notes for insert to authenticated
with check (public.is_household_editor(household_id));

drop policy if exists "notes_update_editor" on public.notes;
create policy "notes_update_editor"
on public.notes for update to authenticated
using (public.is_household_editor(household_id))
with check (public.is_household_editor(household_id));

-- No delete policy on purpose: archive-over-delete (see the header).
