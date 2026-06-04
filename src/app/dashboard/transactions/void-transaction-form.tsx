'use client'

import { useState } from 'react'
import { voidTransactionAction } from './actions'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { SubmitButton } from '@/components/submit-button'

type VoidTransactionFormProps = {
  transactionId: string
}

export function VoidTransactionForm({
  transactionId,
}: VoidTransactionFormProps) {
  const [confirming, setConfirming] = useState(false)

  if (!confirming) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setConfirming(true)}>
        Void
      </Button>
    )
  }

  return (
    <form action={voidTransactionAction}>
      <input type="hidden" name="transaction_id" value={transactionId} />

      <div className="flex flex-wrap items-start gap-2">
        <Textarea
          name="void_reason"
          placeholder="Reason (optional)"
          className="min-h-12 w-48 text-sm"
        />
        <div className="flex gap-1.5">
          <SubmitButton type="submit" variant="destructive" size="sm" pendingText="Voiding">
            Confirm void
          </SubmitButton>
          <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>
            Cancel
          </Button>
        </div>
      </div>
    </form>
  )
}
