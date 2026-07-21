'use client'

import Link from 'next/link'
import { useState } from 'react'
import { mergePayeesAction } from './actions'
import { buttonVariants } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { SubmitButton } from '@/components/submit-button'
import { formActionsCls, formBtnCls, nativeSelectCls } from '@/lib/form-styles'
import { cn } from '@/lib/utils'

type MergeTarget = {
  id: string
  name: string
  txnCount: number
}

export function PayeeMergeForm({
  source,
  targets,
  showArchived,
  cancelHref,
}: {
  source: { id: string; name: string; txnCount: number }
  targets: MergeTarget[]
  showArchived: boolean
  cancelHref: string
}) {
  const [targetId, setTargetId] = useState('')

  return (
    <form action={mergePayeesAction} className="space-y-4">
      <input type="hidden" name="source_id" value={source.id} />
      <input
        type="hidden"
        name="show_archived"
        value={showArchived ? 'true' : 'false'}
      />

      <div className="rounded-lg border bg-muted/30 p-3 text-sm">
        <p>
          Move all{' '}
          <span className="font-semibold tabular-nums">{source.txnCount}</span>{' '}
          transaction{source.txnCount === 1 ? '' : 's'} from{' '}
          <span className="font-semibold">{source.name}</span> into the payee you
          pick below, then archive <span className="font-semibold">{source.name}</span>.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          This rewrites the merchant label on those transactions and cannot be
          undone automatically.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="merge_target">Merge into</Label>
        <select
          id="merge_target"
          name="target_id"
          value={targetId}
          onChange={(e) => setTargetId(e.target.value)}
          className={nativeSelectCls}
          required
        >
          <option value="" disabled>
            Select the surviving payee…
          </option>
          {targets.map((target) => (
            <option key={target.id} value={target.id}>
              {target.name} ({target.txnCount})
            </option>
          ))}
        </select>
        {targets.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No other active payees to merge into. Create or unarchive one first.
          </p>
        ) : null}
      </div>

      <div className={formActionsCls}>
        <SubmitButton
          type="submit"
          className={formBtnCls}
          pendingText="Merging"
          disabled={targets.length === 0 || !targetId}
        >
          Merge payees
        </SubmitButton>
        <Link href={cancelHref} className={cn(buttonVariants({ variant: 'outline' }), formBtnCls)}>
          Cancel
        </Link>
      </div>
    </form>
  )
}
