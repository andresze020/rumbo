'use server'

import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { LOCALE_COOKIE, normalizeLocale } from '@/lib/i18n/server'
import { createClient } from '@/lib/supabase/server'

function redirectWithLoginError(message: string, mode?: string): never {
  const modeParam = mode ? `&mode=${mode}` : ''
  redirect(`/login?error=${encodeURIComponent(message)}${modeParam}`)
}

export async function signInAction(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')

  if (!email || !password) {
    redirectWithLoginError('Email and password are required.')
  }

  const supabase = await createClient()

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    redirectWithLoginError('Could not sign in with those credentials.')
  }

  if (data.user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('locale')
      .eq('id', data.user.id)
      .maybeSingle()
    const locale = normalizeLocale(profile?.locale)

    if (locale) {
      const store = await cookies()
      store.set(LOCALE_COOKIE, locale, {
        path: '/',
        maxAge: 60 * 60 * 24 * 365,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
      })
    }
  }

  redirect('/dashboard')
}

export async function signUpAction(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  const displayName = String(formData.get('displayName') ?? '').trim()

  if (!email || !password) {
    redirectWithLoginError('Email and password are required.', 'signup')
  }

  const supabase = await createClient()

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        display_name: displayName || null,
      },
    },
  })

  if (error) {
    const lower = (error.message ?? '').toLowerCase()

    if (lower.includes('password')) {
      redirectWithLoginError(
        error.message ?? 'Password does not meet the requirements. Try a longer or more complex password.',
        'signup'
      )
    } else if (
      lower.includes('already registered') ||
      lower.includes('already been registered') ||
      lower.includes('email address already')
    ) {
      redirectWithLoginError(
        'An account with this email already exists. Try signing in instead.'
      )
    } else {
      redirectWithLoginError('Could not create the account. Please try again.', 'signup')
    }
  }

  redirect('/onboarding')
}
