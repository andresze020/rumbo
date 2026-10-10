/**
 * HH-3 (PRV-5, PRV-6): what `share_private_account` / `set_account_private`
 * report, shaped for the account dialog.
 *
 * Both RPCs refuse with a sentence written for the user (D6, PRV-8, the
 * per-owner name rules). Those are shown as they are — the legacy UI catalog
 * translates them — and anything else (a network error, a Postgres message
 * nobody wrote for a person) becomes the caller's generic fallback.
 */

export type AccountPrivacyImpact = {
  transactions: number
  payees: number
  linkedItems: number
}

const USER_FACING_REFUSALS = new Set([
  'Not authorized to change this account',
  'This account is already private',
  'An account can only be made private while you are the only member of the household',
  // HH-4: D6's second half.
  'An account cannot be made private while an invitation to this household is pending. Revoke it first',
  "A shared card is paid from this account. Change that card's payment account first",
  'You already have a private account with this name. Rename one first',
  'You already have a private import preset with the same name as one that uses this account. Rename one first',
  "This card is paid from a private account. Share that account first, or change the card's payment account",
  'The household already has a shared account with this name. Rename this one first',
  'The household already has a shared import preset with the same name as one that uses this account. Rename one first',
])

export function accountPrivacyRefusal(message: string | null | undefined, fallback: string): string {
  return message && USER_FACING_REFUSALS.has(message) ? message : fallback
}

/** The RPC's jsonb, defensively: a missing count reads as 0, never NaN. */
export function parseAccountPrivacyImpact(value: unknown): AccountPrivacyImpact {
  const row = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const count = (key: string) => {
    const n = Number(row[key])
    return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0
  }
  return {
    transactions: count('transactions'),
    payees: count('payees'),
    linkedItems: count('linked_items'),
  }
}
