'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isHouseholdSharingEnabled } from '@/lib/households/sharing-flag'
import { clearInviteReturnCookie, setInviteReturnCookie } from '@/lib/households/invite-cookie'
import { invitationRefusal, invitePath, isInvitationToken } from '@/lib/households/invitations'

/**
 * HH-4: the invite page's buttons. Every one is a POST (S11): opening the link
 * never writes. The token travels in the form body, back to the same
 * `/invite/<token>` path it came from — never into a query string.
 */
function tokenFrom(formData: FormData): string {
  const token = formData.get('token')
  if (!isHouseholdSharingEnabled() || !isInvitationToken(token)) redirect('/')
  return token
}

/**
 * Leave the invitation behind: forget the return cookie, then go home. A plain
 * link to "/" would loop — "/" sends anyone with the cookie back here.
 */
export async function leaveInvitationAction() {
  await clearInviteReturnCookie()
  redirect('/')
}

/** INV-5: signed out → remember the link (S14 cookie) and go sign in or sign up. */
export async function continueToSignInAction(formData: FormData) {
  const token = tokenFrom(formData)
  await setInviteReturnCookie(token)
  redirect(formData.get('mode') === 'signup' ? '/login?mode=signup' : '/login')
}

/** INV-7: signed in with the wrong address → sign out, keep the link, sign in again. */
export async function switchAccountForInviteAction(formData: FormData) {
  const token = tokenFrom(formData)
  const supabase = await createClient()
  await supabase.auth.signOut()
  await setInviteReturnCookie(token)
  // A different session: nothing the Router Cache kept may show.
  revalidatePath('/', 'layout')
  redirect('/login')
}

export async function acceptInvitationAction(formData: FormData) {
  const token = tokenFrom(formData)
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('accept_household_invitation', { p_token: token })
  // A new membership changes the household selector and every page under it.
  revalidatePath('/', 'layout')

  if (error) {
    redirect(`${invitePath(token)}?error=${invitationRefusal(error.message)}`)
  }

  await clearInviteReturnCookie()
  const result = (data ?? {}) as { status?: string; household_id?: string; switched?: boolean }

  // INV-9: no household before → they land in this one. Had one → they keep
  // it, and Settings offers the switch.
  if (result.status === 'joined' && result.switched === false && result.household_id) {
    redirect(`/dashboard/settings?joined=${encodeURIComponent(result.household_id)}`)
  }
  redirect('/dashboard')
}

export async function declineInvitationAction(formData: FormData) {
  const token = tokenFrom(formData)
  const supabase = await createClient()
  const { error } = await supabase.rpc('decline_household_invitation', { p_token: token })
  revalidatePath('/', 'layout')

  if (error) {
    redirect(`${invitePath(token)}?error=${invitationRefusal(error.message)}`)
  }

  await clearInviteReturnCookie()
  redirect(`${invitePath(token)}?declined=1`)
}
