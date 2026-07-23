'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isTagColor } from './colors'

// Postgres unique_violation — hit when a tag name collides with an existing one
// (case/whitespace-insensitive unique index on household_id + lower(name)).
const UNIQUE_VIOLATION = '23505'

function normalizeColor(raw: string): string | null {
  const value = raw.trim().toLowerCase()
  return isTagColor(value) ? value : null
}

function redirectWithError(message: string): never {
  redirect(`/dashboard/tags?error=${encodeURIComponent(message)}`)
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

// Tags surface on the transaction list and the tags page; refresh both.
function revalidateTagSurfaces() {
  revalidatePath('/dashboard/tags')
  revalidatePath('/dashboard/transactions')
}

export async function createTagAction(formData: FormData) {
  const name = String(formData.get('name') ?? '').trim()
  const color = normalizeColor(String(formData.get('color') ?? ''))

  if (!name) {
    redirectWithError('Tag name is required.')
  }

  const { supabase, householdId } = await getAuthenticatedHousehold()

  const { error: insertError } = await supabase.from('tags').insert({
    household_id: householdId,
    name,
    color,
  })

  if (insertError) {
    if (insertError.code === UNIQUE_VIOLATION) {
      redirectWithError(`A tag named "${name}" already exists.`)
    }
    redirectWithError('Could not create the tag. Please try again.')
  }

  revalidateTagSurfaces()
  redirect('/dashboard/tags?created=1')
}

export async function updateTagAction(formData: FormData) {
  const tagId = String(formData.get('tag_id') ?? '').trim()
  const name = String(formData.get('name') ?? '').trim()
  const color = normalizeColor(String(formData.get('color') ?? ''))
  const showArchived = String(formData.get('show_archived') ?? '') === 'true'

  if (!tagId) {
    redirectWithError('Tag is required.')
  }

  if (!name) {
    redirectWithError('Tag name is required.')
  }

  const { supabase, householdId } = await getAuthenticatedHousehold()

  const { data: tag, error: tagError } = await supabase
    .from('tags')
    .select('id')
    .eq('id', tagId)
    .eq('household_id', householdId)
    .maybeSingle()

  if (tagError || !tag) {
    redirectWithError('Tag was not found for this household.')
  }

  const { error: updateError } = await supabase
    .from('tags')
    .update({ name, color })
    .eq('id', tagId)
    .eq('household_id', householdId)

  if (updateError) {
    if (updateError.code === UNIQUE_VIOLATION) {
      redirectWithError(`Another tag named "${name}" already exists.`)
    }
    redirectWithError('Could not update the tag. Please try again.')
  }

  revalidateTagSurfaces()
  redirect(
    showArchived
      ? '/dashboard/tags?showArchived=true&updated=1'
      : '/dashboard/tags?updated=1'
  )
}

export async function archiveTagAction(formData: FormData) {
  const tagId = String(formData.get('tag_id') ?? '').trim()
  const isArchived = String(formData.get('is_archived') ?? '') === 'true'
  const showArchived = String(formData.get('show_archived') ?? '') === 'true'

  if (!tagId) {
    redirectWithError('Tag is required.')
  }

  const { supabase, householdId } = await getAuthenticatedHousehold()

  const { data: tag, error: tagError } = await supabase
    .from('tags')
    .select('id')
    .eq('id', tagId)
    .eq('household_id', householdId)
    .maybeSingle()

  if (tagError || !tag) {
    redirectWithError('Tag was not found for this household.')
  }

  const { error: updateError } = await supabase
    .from('tags')
    .update({ is_archived: isArchived })
    .eq('id', tagId)
    .eq('household_id', householdId)

  if (updateError) {
    redirectWithError(
      isArchived ? 'Could not archive the tag.' : 'Could not restore the tag.'
    )
  }

  revalidateTagSurfaces()

  const params = new URLSearchParams()
  if (showArchived) params.set('showArchived', 'true')
  params.set(isArchived ? 'archived' : 'unarchived', '1')
  if (isArchived) params.set('archived_id', tagId)
  redirect(`/dashboard/tags?${params.toString()}`)
}
