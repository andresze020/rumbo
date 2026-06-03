'use client'

import Link from 'next/link'
import { useState } from 'react'
import { updateTransferTransactionAction } from './actions'
import { buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { SubmitButton } from '@/components/submit-button'

type TransferAccount = {
  id: string
  name: string
  currency_code: string
  institution_name: string | null
}

type TransferEditFormProps = {
  transactionId: string
  transactionDate: string
  fromAccountId: string
  toAccountId: string
  amount: number
  cancelHref: string
  description: string
  notes: string
  status: string
  accounts: TransferAccount[]
  returnTo: string
}

function formatAccountLabel(account: TransferAccount) {
  return [
    account.name,
    account.institution_name || null,
    account.currency_code,
  ]
    .filter(Boolean)
    .join(' · ')
}

export function TransferEditForm({
  transactionId,
  transactionDate,
  fromAccountId,
  toAccountId,
  amount,
  cancelHref,
  description,
  notes,
  status,
  accounts,
  returnTo,
}: TransferEditFormProps) {
  const [selectedFromAccountId, setSelectedFromAccountId] =
    useState(fromAccountId)
  const [selectedToAccountId, setSelectedToAccountId] = useState(toAccountId)
  const selectedFromAccount = accounts.find(
    (account) => account.id === selectedFromAccountId
  )
  const selectedToAccount = accounts.find(
    (account) => account.id === selectedToAccountId
  )
  const isCrossCurrencyTransfer =
    Boolean(selectedFromAccount && selectedToAccount) &&
    selectedFromAccount?.currency_code !== selectedToAccount?.currency_code
  const canSubmit = Boolean(
    selectedFromAccountId &&
      selectedToAccountId &&
      selectedFromAccountId !== selectedToAccountId &&
      !isCrossCurrencyTransfer
  )

  return (
    <form action={updateTransferTransactionAction} className="space-y-4">
      <input type="hidden" name="transaction_id" value={transactionId} />
      <input type="hidden" name="return_to" value={returnTo} />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`transfer_date_${transactionId}`}>Date</Label>
          <Input
            id={`transfer_date_${transactionId}`}
            name="transaction_date"
            type="date"
            defaultValue={transactionDate}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`transfer_status_${transactionId}`}>Status</Label>
          <select
            id={`transfer_status_${transactionId}`}
            name="status"
            defaultValue={status}
            className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <option value="posted">Posted</option>
            <option value="pending">Pending</option>
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor={`from_account_${transactionId}`}>
            From account
          </Label>
          <select
            id={`from_account_${transactionId}`}
            name="from_account_id"
            value={selectedFromAccountId}
            onChange={(event) => {
              const nextAccountId = event.target.value

              setSelectedFromAccountId(nextAccountId)

              if (nextAccountId === selectedToAccountId) {
                setSelectedToAccountId('')
              }
            }}
            className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            required
          >
            <option value="" disabled>
              Select source
            </option>
            {accounts.map((account) => (
              <option
                key={account.id}
                value={account.id}
                disabled={account.id === selectedToAccountId}
              >
                {formatAccountLabel(account)}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor={`to_account_${transactionId}`}>To account</Label>
          <select
            id={`to_account_${transactionId}`}
            name="to_account_id"
            value={selectedToAccountId}
            onChange={(event) => {
              const nextAccountId = event.target.value

              setSelectedToAccountId(nextAccountId)

              if (nextAccountId === selectedFromAccountId) {
                setSelectedFromAccountId('')
              }
            }}
            className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            required
          >
            <option value="" disabled>
              Select destination
            </option>
            {accounts.map((account) => (
              <option
                key={account.id}
                value={account.id}
                disabled={account.id === selectedFromAccountId}
              >
                {formatAccountLabel(account)}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor={`transfer_amount_${transactionId}`}>Amount</Label>
          <Input
            id={`transfer_amount_${transactionId}`}
            name="amount"
            type="number"
            min="0.01"
            step="0.01"
            defaultValue={amount}
            required
          />
        </div>
      </div>

      {isCrossCurrencyTransfer ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          Cross-currency transfers are not supported yet.
        </p>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor={`transfer_description_${transactionId}`}>
          Description
        </Label>
        <Input
          id={`transfer_description_${transactionId}`}
          name="description"
          defaultValue={description}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`transfer_notes_${transactionId}`}>Notes</Label>
        <Textarea
          id={`transfer_notes_${transactionId}`}
          name="notes"
          defaultValue={notes}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <SubmitButton
          type="submit"
          disabled={!canSubmit}
          pendingText="Saving transfer"
        >
          Save transfer
        </SubmitButton>
        <Link
          href={cancelHref}
          className={buttonVariants({ variant: 'outline' })}
        >
          Cancel
        </Link>
      </div>
    </form>
  )
}
