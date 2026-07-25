'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

const MATCH_FIELDS = ['description', 'merchant_name', 'amount', 'account_name']
const TEXT_OPERATORS = ['contains', 'equals', 'starts_with', 'ends_with', 'regex']
const AMOUNT_OPERATORS = ['equals', 'gt', 'lt']
const NAME_MAX_LENGTH = 80
const VALUE_MAX_LENGTH = 200

function redirectWithError(message: string): never {
  redirect(`/dashboard/rules?error=${encodeURIComponent(message)}`)
}

async function getAuthenticatedHousehold() {
  const supabase = await createClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    redirect('/login')
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('default_household_id')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError) {
    redirectWithError('Could not load your household.')
  }

  if (!profile?.default_household_id) {
    redirect('/onboarding')
  }

  return {
    supabase,
    userId: user.id,
    householdId: profile.default_household_id as string,
  }
}

// Rules affect CSV import categorization; refresh both surfaces.
function revalidateRuleSurfaces() {
  revalidatePath('/dashboard/rules')
  revalidatePath('/dashboard/transactions/import')
}

type ParsedRule = {
  name: string | null
  matchField: string
  operator: string
  matchValue: string
  categoryId: string
  priority: number
  isActive: boolean
}

// Shared field parsing + validation for create and update.
function parseRuleForm(formData: FormData): ParsedRule {
  const name = String(formData.get('name') ?? '')
    .trim()
    .slice(0, NAME_MAX_LENGTH)
  const matchField = String(formData.get('match_field') ?? '').trim()
  const operator = String(formData.get('operator') ?? '').trim()
  const matchValue = String(formData.get('match_value') ?? '')
    .trim()
    .slice(0, VALUE_MAX_LENGTH)
  const categoryId = String(formData.get('category_id') ?? '').trim()
  const priorityRaw = Number(String(formData.get('priority') ?? '').trim())
  const isActive = String(formData.get('is_active') ?? '') === 'true'

  if (!MATCH_FIELDS.includes(matchField)) {
    redirectWithError('Choose a valid field to match on.')
  }

  const allowedOperators =
    matchField === 'amount' ? AMOUNT_OPERATORS : TEXT_OPERATORS
  if (!allowedOperators.includes(operator)) {
    redirectWithError('That operator is not valid for the chosen field.')
  }

  if (!matchValue) {
    redirectWithError('Enter the value to match against.')
  }

  if (matchField === 'amount' && !Number.isFinite(Number(matchValue))) {
    redirectWithError('Amount rules need a numeric value.')
  }

  if (operator === 'regex') {
    try {
      new RegExp(matchValue)
    } catch {
      redirectWithError('The regular expression is not valid.')
    }
  }

  if (!categoryId) {
    redirectWithError('Choose a category to apply.')
  }

  const priority =
    Number.isFinite(priorityRaw) && priorityRaw >= 0
      ? Math.floor(priorityRaw)
      : 100

  return {
    name: name || null,
    matchField,
    operator,
    matchValue,
    categoryId,
    priority,
    isActive,
  }
}

// Guard: the category must belong to this household (RLS also enforces it, but a
// clean error beats a foreign-key violation).
async function assertCategoryInHousehold(
  supabase: Awaited<ReturnType<typeof getAuthenticatedHousehold>>['supabase'],
  householdId: string,
  categoryId: string
) {
  const { data, error } = await supabase
    .from('categories')
    .select('id')
    .eq('id', categoryId)
    .eq('household_id', householdId)
    .is('deleted_at', null)
    .maybeSingle()

  if (error || !data) {
    redirectWithError('That category was not found for this household.')
  }
}

export async function createRuleAction(formData: FormData) {
  const parsed = parseRuleForm(formData)
  const { supabase, userId, householdId } = await getAuthenticatedHousehold()

  await assertCategoryInHousehold(supabase, householdId, parsed.categoryId)

  const { error } = await supabase.from('categorization_rules').insert({
    household_id: householdId,
    name: parsed.name,
    match_field: parsed.matchField,
    operator: parsed.operator,
    match_value: parsed.matchValue,
    category_id: parsed.categoryId,
    priority: parsed.priority,
    is_active: parsed.isActive,
    created_by: userId,
  })

  if (error) {
    redirectWithError('Could not create the rule. Please try again.')
  }

  revalidateRuleSurfaces()
  redirect('/dashboard/rules?created=1')
}

export async function updateRuleAction(formData: FormData) {
  const ruleId = String(formData.get('rule_id') ?? '').trim()
  if (!ruleId) {
    redirectWithError('Rule is required.')
  }

  const parsed = parseRuleForm(formData)
  const { supabase, householdId } = await getAuthenticatedHousehold()

  await assertCategoryInHousehold(supabase, householdId, parsed.categoryId)

  const { error } = await supabase
    .from('categorization_rules')
    .update({
      name: parsed.name,
      match_field: parsed.matchField,
      operator: parsed.operator,
      match_value: parsed.matchValue,
      category_id: parsed.categoryId,
      priority: parsed.priority,
      is_active: parsed.isActive,
    })
    .eq('id', ruleId)
    .eq('household_id', householdId)

  if (error) {
    redirectWithError('Could not update the rule. Please try again.')
  }

  revalidateRuleSurfaces()
  redirect('/dashboard/rules?updated=1')
}

export async function toggleRuleAction(formData: FormData) {
  const ruleId = String(formData.get('rule_id') ?? '').trim()
  const isActive = String(formData.get('is_active') ?? '') === 'true'

  if (!ruleId) {
    redirectWithError('Rule is required.')
  }

  const { supabase, householdId } = await getAuthenticatedHousehold()

  const { error } = await supabase
    .from('categorization_rules')
    .update({ is_active: isActive })
    .eq('id', ruleId)
    .eq('household_id', householdId)

  if (error) {
    redirectWithError('Could not update the rule.')
  }

  revalidateRuleSurfaces()
  redirect('/dashboard/rules?updated=1')
}

export async function deleteRuleAction(formData: FormData) {
  const ruleId = String(formData.get('rule_id') ?? '').trim()

  if (!ruleId) {
    redirectWithError('Rule is required.')
  }

  const { supabase, householdId } = await getAuthenticatedHousehold()

  const { error } = await supabase
    .from('categorization_rules')
    .delete()
    .eq('id', ruleId)
    .eq('household_id', householdId)

  if (error) {
    redirectWithError('Could not delete the rule.')
  }

  revalidateRuleSurfaces()
  redirect('/dashboard/rules?deleted=1')
}
