'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function signInAction(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')

  if (!email || !password) {
    throw new Error('Email and password are required')
  }

  const supabase = await createClient()

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    throw new Error('Could not sign in with those credentials.')
  }

  redirect('/dashboard')
}

export async function signUpAction(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  const displayName = String(formData.get('displayName') ?? '').trim()

  if (!email || !password) {
    throw new Error('Email and password are required')
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
    throw new Error('Could not create the account. Please try again.')
  }

  redirect('/onboarding')
}
