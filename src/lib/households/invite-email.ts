import 'server-only'
import { headers } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import { invitePath } from './invitations'

/**
 * HH-7: email the invited address a sign-in link that lands on the invitation.
 *
 * Supabase Auth sends it (signInWithOtp): for an address with no account it
 * creates one and the email confirms it; for an existing one it signs them in.
 * Either way the link goes through /auth/confirm (a page whose
 * button does the verifying, so mail scanners cannot use the link up) and
 * then to /invite/<token>,
 * where they still have to press Accept (S3, S11). No service-role key: the
 * publishable key is all signInWithOtp needs.
 *
 * A stateless client on purpose: the request's own client would store the
 * one-time-link state in the INVITER's cookies. The Supabase "Confirm signup"
 * and "Magic Link" templates must point at /auth/confirm with the token hash
 * (docs/features/household-sharing.md, HH-7), and Auth needs custom SMTP to
 * reach anyone outside the project's team.
 *
 * `createUser: false` is the invite page's "email me a new link": the
 * invitation email already created the account, so a re-send never creates
 * one for an address typed by whoever holds the link.
 *
 * Returns whether Supabase accepted the email; the caller still shows the link
 * either way, so a mail problem never blocks an invitation.
 */
export async function sendInvitationEmail(
  email: string,
  token: string,
  { createUser = true }: { createUser?: boolean } = {}
): Promise<boolean> {
  const origin = await requestOrigin()
  if (!origin) return false

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, flowType: 'implicit' } }
  )

  try {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: createUser, emailRedirectTo: `${origin}${invitePath(token)}` },
    })
    return !error
  } catch {
    return false
  }
}

/** The origin the inviter is on, so a preview deploy emails a preview link. */
async function requestOrigin(): Promise<string | null> {
  const headerList = await headers()
  const host = headerList.get('x-forwarded-host') ?? headerList.get('host')
  if (!host || !/^[a-z0-9.-]+(:\d+)?$/i.test(host)) return null
  const proto = headerList.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  return `${proto === 'http' ? 'http' : 'https'}://${host}`
}
