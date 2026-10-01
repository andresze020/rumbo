'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useLanguage } from '@/components/language-provider'
import { useToast } from '@/components/toast-provider'
import { translateUi } from '@/lib/i18n/ui'

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
 * The redirect usually lands on the page this component is already mounted on,
 * so it is kept rather than remounted: it consumes on every URL change, not
 * only on mount. Each flagged URL is consumed once — marked when its toast
 * actually fires, so a Strict Mode cleanup that cancels the frame does not
 * swallow it — and the mark clears as soon as a URL without flags is seen, so
 * saving the same line twice toasts twice.
 */
export function FlashToast({ flags }: { flags: FlashFlag[] }) {
  const { toast } = useToast()
  // The provider's locale, not useUiTranslation(): that one reads English
  // until its first frame, the same frame this toast fires in on a fresh load.
  const { locale } = useLanguage()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const consumedUrl = useRef<string | null>(null)

  useEffect(() => {
    const present = flags.filter((flag) => searchParams.get(flag.param) === '1')
    if (!present.length) {
      consumedUrl.current = null
      return
    }

    const query = searchParams.toString()
    const url = `${pathname}?${query}`
    if (consumedUrl.current === url) return

    const frame = window.requestAnimationFrame(() => {
      consumedUrl.current = url
      for (const flag of present) toast({ message: translateUi(locale, flag.message) })

      // Only the consumed flags go; month, filters and the rest stay.
      const params = new URLSearchParams(query)
      for (const flag of present) params.delete(flag.param)
      router.replace(params.size ? `${pathname}?${params.toString()}` : pathname, { scroll: false })
    })

    return () => window.cancelAnimationFrame(frame)
  }, [flags, locale, pathname, router, searchParams, toast])

  return null
}
