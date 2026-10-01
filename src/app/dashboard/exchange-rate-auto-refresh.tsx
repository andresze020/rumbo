'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { refreshExchangeRatesAction } from './exchange-rate-actions'
import { fxRefreshDue, fxToday } from '@/lib/fx'

const STORAGE_KEY = 'af_fx_refreshed_on'

/**
 * Keeps the household's exchange rates current without anyone typing one.
 *
 * Renders nothing. On the first dashboard render of a browser session it asks
 * the server to top up any rate that is not dated today; the action itself is
 * idempotent and cheap when everything is already fresh.
 *
 * Once per session per day, not once per navigation: `sessionStorage` records
 * the day it ran, so moving between screens does not re-hit the provider. That
 * day is `fxToday()` — UTC, the day the action's freshness check uses — not the
 * user's: keyed on the local day, a session east of UTC that ran just after
 * local midnight skipped the provider's new day until the next local one
 * (MQ-001). The
 * accessor is guarded because a private window can throw on it outright, and a
 * failure there must never stop the dashboard rendering.
 */
export function ExchangeRateAutoRefresh() {
  const router = useRouter()

  useEffect(() => {
    const today = fxToday()

    try {
      if (!fxRefreshDue(window.sessionStorage.getItem(STORAGE_KEY))) return
    } catch {
      // No session storage (private window, blocked site data). Fall through:
      // refreshing more often than needed is better than never refreshing.
    }

    let cancelled = false

    void (async () => {
      try {
        const result = await refreshExchangeRatesAction()
        if (cancelled) return

        try {
          window.sessionStorage.setItem(STORAGE_KEY, today)
        } catch {
          // Same as above — the refresh already happened either way.
        }

        // Only a write changes what is on screen; 'fresh' means the figures
        // already reflect today's rate.
        if (result.status === 'updated') router.refresh()
      } catch {
        // The provider is down or offline. The previous rate stays on file and
        // balances keep using it; nothing to tell the user about.
      }
    })()

    return () => {
      cancelled = true
    }
  }, [router])

  return null
}
