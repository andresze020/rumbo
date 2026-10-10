'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isHouseholdSharingEnabled } from '@/lib/households/sharing-flag'
import {
  invitationRefusal,
  isInvitationRole,
  type InvitationRefusal,
} from '@/lib/households/invitations'

export type CreateInvitationState =
  | { status: 'idle' }
  | { status: 'error'; code: InvitationRefusal }
  // The raw token, handed to the inviter once (INV-2) and never stored by the app.
  | { status: 'created'; token: string; email: string }

async function activeHousehold() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('default_household_id')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile?.default_household_id) redirect('/onboarding')

  return { supabase, householdId: profile.default_household_id as string }
}

/**
 * HH-4 (INV-1, INV-2): create a single-use invitation link for one email. The
 * database decides who may invite whom and enforces the caps; this only reads
 * the form and returns the token for the dialog to show once.
 */
export async function createInvitationAction(
  _previous: CreateInvitationState,
  formData: FormData
): Promise<CreateInvitationState> {
  if (!isHouseholdSharingEnabled()) return { status: 'error', code: 'not_authorized' }

  const email = String(formData.get('email') ?? '').trim()
  const role = formData.get('role')
  if (!email) return { status: 'error', code: 'invalid_email' }
  if (!isInvitationRole(role)) return { status: 'error', code: 'invalid_role' }

  const { supabase, householdId } = await activeHousehold()
  const { data, error } = await supabase.rpc('create_household_invitation', {
    p_household_id: householdId,
    p_email: email,
    p_role: role,
  })
  // The pending list, and the accounts dialog's "make private" offer (D6).
  revalidatePath('/dashboard', 'layout')

  if (error || typeof data !== 'string') {
    return { status: 'error', code: invitationRefusal(error?.message) }
  }
  return { status: 'created', token: data, email: email.toLowerCase() }
}

/** HH-4 (INV-4): revoke a pending invitation; its link stops working at once. */
export async function revokeInvitationAction(formData: FormData) {
  const invitationId = String(formData.get('invitation_id') ?? '').trim()
  if (!isHouseholdSharingEnabled() || !invitationId) redirect('/dashboard/settings#invitations')

  const { supabase } = await activeHousehold()
  const { error } = await supabase.rpc('revoke_household_invitation', { p_invitation_id: invitationId })
  revalidatePath('/dashboard', 'layout')

  if (error) {
    redirect(`/dashboard/settings?invitationError=${invitationRefusal(error.message)}#invitations`)
  }
  redirect('/dashboard/settings?invitationRevoked=1#invitations')
}
