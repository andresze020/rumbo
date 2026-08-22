'use client'

import { useState, useTransition, useEffect } from 'react'
import { Bot } from 'lucide-react'
import { usePathname } from 'next/navigation'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { AssistantChat } from '@/app/dashboard/assistant/assistant-chat'
import { getAssistantContextAction } from '@/app/dashboard/assistant/actions'
import type {
  TransactionFormAccount,
  TransactionFormCategory,
} from '@/app/dashboard/transactions/transaction-form'
import { useUiTranslation } from '@/lib/i18n/use-ui-translation'

type AssistantContext = {
  baseCurrency: string
  accounts: TransactionFormAccount[]
  categories: TransactionFormCategory[]
  payees: { id: string; name: string }[]
}

/**
 * True while the page is being scrolled down.
 *
 * The assistant FAB is `fixed` over the content and, on a phone, hangs at the
 * same right edge every amount in a list is aligned to — so a row scrolls
 * underneath it and loses its figure. The standard answer, and the cheapest
 * one here: get out of the way while the page moves down, come back the moment
 * it moves up or stops. The document is the scroller (dashboard `<main>` is a
 * plain flex child, not a scroll container), so this listens on the window.
 */
function useScrollingDown() {
  const [scrollingDown, setScrollingDown] = useState(false)

  useEffect(() => {
    let last = window.scrollY
    let frame = 0
    let idle: ReturnType<typeof setTimeout> | undefined

    const apply = () => {
      frame = 0
      const y = Math.max(0, window.scrollY)
      const delta = y - last
      // Under the threshold this is finger jitter or iOS rubber-banding, both
      // of which report a direction the user did not intend.
      if (Math.abs(delta) < 12) return
      last = y
      // Never near the top: there is nothing to read under the button yet, and
      // a FAB that vanishes on the first flick reads as a bug.
      setScrollingDown(delta > 0 && y > 120)
      // A pause means they stopped to read, not that they are still scrolling.
      if (idle) clearTimeout(idle)
      idle = setTimeout(() => setScrollingDown(false), 1200)
    }

    const schedule = () => {
      if (frame) return
      frame = window.requestAnimationFrame(apply)
    }

    window.addEventListener('scroll', schedule, { passive: true })

    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      if (idle) clearTimeout(idle)
      window.removeEventListener('scroll', schedule)
    }
  }, [])

  return scrollingDown
}

export function AssistantDrawer() {
  const ui = useUiTranslation()
  const [open, setOpen] = useState(false)
  const [context, setContext] = useState<AssistantContext | null>(null)
  const [, startTransition] = useTransition()
  const pathname = usePathname()
  const scrollingDown = useScrollingDown()

  useEffect(() => {
    if (open && !context) {
      startTransition(async () => {
        const result = await getAssistantContextAction()
        if ('error' in result) return
        setContext(result)
      })
    }
  }, [open, context])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={ui('Open assistant')}
        title={ui('AI Assistant')}
        // Fades rather than moves: `vv-pin-corner` already owns this button's
        // transform, and a second one would fight it while the page is zoomed.
        data-away={scrollingDown && !open ? 'true' : undefined}
        className="vv-pin-corner [--vv-pin-inset-x:1.5rem] [--vv-pin-inset-y:6rem] fixed bottom-[calc(6rem+env(safe-area-inset-bottom))] right-6 z-50 flex size-12 items-center justify-center rounded-full bg-secondary text-secondary-foreground shadow-lg transition-opacity duration-200 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 data-[away=true]:pointer-events-none data-[away=true]:opacity-0"
      >
        <Bot className="size-5" aria-hidden="true" />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="flex flex-col gap-0 p-0 sm:max-w-lg"
        >
          <SheetHeader className="border-b px-5 py-4">
            <SheetTitle>{ui('Assistant')}</SheetTitle>
            <SheetDescription>
              {ui('Ask about your finances or log a transaction from a receipt photo or voice note.')}
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto p-4">
            {!context ? (
              <p className="text-sm text-muted-foreground">{ui('Loading…')}</p>
            ) : (
              <AssistantChat
                baseCurrency={context.baseCurrency}
                accounts={context.accounts}
                categories={context.categories}
                payees={context.payees}
                returnTo={pathname}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
