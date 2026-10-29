const INTERNAL_ERROR_PATTERNS = [
  /\bPGRST\d*\b/i,
  /\bSQLSTATE\b/i,
  /schema cache/i,
  /relation .* does not exist/i,
  /column .* does not exist/i,
  /function .* does not exist/i,
  /operator .* does not exist/i,
  /violates .* constraint/i,
  /duplicate key value/i,
  /row-level security/i,
  /permission denied/i,
  /invalid input syntax/i,
  /null value in column/i,
  /database error/i,
  // A column or function name (from_account_id, update_transfer_transaction)
  // means the message was written for developers, not people.
  /\b[a-z]+_[a-z_]+\b/,
]

/**
 * RPC messages a person can actually trigger, reworded as UI text. The
 * reworded text is what `translateUi` looks up, so each one needs es/fr
 * entries in legacy-ui-translations.ts. Messages already written for people
 * pass through unchanged and only need the translations.
 */
const RPC_MESSAGE_REWORDS: Record<string, string> = {
  'Authentication is required': 'Your session has expired. Sign in again.',
  'from_account_id and to_account_id must be different':
    'Choose two different accounts.',
  'amount must be greater than 0': 'Enter an amount greater than 0.',
  'exchange_rate_to_base must be greater than 0':
    'The exchange rate must be greater than 0.',
  'from account not found for household':
    'One of the accounts is archived or no longer exists.',
  'to account not found for household':
    'One of the accounts is archived or no longer exists.',
  'from account is not active':
    'One of the accounts is archived or no longer exists.',
  'to account is not active':
    'One of the accounts is archived or no longer exists.',
  'from account not found or is not active':
    'One of the accounts is archived or no longer exists.',
  'to account not found or is not active':
    'One of the accounts is archived or no longer exists.',
  'Not authorized to create transfers for this household':
    "You don't have permission to do this in this household.",
  'Not authorized to edit transfers for this household':
    "You don't have permission to do this in this household.",
  'transaction not found': 'This transaction no longer exists.',
  'Cross-currency transfers require the amount received (p_to_amount).':
    'Enter the amount received for a transfer between currencies.',
}

const MAX_SAFE_MESSAGE_LENGTH = 180

export function cleanSupabaseActionError(
  message: string | undefined,
  fallback: string
) {
  const cleaned = message
    ?.replace(/^ERROR:\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (cleaned && RPC_MESSAGE_REWORDS[cleaned]) {
    return RPC_MESSAGE_REWORDS[cleaned]
  }

  if (!cleaned || cleaned.length > MAX_SAFE_MESSAGE_LENGTH) {
    return fallback
  }

  if (INTERNAL_ERROR_PATTERNS.some((pattern) => pattern.test(cleaned))) {
    return fallback
  }

  return cleaned
}
