'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useToast } from '@/components/toast-provider'
import { useUiTranslation } from '@/lib/i18n/use-ui-translation'

export type FlashFlag = {
  /** Search param a server-action redirect sets to `1`, e.g. `created`. */
  param: string
  /** English UI phrase; translated through the UI catalog. */
  message: string
}

/**
 * Turns one-shot `?flag=1` confirmations from a server-action redirect into a
 * toast that dismisses itself, then strips the flags from the URL (MQ-019).
 *
 * A success `Callout` rendered from the same flag stayed pinned at the top of
 * the page for as long as you stayed on it — "Budget created." while you were
 * already three lines into the budget — and came back on a refresh. Errors are
 * not for this: they should stay until read.
 *
 * Same consume-once pattern as `ArchiveToast` and `TransactionToasts`, without
 * their undo plumbing.
 */
export function FlashToast({ flags }: { flags: FlashFlag[] }) {
  const { toast } = useToast()
  const ui = useUiTranslation()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const hasRun = useRef(false)

  useEffect(() => {
    if (hasRun.current) return
    const present = flags.filter((flag) => searchParams.get(flag.param) === '1')
    if (!present.length) return
    hasRun.current = true

    const frame = window.requestAnimationFrame(() => {
      for (const flag of present) toast({ message: ui(flag.message) })

      const params = new URLSearchParams(searchParams.toString())
      for (const flag of present) params.delete(flag.param)
      router.replace(params.size ? `${pathname}?${params.toString()}` : pathname, { scroll: false })
    })

    return () => window.cancelAnimationFrame(frame)
    // Run once on mount to consume the redirect flags from the URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}
