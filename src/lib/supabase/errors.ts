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
]

const MAX_SAFE_MESSAGE_LENGTH = 180

export function cleanSupabaseActionError(
  message: string | undefined,
  fallback: string
) {
  const cleaned = message
    ?.replace(/^ERROR:\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (!cleaned || cleaned.length > MAX_SAFE_MESSAGE_LENGTH) {
    return fallback
  }

  if (INTERNAL_ERROR_PATTERNS.some((pattern) => pattern.test(cleaned))) {
    return fallback
  }

  return cleaned
}
