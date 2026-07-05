'use server'

import { createClient } from '@/lib/supabase/server'

export type QuickAddAccount = {
  id: string
  name: string
  currency_code: string
  institution_name: string | null
  account_type: string
  icon: string | null
  color: string | null
}

export type QuickAddCategory = {
  id: string
  name: string
  category_type: string
  reporting_type: string
  parent_category_id: string | null
  icon: string | null
  color: string | null
}

export type QuickAddFormData = {
  baseCurrency: string
  accounts: QuickAddAccount[]
  categories: QuickAddCategory[]
}

export async function getQuickAddFormData(): Promise<QuickAddFormData | null> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return null

    const { data: profile } = await supabase
      .from('profiles')
      .select('default_household_id')
      .eq('id', user.id)
      .maybeSingle()

    if (!profile?.default_household_id) return null

    const householdId = profile.default_household_id

    const [householdResult, accountsResult, categoriesResult] = await Promise.all([
      supabase
        .from('households')
        .select('base_currency')
        .eq('id', householdId)
        .single(),
      supabase
        .from('accounts')
        .select('id, name, currency_code, institution_name, account_type, icon, color')
        .eq('household_id', householdId)
        .eq('is_archived', false)
        .is('deleted_at', null)
        .order('sort_order', { ascending: true, nullsFirst: false })
        .order('name', { ascending: true }),
      supabase
        .from('categories')
        .select('id, name, category_type, reporting_type, parent_category_id, icon, color')
        .eq('household_id', householdId)
        .eq('is_archived', false)
        .is('deleted_at', null)
        .order('parent_category_id', { ascending: true, nullsFirst: true })
        .order('sort_order', { ascending: true, nullsFirst: false })
        .order('name', { ascending: true }),
    ])

    return {
      baseCurrency: householdResult.data?.base_currency ?? 'CAD',
      accounts: (accountsResult.data ?? []) as QuickAddAccount[],
      categories: (categoriesResult.data ?? []) as QuickAddCategory[],
    }
  } catch {
    return null
  }
}
