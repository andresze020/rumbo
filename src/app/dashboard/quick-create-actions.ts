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
 * Creates a category while entering a transaction.
 *
 * Top-level (no parent): the reporting type is derived from the category type
 * (income→income, expense→expense), the only pairings a plain income/expense
 * entry needs — see isCompatibleReportingType in categories/actions.ts.
 *
 * Subcategory (parentCategoryId given): inherits the parent's category_type and
 * reporting_type so a child can never drift into an incompatible pairing. The
 * parent is re-read under RLS (household_id filter) so a child can only be hung
 * off a category the caller's household actually owns.
 */
export async function quickCreateCategory(
  name: string,
  categoryType: 'income' | 'expense',
  parentCategoryId?: string | null
): Promise<CreateCategoryResult> {
  const trimmed = name.trim()
  if (!trimmed) return { error: 'Category name is required.' }
  if (categoryType !== 'income' && categoryType !== 'expense') {
    return { error: 'Invalid category type.' }
  }

  const auth = await getAuthenticatedHousehold()
  if (!auth) return { error: 'Not authenticated.' }
  const { supabase, householdId } = auth

  const parentId = parentCategoryId?.trim() || null
  let effectiveType: string = categoryType
  let reportingType = categoryType === 'income' ? 'income' : 'expense'

  if (parentId) {
    const { data: parent } = await supabase
      .from('categories')
      .select('category_type, reporting_type')
      .eq('id', parentId)
      .eq('household_id', householdId)
      .is('deleted_at', null)
      .maybeSingle()

    if (!parent) return { error: 'Parent category not found.' }
    effectiveType = parent.category_type
    reportingType = parent.reporting_type
  }

  const { data, error } = await supabase
    .from('categories')
    .insert({
      household_id: householdId,
      name: trimmed,
      category_type: effectiveType,
      reporting_type: reportingType,
      parent_category_id: parentId,
    })
    .select('id, name, category_type, reporting_type, parent_category_id, icon, color')
    .single()

  if (error || !data) {
    // The unique index (household, lower(name), parent) surfaces a duplicate
    // as a 23505 — give that its own message so the picker can show it inline.
    if (error?.code === '23505') {
      return { error: 'A category with that name already exists here.' }
    }
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

type CreatedTag = { id: string; name: string; color: string | null }
type CreateTagResult = { tag: CreatedTag } | { error: string }

/**
 * BR-023: create a tag while entering/editing a transaction, so the user
 * doesn't have to leave a half-filled form to go to the Tags page. Returns the
 * new row (or the existing one on a name collision, so "create" of a duplicate
 * just resolves to the existing tag) for the picker to select inline.
 */
export async function quickCreateTag(name: string): Promise<CreateTagResult> {
  const trimmed = name.trim().slice(0, 60)
  if (!trimmed) return { error: 'Tag name is required.' }

  const auth = await getAuthenticatedHousehold()
  if (!auth) return { error: 'Not authenticated.' }
  const { supabase, householdId } = auth

  const { data, error } = await supabase
    .from('tags')
    .insert({ household_id: householdId, name: trimmed })
    .select('id, name, color')
    .single()

  if (error || !data) {
    // Name already exists (case/whitespace-insensitive unique index): resolve to
    // the existing active tag instead of surfacing an error.
    if (error?.code === '23505') {
      const { data: existing } = await supabase
        .from('tags')
        .select('id, name, color')
        .eq('household_id', householdId)
        .ilike('name', trimmed)
        .maybeSingle()
      if (existing) return { tag: existing as CreatedTag }
      return { error: 'A tag with that name already exists.' }
    }
    return { error: 'Could not create the tag.' }
  }

  revalidatePath('/dashboard/tags')
  return { tag: data as CreatedTag }
}
