'use server'

import { createClient } from '@/lib/supabase/server'
import { getUiPreferences } from '@/lib/preferences/server'
import {
  loadCategoryEntryMemory,
  type CategoryEntryMemory,
} from '@/lib/quick-entry/category-memory'
import type { UiPreferences } from '@/lib/preferences/shared'

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
  is_system?: boolean
}

export type QuickAddPayee = {
  id: string
  name: string
}

export type QuickAddTag = {
  id: string
  name: string
  color: string | null
}

export type QuickAddFormData = {
  baseCurrency: string
  accounts: QuickAddAccount[]
  categories: QuickAddCategory[]
  payees: QuickAddPayee[]
  tags: QuickAddTag[]
  currencies: string[]
  /** BR-032: which optional form fields this user wants rendered. */
  formFields: UiPreferences['formFields']
  /** BR-046: field order, autofill and auto-advance. */
  quickEntry: UiPreferences['quickEntry']
  /**
   * BR-046: what the last entry in each category looked like. Empty when the
   * autofill preference is off — there is no reason to ship a map the form is
   * not allowed to read.
   */
  categoryMemory: CategoryEntryMemory
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
    const preferences = await getUiPreferences()

    const [householdResult, accountsResult, categoriesResult, payeesResult, tagsResult, currenciesResult] = await Promise.all([
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
        .select('id, name, category_type, reporting_type, parent_category_id, icon, color, is_system')
        .eq('household_id', householdId)
        .eq('is_archived', false)
        .is('deleted_at', null)
        .order('parent_category_id', { ascending: true, nullsFirst: true })
        .order('sort_order', { ascending: true, nullsFirst: false })
        .order('name', { ascending: true }),
      supabase
        .from('payees')
        .select('id, name')
        .eq('household_id', householdId)
        .order('name', { ascending: true }),
      supabase
        .from('tags')
        .select('id, name, color')
        .eq('household_id', householdId)
        .eq('is_archived', false)
        .order('name', { ascending: true }),
      supabase
        .from('currencies')
        .select('code')
        .eq('is_active', true)
        .order('code', { ascending: true }),
    ])

    // Only fetched when the user has actually turned the autofill on, so the
    // default install pays nothing for a feature it is not using.
    const categoryMemory = preferences.quickEntry.autofillFromLastInCategory
      ? await loadCategoryEntryMemory(supabase, householdId)
      : {}

    return {
      baseCurrency: householdResult.data?.base_currency ?? 'CAD',
      accounts: (accountsResult.data ?? []) as QuickAddAccount[],
      categories: (categoriesResult.data ?? []) as QuickAddCategory[],
      payees: (payeesResult.data ?? []) as QuickAddPayee[],
      tags: (tagsResult.data ?? []) as QuickAddTag[],
      currencies: (currenciesResult.data ?? []).map((c) => c.code as string),
      formFields: preferences.formFields,
      quickEntry: preferences.quickEntry,
      categoryMemory,
    }
  } catch {
    return null
  }
}
