'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isNoteColor } from './colors'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const ISO_MONTH = /^\d{4}-\d{2}$/
/** Long enough for a real note, short enough that the column is not a dumping ground. */
const MAX_TITLE = 120
const MAX_BODY = 4000

function normalizeColor(raw: string): string | null {
  const value = raw.trim().toLowerCase()
  return isNoteColor(value) ? value : null
}

/** Rebuilds the list URL so an action returns to the view the user came from. */
function notesPath(params: {
  month?: string
  showArchived?: boolean
  q?: string
  extra?: Record<string, string>
}) {
  const search = new URLSearchParams()
  if (params.month && ISO_MONTH.test(params.month)) search.set('month', params.month)
  if (params.showArchived) search.set('showArchived', 'true')
  if (params.q?.trim()) search.set('q', params.q.trim())
  for (const [key, value] of Object.entries(params.extra ?? {})) search.set(key, value)
  const qs = search.toString()
  return `/dashboard/notes${qs ? `?${qs}` : ''}`
}

function readContext(formData: FormData) {
  return {
    month: String(formData.get('month') ?? '').trim(),
    showArchived: String(formData.get('show_archived') ?? '') === 'true',
    q: String(formData.get('q') ?? '').trim(),
  }
}

function redirectWithError(message: string): never {
  redirect(`/dashboard/notes?error=${encodeURIComponent(message)}`)
}

async function getAuthenticatedHousehold() {
  const supabase = await createClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    redirect('/login')
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('default_household_id')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError) {
    redirectWithError('Could not load your household.')
  }

  if (!profile?.default_household_id) {
    redirect('/onboarding')
  }

  return {
    supabase,
    userId: user.id,
    householdId: profile.default_household_id as string,
  }
}

// Notes are their own surface and are cross-linked from the calendar; refresh both.
function revalidateNoteSurfaces() {
  revalidatePath('/dashboard/notes')
  revalidatePath('/dashboard/calendar')
}

function readFields(formData: FormData) {
  const noteDate = String(formData.get('note_date') ?? '').trim()
  const title = String(formData.get('title') ?? '').trim()
  const body = String(formData.get('body') ?? '').trim()
  const color = normalizeColor(String(formData.get('color') ?? ''))

  if (!ISO_DATE.test(noteDate)) {
    redirectWithError('Pick a valid date for this note.')
  }
  if (!title) {
    redirectWithError('A note needs a title.')
  }
  if (title.length > MAX_TITLE) {
    redirectWithError(`Keep the title under ${MAX_TITLE} characters.`)
  }
  if (body.length > MAX_BODY) {
    redirectWithError(`Keep the note under ${MAX_BODY} characters.`)
  }

  return { noteDate, title, body: body || null, color }
}

export async function createNoteAction(formData: FormData) {
  const context = readContext(formData)
  const { noteDate, title, body, color } = readFields(formData)
  const { supabase, userId, householdId } = await getAuthenticatedHousehold()

  const { error: insertError } = await supabase.from('notes').insert({
    household_id: householdId,
    note_date: noteDate,
    title,
    body,
    color,
    created_by: userId,
  })

  if (insertError) {
    redirectWithError('Could not save the note. Please try again.')
  }

  revalidateNoteSurfaces()
  // Land on the note's own month so a note dated outside the current view is
  // not written and then apparently lost.
  redirect(
    notesPath({
      month: noteDate.slice(0, 7),
      q: context.q,
      extra: { created: '1' },
    })
  )
}

export async function updateNoteAction(formData: FormData) {
  const context = readContext(formData)
  const noteId = String(formData.get('note_id') ?? '').trim()
  const { noteDate, title, body, color } = readFields(formData)

  if (!noteId) {
    redirectWithError('Note is required.')
  }

  const { supabase, userId, householdId } = await getAuthenticatedHousehold()

  const { data: note, error: noteError } = await supabase
    .from('notes')
    .select('id')
    .eq('id', noteId)
    .eq('household_id', householdId)
    .maybeSingle()

  if (noteError || !note) {
    redirectWithError('Note was not found for this household.')
  }

  const { error: updateError } = await supabase
    .from('notes')
    .update({
      note_date: noteDate,
      title,
      body,
      color,
      updated_by: userId,
    })
    .eq('id', noteId)
    .eq('household_id', householdId)

  if (updateError) {
    redirectWithError('Could not update the note. Please try again.')
  }

  revalidateNoteSurfaces()
  redirect(
    notesPath({
      month: noteDate.slice(0, 7),
      showArchived: context.showArchived,
      q: context.q,
      extra: { updated: '1' },
    })
  )
}

/**
 * Archive / restore. Mirrors the tag + payee contract (`is_archived` plus
 * `archived_id`) so the shared `ArchiveToast` "Undo" works with no changes.
 */
export async function archiveNoteAction(formData: FormData) {
  const context = readContext(formData)
  const noteId = String(formData.get('note_id') ?? '').trim()
  const isArchived = String(formData.get('is_archived') ?? '') === 'true'

  if (!noteId) {
    redirectWithError('Note is required.')
  }

  const { supabase, userId, householdId } = await getAuthenticatedHousehold()

  const { data: note, error: noteError } = await supabase
    .from('notes')
    .select('id')
    .eq('id', noteId)
    .eq('household_id', householdId)
    .maybeSingle()

  if (noteError || !note) {
    redirectWithError('Note was not found for this household.')
  }

  const { error: updateError } = await supabase
    .from('notes')
    .update({ is_archived: isArchived, updated_by: userId })
    .eq('id', noteId)
    .eq('household_id', householdId)

  if (updateError) {
    redirectWithError(
      isArchived ? 'Could not archive the note.' : 'Could not restore the note.'
    )
  }

  revalidateNoteSurfaces()
  redirect(
    notesPath({
      month: context.month,
      showArchived: context.showArchived,
      q: context.q,
      extra: isArchived
        ? { archived: '1', archived_id: noteId }
        : { unarchived: '1' },
    })
  )
}
