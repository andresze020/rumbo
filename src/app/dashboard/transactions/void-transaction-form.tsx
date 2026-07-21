'use client'

import { voidTransactionAction } from './actions'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { SubmitButton } from '@/components/submit-button'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

type VoidTransactionFormProps = {
  transactionId: string
}

export function VoidTransactionForm({
  transactionId,
}: VoidTransactionFormProps) {
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button type="button" variant="outline" size="sm" />}>
        Void
      </AlertDialogTrigger>
      <AlertDialogContent>
        <form action={voidTransactionAction}>
          <input type="hidden" name="transaction_id" value={transactionId} />
          <AlertDialogHeader>
            <AlertDialogTitle>Void this transaction?</AlertDialogTitle>
            <AlertDialogDescription>
              Voiding keeps the record for history but removes it from account
              balances and reports. You can undo this right after from the toast.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            name="void_reason"
            placeholder="Reason (optional)"
            className="mt-2 min-h-16 text-sm"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <SubmitButton type="submit" variant="destructive" size="sm" pendingText="Voiding">
              Confirm void
            </SubmitButton>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  )
}
