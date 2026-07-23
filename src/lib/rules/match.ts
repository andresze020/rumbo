// BR-010 — categorization rules engine (shared matcher).
//
// A rule says: "when <matchField> <operator> <matchValue>, file the transaction
// under <categoryId>". Rules are evaluated highest-priority-first (lowest
// `priority` number first); the first matching rule wins. This module is the
// single source of truth for rule evaluation across the app (CSV import preview
// today; manual-entry suggestions later).

export type RuleMatchField =
  | 'description'
  | 'merchant_name'
  | 'amount'
  | 'account_name'

export type RuleOperator =
  | 'contains'
  | 'equals'
  | 'starts_with'
  | 'ends_with'
  | 'regex'
  | 'gt'
  | 'lt'

export type CategorizationRule = {
  id: string
  name: string | null
  matchField: RuleMatchField
  operator: RuleOperator
  matchValue: string
  categoryId: string
  priority: number
}

export type RuleInput = {
  description?: string | null
  merchantName?: string | null
  /** Signed amount; amount comparisons use its absolute value. */
  amount?: number | null
  accountName?: string | null
}

const TEXT_FIELDS: RuleMatchField[] = [
  'description',
  'merchant_name',
  'account_name',
]

function textValue(field: RuleMatchField, input: RuleInput): string | null {
  switch (field) {
    case 'description':
      return input.description ?? null
    case 'merchant_name':
      return input.merchantName ?? null
    case 'account_name':
      return input.accountName ?? null
    default:
      return null
  }
}

/** Does a single rule match the given transaction-ish input? */
export function matchesRule(rule: CategorizationRule, input: RuleInput): boolean {
  if (rule.matchField === 'amount') {
    const amount = input.amount
    if (amount === null || amount === undefined || !Number.isFinite(amount)) {
      return false
    }
    const target = Number(rule.matchValue)
    if (!Number.isFinite(target)) return false
    const magnitude = Math.abs(amount)
    switch (rule.operator) {
      case 'gt':
        return magnitude > target
      case 'lt':
        return magnitude < target
      case 'equals':
        return magnitude === target
      default:
        return false
    }
  }

  if (!TEXT_FIELDS.includes(rule.matchField)) return false

  const raw = textValue(rule.matchField, input)
  if (raw === null) return false
  const haystack = raw.trim().toLowerCase()
  if (!haystack) return false
  const needle = rule.matchValue.trim().toLowerCase()

  switch (rule.operator) {
    case 'contains':
      return haystack.includes(needle)
    case 'equals':
      return haystack === needle
    case 'starts_with':
      return haystack.startsWith(needle)
    case 'ends_with':
      return haystack.endsWith(needle)
    case 'regex':
      try {
        // Case-insensitive; matched against the untrimmed original so anchors
        // (^, $) behave predictably.
        return new RegExp(rule.matchValue, 'i').test(raw)
      } catch {
        // An invalid stored regex never matches (it can't create transactions
        // out of thin air), rather than throwing during import/preview.
        return false
      }
    default:
      return false
  }
}

/**
 * First rule (by ascending priority) that matches, or null. Only active rules
 * should be passed in; the caller sorts or we sort defensively here.
 */
export function findMatchingRule(
  rules: CategorizationRule[],
  input: RuleInput
): CategorizationRule | null {
  const ordered = [...rules].sort((a, b) => a.priority - b.priority)
  for (const rule of ordered) {
    if (matchesRule(rule, input)) return rule
  }
  return null
}
