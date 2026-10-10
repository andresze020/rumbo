import { NextResponse } from 'next/server'
import { readInviteReturnPath } from '@/lib/households/invite-cookie'
import { LOCALE_COOKIE, normalizeLocale } from '@/lib/i18n/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (!code) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent('Sign-in was cancelled or failed. Please try again.')}`
    )
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent('Could not complete sign-in. Please try again.')}`
    )
  }

  // Redirect to onboarding if the user has no household yet
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('default_household_id, locale')
      .eq('id', user.id)
      .maybeSingle()

    // HH-4 (S14): an invitee goes back to the invitation they opened, before
    // any create-your-household step (INV-9).
    const invitePath = await readInviteReturnPath()

    if (!invitePath && !profile?.default_household_id) {
      return NextResponse.redirect(`${origin}/onboarding`)
    }

    const response = NextResponse.redirect(`${origin}${invitePath ?? '/dashboard'}`)
    const locale = normalizeLocale(profile?.locale)
    if (locale) {
      response.cookies.set(LOCALE_COOKIE, locale, {
        path: '/',
        maxAge: 60 * 60 * 24 * 365,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
      })
    }
    return response
  }

  return NextResponse.redirect(`${origin}/dashboard`)
}
