'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { EmailOtpType } from '@supabase/supabase-js'
import { inviteReturnPathFromNext } from '@/lib/households/invitations'
import { readInviteReturnPath } from '@/lib/households/invite-cookie'
import { createClient } from '@/lib/supabase/server'

const TYPES: readonly EmailOtpType[] = ['email', 'signup', 'magiclink']

/**
 * HH-7: the Continue button of /auth/confirm. Verifying here, on a POST the
 * person makes, and not when the page is opened, means a mail scanner that
 * fetches every link cannot use the one-time token up first.
 *
 * Forwards only to an invite path from `next`, else the invite cookie (S14),
 * else /onboarding or /dashboard. A dead link that came from an invitation
 * goes back to the invitation, which can send a fresh one.
 */
export async function confirmEmailAction(formData: FormData) {
  const tokenHash = String(formData.get('token_hash') ?? '')
  const type = String(formData.get('type') ?? '') as EmailOtpType
  const invitePath = inviteReturnPathFromNext(String(formData.get('next') ?? ''))

  const supabase = await createClient()
  const { error } =
    tokenHash && TYPES.includes(type)
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
      : { error: new Error('invalid link') }
  revalidatePath('/', 'layout')

  if (error) {
    if (invitePath) redirect(`${invitePath}?link=expired`)
    redirect(`/login?error=${encodeURIComponent('This link is invalid or has expired. Please sign in.')}`)
  }

  const destination = invitePath ?? (await readInviteReturnPath())
  if (destination) redirect(destination)

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('default_household_id')
      .eq('id', user.id)
      .maybeSingle()
    if (!profile?.default_household_id) redirect('/onboarding')
  }
  redirect('/dashboard')
}
