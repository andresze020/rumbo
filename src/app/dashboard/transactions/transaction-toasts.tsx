'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useToast } from '@/components/toast-provider'
import { useLanguage } from '@/components/language-provider'
import { unvoidTransactionAction } from './actions'

type PendingUndo = {
  id: string
  restoreStatus: string
}

export function TransactionToasts() {
  const { toast } = useToast()
  const { t } = useLanguage()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const hasRun = useRef(false)
  const formRef = useRef<HTMLFormElement>(null)
  // BR-015: the void redirect carries the id + prior status so "Undo" can
  // restore it. Captured into state on mount so it survives the URL cleanup
  // that strips the flags immediately after.
  const [pendingUndo, setPendingUndo] = useState<PendingUndo | null>(null)

  useEffect(() => {
    if (hasRun.current) return

    const created = searchParams.get('created') === '1'
    const updated = searchParams.get('updated') === '1'
    const voided = searchParams.get('voided') === '1'
    const unvoided = searchParams.get('unvoided') === '1'
    if (!created && !updated && !voided && !unvoided) return

    hasRun.current = true

    // Defer to a frame so the toast + captured undo state settle outside the
    // effect body (mirrors ArchiveToast), then strip the flags from the URL.
    const frame = window.requestAnimationFrame(() => {
      if (created) toast({ message: t('transactionsList.toastCreated') })
      if (updated) toast({ message: t('transactionsList.toastUpdated') })
      if (unvoided) toast({ message: t('transactionsList.toastRestored') })
      if (voided) {
        const undoId = searchParams.get('undo_id')
        const undoStatus = searchParams.get('undo_status')
        const restoreStatus = undoStatus === 'pending' ? 'pending' : 'posted'
        if (undoId) setPendingUndo({ id: undoId, restoreStatus })

        toast({
          message: t('transactionsList.toastVoided'),
          action: undoId
            ? { label: t('common.undo'), onClick: () => formRef.current?.requestSubmit() }
            : undefined,
        })
      }

      const params = new URLSearchParams(searchParams.toString())
      params.delete('created')
      params.delete('updated')
      params.delete('voided')
      params.delete('unvoided')
      params.delete('undo_id')
      params.delete('undo_status')
      router.replace(params.size ? `${pathname}?${params.toString()}` : pathname, { scroll: false })
    })

    return () => window.cancelAnimationFrame(frame)
    // Run once on mount to consume the redirect flags from the URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!pendingUndo) return null

  return (
    <form ref={formRef} action={unvoidTransactionAction} hidden>
      <input type="hidden" name="transaction_id" value={pendingUndo.id} />
      <input type="hidden" name="restore_status" value={pendingUndo.restoreStatus} />
    </form>
  )
}
