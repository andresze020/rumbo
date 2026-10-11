import { NextResponse, type NextRequest } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { inviteReturnPathFromNext } from '@/lib/households/invitations'
import { readInviteReturnPath } from '@/lib/households/invite-cookie'
import { createClient } from '@/lib/supabase/server'

const TYPES: readonly EmailOtpType[] = ['email', 'signup', 'magiclink']

/**
 * HH-7: where the "Confirm signup" and "Magic Link" emails land:
 *
 *   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next={{ .RedirectTo }}
 *
 * verifyOtp with the token hash needs nothing stored in the browser, so the
 * link works on whatever device the email is opened on — which an invitation
 * email needs (it was requested from the inviter's session, not the invitee's).
 *
 * `next` only ever leads to an invitation path (/invite/<token>, validated
 * like the S14 cookie). Anything else falls back to the usual destination:
 * the invite cookie if set, else /dashboard or /onboarding.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null

  if (!tokenHash || !type || !TYPES.includes(type)) {
    return redirectTo(origin, `/login?error=${encodeURIComponent('This link is invalid or has expired. Please try again.')}`)
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
  if (error) {
    return redirectTo(origin, `/login?error=${encodeURIComponent('This link is invalid or has expired. Please sign in.')}`)
  }

  const invitePath = inviteReturnPathFromNext(searchParams.get('next')) ?? (await readInviteReturnPath())
  if (invitePath) return redirectTo(origin, invitePath)

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('default_household_id')
      .eq('id', user.id)
      .maybeSingle()
    if (!profile?.default_household_id) return redirectTo(origin, '/onboarding')
  }
  return redirectTo(origin, '/dashboard')
}

function redirectTo(origin: string, path: string) {
  const response = NextResponse.redirect(`${origin}${path}`)
  // The URL carries a one-time token hash (and maybe an invitation token).
  response.headers.set('Referrer-Policy', 'no-referrer')
  response.headers.set('Cache-Control', 'no-store')
  return response
}
