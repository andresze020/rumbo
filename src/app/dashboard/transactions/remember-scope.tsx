'use client'

import { useEffect } from 'react'
import {
  TRANSACTION_SCOPE_COOKIE,
  TRANSACTION_SCOPE_MAX_AGE,
  TRANSACTION_SCOPE_MAX_LENGTH,
} from '@/lib/filters/transaction-scope-memory'

/**
 * Writes the currently applied filter scope to the cookie the transactions page
 * reads on a bare landing, so leaving the screen (or creating a transaction and
 * being redirected back) returns to the same view.
 *
 * Renders nothing: this is the write half of the memory, the read half lives in
 * the page's server component.
 */
export function RememberTransactionScope({ query }: { query: string }) {
  useEffect(() => {
    if (query.length > TRANSACTION_SCOPE_MAX_LENGTH) return
    document.cookie = [
      `${TRANSACTION_SCOPE_COOKIE}=${encodeURIComponent(query)}`,
      'path=/',
      `max-age=${TRANSACTION_SCOPE_MAX_AGE}`,
      'samesite=lax',
    ].join('; ')
  }, [query])

  return null
}
