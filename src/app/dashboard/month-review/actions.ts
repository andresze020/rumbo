'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

function normalizeMonth(value: FormDataEntryValue | null) {
  const month = String(value ?? '').trim()
  return /^\d{4}-\d{2}$/.test(month) ? month : null
}

function monthPath(month: string, params: Record<string, string>) {
  const search = new URLSearchParams({ month })
  for (const [key, value] of Object.entries(params)) search.set(key, value)
  return `/dashboard/month-review?${search.toString()}`
}

function parseFiniteNumber(value: FormDataEntryValue | null) {
  const n = Number(String(value ?? '').trim())
  return Number.isFinite(n) ? n : null
}

async function getAuthenticatedHousehold(month: string | null) {
  const supabase = await createClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()
  if (userError || !user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('default_household_id')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile?.default_household_id) redirect('/onboarding')

  return { supabase, userId: user.id, householdId: profile.default_household_id as string, month }
}

// BR-021: light "close month" — records a review marker + a snapshot of the
// month's headline figures. Does NOT lock the ledger.
export async function closeMonthAction(formData: FormData) {
  const month = normalizeMonth(formData.get('month'))
  if (!month) redirect('/dashboard/month-review')

  const note = String(formData.get('note') ?? '').trim()
  const snapshot = {
    income: parseFiniteNumber(formData.get('income')),
    expenses: parseFiniteNumber(formData.get('expenses')),
    savings: parseFiniteNumber(formData.get('savings')),
    savings_rate: parseFiniteNumber(formData.get('savings_rate')),
    score: parseFiniteNumber(formData.get('score')),
    grade: String(formData.get('grade') ?? '').trim() || null,
    currency: String(formData.get('currency') ?? '').trim() || null,
  }

  const { supabase, userId, householdId } = await getAuthenticatedHousehold(month)

  const { error } = await supabase.from('month_closures').insert({
    household_id: householdId,
    closure_month: `${month}-01`,
    closed_by: userId,
    note: note || null,
    snapshot,
  })

  if (error) {
    // Unique violation → already closed; treat as a no-op success.
    if (error.code === '23505') {
      redirect(monthPath(month, { closed: '1' }))
    }
    redirect(monthPath(month, { error: 'Could not close this month. Please try again.' }))
  }

  revalidatePath('/dashboard/month-review')
  revalidatePath('/dashboard')
  redirect(monthPath(month, { closed: '1' }))
}

export async function reopenMonthAction(formData: FormData) {
  const month = normalizeMonth(formData.get('month'))
  if (!month) redirect('/dashboard/month-review')

  const { supabase, householdId } = await getAuthenticatedHousehold(month)

  const { error } = await supabase
    .from('month_closures')
    .delete()
    .eq('household_id', householdId)
    .eq('closure_month', `${month}-01`)

  if (error) {
    redirect(monthPath(month, { error: 'Could not reopen this month. Please try again.' }))
  }

  revalidatePath('/dashboard/month-review')
  revalidatePath('/dashboard')
  redirect(monthPath(month, { reopened: '1' }))
}
