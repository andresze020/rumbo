import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { readInviteReturnPath } from '@/lib/households/invite-cookie'

export default async function HomePage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // HH-4 (S14): back from email confirmation with an invitation pending.
  const invitePath = await readInviteReturnPath()
  if (invitePath) {
    redirect(invitePath)
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('default_household_id')
    .eq('id', user.id)
    .maybeSingle()

  if (error || !profile?.default_household_id) {
    redirect('/onboarding')
  }

  redirect('/dashboard')
}
