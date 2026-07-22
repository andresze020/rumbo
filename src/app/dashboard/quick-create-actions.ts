'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { QuickAddAccount, QuickAddCategory } from './quick-add-actions'

/**
 * Lightweight "create while entering a transaction" helpers. Unlike the full
 * create actions under accounts/ and categories/ (which validate a rich form
 * and redirect), these take the minimum safe fields, insert, and return the new
 * row so the transaction form can select it inline without navigating away.
 */

const ACCOUNT_TYPES = [
  'cash',
  'checking',
  'savings',
  'credit_card',
  'debt',
  'investment',
  'other',
] as const
type AccountType = (typeof ACCOUNT_TYPES)[number]

function getAccountClass(accountType: AccountType): 'asset' | 'liability' {
  return accountType === 'credit_card' || accountType === 'debt' ? 'liability' : 'asset'
}

async function getAuthenticatedHousehold() {
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
  return { supabase, userId: user.id, householdId: profile.default_household_id }
}

type CreateCategoryResult =
  | { category: QuickAddCategory }
  | { error: string }

/**
 * Creates a top-level category of the given type. The reporting type is derived
 * from the category type (income→income, expense→expense), the only pairings a
 * plain income/expense entry needs — see isCompatibleReportingType in
 * categories/actions.ts.
 */
export async function quickCreateCategory(
  name: string,
  categoryType: 'income' | 'expense'
): Promise<CreateCategoryResult> {
  const trimmed = name.trim()
  if (!trimmed) return { error: 'Category name is required.' }
  if (categoryType !== 'income' && categoryType !== 'expense') {
    return { error: 'Invalid category type.' }
  }

  const auth = await getAuthenticatedHousehold()
  if (!auth) return { error: 'Not authenticated.' }
  const { supabase, householdId } = auth

  const reportingType = categoryType === 'income' ? 'income' : 'expense'

  const { data, error } = await supabase
    .from('categories')
    .insert({
      household_id: householdId,
      name: trimmed,
      category_type: categoryType,
      reporting_type: reportingType,
      parent_category_id: null,
    })
    .select('id, name, category_type, reporting_type, parent_category_id, icon, color')
    .single()

  if (error || !data) {
    return { error: 'Could not create the category.' }
  }

  revalidatePath('/dashboard/categories')
  return { category: data as QuickAddCategory }
}

type CreateAccountResult = { account: QuickAddAccount } | { error: string }

/**
 * Creates an account with the minimum ledger-safe fields the caller must
 * supply: name, account type (drives asset/liability class), and an active
 * currency. Everything else (institution, notes, …) can be filled in later on
 * the accounts page.
 */
export async function quickCreateAccount(input: {
  name: string
  accountType: string
  currencyCode: string
}): Promise<CreateAccountResult> {
  const name = input.name.trim()
  const accountType = input.accountType.trim()
  const currencyCode = input.currencyCode.trim().toUpperCase()

  if (!name) return { error: 'Account name is required.' }
  if (!ACCOUNT_TYPES.includes(accountType as AccountType)) {
    return { error: 'Select a valid account type.' }
  }
  if (!currencyCode) return { error: 'Select a currency.' }

  const auth = await getAuthenticatedHousehold()
  if (!auth) return { error: 'Not authenticated.' }
  const { supabase, userId, householdId } = auth

  const { data: currency } = await supabase
    .from('currencies')
    .select('code')
    .eq('code', currencyCode)
    .eq('is_active', true)
    .maybeSingle()

  if (!currency) return { error: 'Select a valid active currency.' }

  const { data, error } = await supabase
    .from('accounts')
    .insert({
      household_id: householdId,
      name,
      account_type: accountType,
      account_class: getAccountClass(accountType as AccountType),
      currency_code: currencyCode,
      include_in_net_worth: true,
      created_by: userId,
    })
    .select('id, name, currency_code, institution_name, account_type, icon, color')
    .single()

  if (error || !data) {
    return { error: 'Could not create the account.' }
  }

  revalidatePath('/dashboard/accounts')
  return { account: data as QuickAddAccount }
}
