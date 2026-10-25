'use client'

import { useTransactionDialog } from '@/components/transaction-dialog-provider'

/** The harness's "+": opens the entry dialog with no options, like the bottom bar. */
export function OpenEntryButton() {
  const { openDialog } = useTransactionDialog()
  return (
    <button
      id="open-entry"
      type="button"
      onClick={() => openDialog()}
      style={{ position: 'fixed', right: 20, bottom: 20, width: 48, height: 48 }}
    />
  )
}
