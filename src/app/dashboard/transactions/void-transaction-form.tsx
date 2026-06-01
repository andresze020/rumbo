'use client'

import type { FormEvent } from 'react'
import { useState } from 'react'
import { voidTransactionAction } from './actions'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

type VoidTransactionFormProps = {
  transactionId: string
}

export function VoidTransactionForm({
  transactionId,
}: VoidTransactionFormProps) {
  const [showReason, setShowReason] = useState(false)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (
      !window.confirm(
        'Void this transaction? It will remain visible but will no longer affect balances or dashboard metrics.'
      )
    ) {
      event.preventDefault()
    }
  }

  return (
    <form action={voidTransactionAction} onSubmit={handleSubmit}>
      <input type="hidden" name="transaction_id" value={transactionId} />

      {showReason ? (
        <Textarea
          name="void_reason"
          placeholder="Reason"
          className="mb-2 min-h-16"
        />
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="outline" size="sm">
          Void
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setShowReason((current) => !current)}
        >
          {showReason ? 'Hide reason' : 'Add reason'}
        </Button>
      </div>
    </form>
  )
}
