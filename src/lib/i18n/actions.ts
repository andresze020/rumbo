'use server'

import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { isLocale, LOCALE_COOKIE } from './server'

export async function setLocaleAction(locale: string) {
  if (!isLocale(locale)) return

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    const { error } = await supabase
      .from('profiles')
      .update({ locale })
      .eq('id', user.id)

    if (error) {
      throw new Error('Could not save the language preference.')
    }
  }

  const store = await cookies()
  store.set(LOCALE_COOKIE, locale, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  })
}
