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

type AssistantContext = {
  baseCurrency: string
  accounts: TransactionFormAccount[]
  categories: TransactionFormCategory[]
  payees: { id: string; name: string }[]
}

export function AssistantDrawer() {
  const [open, setOpen] = useState(false)
  const [context, setContext] = useState<AssistantContext | null>(null)
  const [, startTransition] = useTransition()
  const pathname = usePathname()

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
        aria-label="Open assistant"
        title="AI Assistant"
        className="fixed bottom-24 right-6 z-50 flex size-12 items-center justify-center rounded-full bg-secondary text-secondary-foreground shadow-lg transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <Bot className="size-5" aria-hidden="true" />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="flex flex-col gap-0 p-0 sm:max-w-lg"
        >
          <SheetHeader className="border-b px-5 py-4">
            <SheetTitle>Assistant</SheetTitle>
            <SheetDescription>
              Ask about your finances or log a transaction from a receipt photo or voice note.
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto p-4">
            {!context ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
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
