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
  sources,
  targets,
  showArchived,
  cancelHref,
  bulk = false,
}: {
  source?: { id: string; name: string; txnCount: number }
  sources?: MergeTarget[]
  targets: MergeTarget[]
  showArchived: boolean
  cancelHref: string
  bulk?: boolean
}) {
  const [targetId, setTargetId] = useState('')
  const [sourceIds, setSourceIds] = useState<string[]>(source ? [source.id] : [])
  const availableSources = sources ?? (source ? [source] : [])
  const selectedSources = availableSources.filter((item) => sourceIds.includes(item.id))
  const movedTransactions = selectedSources.reduce((sum, item) => sum + item.txnCount, 0)

  function toggleSource(id: string) {
    setSourceIds((current) =>
      current.includes(id)
        ? current.filter((sourceId) => sourceId !== id)
        : [...current, id]
    )
  }

  return (
    <form action={mergePayeesAction} className="space-y-4">
      {!bulk && source ? (
        <input type="hidden" name="source_id" value={source.id} />
      ) : null}
      <input
        type="hidden"
        name="show_archived"
        value={showArchived ? 'true' : 'false'}
      />

      <div className="rounded-lg border bg-muted/30 p-3 text-sm">
        <p>
          Move <span className="font-semibold tabular-nums">{movedTransactions}</span>{' '}
          transaction{movedTransactions === 1 ? '' : 's'} from{' '}
          <span className="font-semibold">
            {selectedSources.length || (source ? 1 : 0)}
          </span>{' '}
          duplicate payee{selectedSources.length === 1 ? '' : 's'} into the
          survivor selected below, then archive the duplicates.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          This rewrites the merchant label on those transactions and cannot be
          undone automatically.
        </p>
      </div>

      {bulk ? (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Duplicates to merge</legend>
          <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border p-2">
            {availableSources.map((item) => (
              <label
                key={item.id}
                className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-muted"
              >
                <input
                  type="checkbox"
                  name="source_id"
                  value={item.id}
                  checked={sourceIds.includes(item.id)}
                  disabled={item.id === targetId}
                  onChange={() => toggleSource(item.id)}
                  className="size-4"
                />
                <span className="min-w-0 flex-1 truncate">{item.name}</span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {item.txnCount} tx
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="merge_target">Merge into</Label>
        <select
          id="merge_target"
          name="target_id"
          value={targetId}
          onChange={(e) => {
            const nextTarget = e.target.value
            setTargetId(nextTarget)
            setSourceIds((current) => current.filter((id) => id !== nextTarget))
          }}
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
          disabled={targets.length === 0 || !targetId || sourceIds.length === 0}
        >
          Merge {sourceIds.length || ''} payee{sourceIds.length === 1 ? '' : 's'}
        </SubmitButton>
        <Link href={cancelHref} className={cn(buttonVariants({ variant: 'outline' }), formBtnCls)}>
          Cancel
        </Link>
      </div>
    </form>
  )
}
