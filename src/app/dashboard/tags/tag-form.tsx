'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Check } from 'lucide-react'
import { createTagAction, updateTagAction } from './actions'
import { TAG_COLORS } from './colors'
import { buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SubmitButton } from '@/components/submit-button'
import { formActionsCls, formBtnCls } from '@/lib/form-styles'
import { cn } from '@/lib/utils'

type Tag = {
  id: string
  name: string
  color: string | null
}

export function TagForm({
  tag,
  mode,
  showArchived,
  cancelHref,
}: {
  tag?: Tag
  mode: 'create' | 'edit'
  showArchived: boolean
  cancelHref: string
}) {
  const formAction = mode === 'create' ? createTagAction : updateTagAction
  const [color, setColor] = useState<string | null>(tag?.color ?? null)

  return (
    <form action={formAction} className="space-y-4">
      {tag ? (
        <>
          <input type="hidden" name="tag_id" value={tag.id} />
          <input
            type="hidden"
            name="show_archived"
            value={showArchived ? 'true' : 'false'}
          />
        </>
      ) : null}
      <input type="hidden" name="color" value={color ?? ''} />

      <div className="space-y-2">
        <Label htmlFor={`name_${mode}`}>Name</Label>
        <Input
          id={`name_${mode}`}
          name="name"
          defaultValue={tag?.name ?? ''}
          placeholder="e.g. vacation-2026, reimbursable, tax-deductible"
          autoFocus
          required
        />
      </div>

      <div className="space-y-2">
        <Label>Color</Label>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setColor(null)}
            aria-label="No color"
            aria-pressed={color === null}
            className={cn(
              'flex size-7 items-center justify-center rounded-full border bg-muted text-muted-foreground transition',
              color === null ? 'ring-2 ring-ring ring-offset-1 ring-offset-background' : ''
            )}
          >
            {color === null ? <Check className="size-3.5" aria-hidden="true" /> : null}
          </button>
          {TAG_COLORS.map((swatch) => (
            <button
              key={swatch}
              type="button"
              onClick={() => setColor(swatch)}
              aria-label={`Color ${swatch}`}
              aria-pressed={color === swatch}
              style={{ backgroundColor: swatch }}
              className={cn(
                'flex size-7 items-center justify-center rounded-full text-white transition',
                color === swatch ? 'ring-2 ring-ring ring-offset-1 ring-offset-background' : ''
              )}
            >
              {color === swatch ? <Check className="size-3.5" aria-hidden="true" /> : null}
            </button>
          ))}
        </div>
      </div>

      <div className={formActionsCls}>
        <SubmitButton
          type="submit"
          className={formBtnCls}
          pendingText={mode === 'create' ? 'Creating tag' : 'Saving tag'}
        >
          {mode === 'create' ? 'Create tag' : 'Save tag'}
        </SubmitButton>
        <Link href={cancelHref} className={cn(buttonVariants({ variant: 'outline' }), formBtnCls)}>
          Cancel
        </Link>
      </div>
    </form>
  )
}
