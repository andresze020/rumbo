'use client'

import { useCallback, type MouseEvent } from 'react'
import { useRouter } from 'next/navigation'
import {
  TRANSACTION_SCOPE_COOKIE,
  parseTransactionScope,
} from '@/lib/filters/transaction-scope-memory'

const TRANSACTIONS_PATH = '/dashboard/transactions'

/**
 * The URL of the scope remembered in `af_tx_scope`, read at the moment it is
 * asked for — or null when nothing is remembered.
 */
export function rememberedTransactionsHref(): string | null {
  if (typeof document === 'undefined') return null
  const prefix = `${TRANSACTION_SCOPE_COOKIE}=`
  const raw = document.cookie
    .split('; ')
    .find((entry) => entry.startsWith(prefix))
    ?.slice(prefix.length)
  if (!raw) return null
  const scope = parseTransactionScope(raw)
  if ([...scope.keys()].length === 0) return null
  return `${TRANSACTIONS_PATH}?${scope.toString()}`
}

/**
 * Click handler for a nav link to the bare Transactions URL (MQ-003).
 *
 * What a bare `/dashboard/transactions` renders depends on the scope cookie,
 * but the client Router Cache keys a render by URL alone. The bottom-nav tab
 * fully prefetches that URL, so a re-tap within the cache's lifetime replayed
 * the render made with the cookie as it was *then*: after "Clear filters" the
 * tab returned to the old month — and that stale render's own
 * `RememberTransactionScope` wrote the old month back into the cookie.
 *
 * Navigating to the remembered scope's own URL instead makes the cache key
 * carry the scope. With nothing remembered the link behaves as before. Returns
 * undefined for any other href, so it can be wired to every nav item.
 */
export function useTransactionsLinkClick(href: string) {
  const router = useRouter()
  const handler = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return
      }
      const scoped = rememberedTransactionsHref()
      if (!scoped) return
      event.preventDefault()
      router.push(scoped)
    },
    [router]
  )
  return href === TRANSACTIONS_PATH ? handler : undefined
}
