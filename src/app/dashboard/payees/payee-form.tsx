'use client'

import Link from 'next/link'
import { createPayeeAction, updatePayeeAction } from './actions'
import { buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SubmitButton } from '@/components/submit-button'
import { formActionsCls, formBtnCls } from '@/lib/form-styles'
import { cn } from '@/lib/utils'

type Payee = {
  id: string
  name: string
}

export function PayeeForm({
  payee,
  mode,
  showArchived,
  cancelHref,
}: {
  payee?: Payee
  mode: 'create' | 'edit'
  showArchived: boolean
  cancelHref: string
}) {
  const formAction = mode === 'create' ? createPayeeAction : updatePayeeAction

  return (
    <form action={formAction} className="space-y-4">
      {payee ? (
        <>
          <input type="hidden" name="payee_id" value={payee.id} />
          <input
            type="hidden"
            name="show_archived"
            value={showArchived ? 'true' : 'false'}
          />
        </>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor={`name_${mode}`}>Name</Label>
        <Input
          id={`name_${mode}`}
          name="name"
          defaultValue={payee?.name ?? ''}
          placeholder="e.g. Amazon, Landlord, City Water"
          autoFocus
          required
        />
        {mode === 'edit' ? (
          <p className="text-xs text-muted-foreground">
            Renaming updates the merchant label on every linked transaction.
          </p>
        ) : null}
      </div>

      <div className={formActionsCls}>
        <SubmitButton
          type="submit"
          className={formBtnCls}
          pendingText={mode === 'create' ? 'Creating payee' : 'Saving payee'}
        >
          {mode === 'create' ? 'Create payee' : 'Save payee'}
        </SubmitButton>
        <Link href={cancelHref} className={cn(buttonVariants({ variant: 'outline' }), formBtnCls)}>
          Cancel
        </Link>
      </div>
    </form>
  )
}
