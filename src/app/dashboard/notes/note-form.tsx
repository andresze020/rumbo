'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Check } from 'lucide-react'
import { createNoteAction, updateNoteAction } from './actions'
import { NOTE_COLORS } from './colors'
import { buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { SubmitButton } from '@/components/submit-button'
import { formActionsCls, formBtnCls } from '@/lib/form-styles'
import { cn } from '@/lib/utils'

type Note = {
  id: string
  noteDate: string
  title: string
  body: string | null
  color: string | null
}

export function NoteForm({
  note,
  mode,
  defaultDate,
  month,
  showArchived,
  searchQuery,
  cancelHref,
}: {
  note?: Note
  mode: 'create' | 'edit'
  /** Seeds a new note's date — today, or the viewed month's first day. */
  defaultDate: string
  month: string
  showArchived: boolean
  searchQuery: string
  cancelHref: string
}) {
  const formAction = mode === 'create' ? createNoteAction : updateNoteAction
  const [color, setColor] = useState<string | null>(note?.color ?? null)

  return (
    <form action={formAction} className="space-y-4">
      {note ? <input type="hidden" name="note_id" value={note.id} /> : null}
      {/* Carries the list view forward so the action can return to it. */}
      <input type="hidden" name="month" value={month} />
      <input type="hidden" name="show_archived" value={showArchived ? 'true' : 'false'} />
      <input type="hidden" name="q" value={searchQuery} />
      <input type="hidden" name="color" value={color ?? ''} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`note_date_${mode}`}>Date</Label>
          <Input
            id={`note_date_${mode}`}
            name="note_date"
            type="date"
            defaultValue={note?.noteDate ?? defaultDate}
            required
          />
          <p className="text-xs text-muted-foreground">
            The day this note is about. It does not have to have any transactions.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor={`note_title_${mode}`}>Title</Label>
          <Input
            id={`note_title_${mode}`}
            name="title"
            defaultValue={note?.title ?? ''}
            placeholder="e.g. Rent cheque should clear"
            maxLength={120}
            autoFocus
            required
          />
        </div>
      </div>

      <div className="space-y-2">
        {/* "Details" rather than "Note": the field sits inside a note form, and
            the word is identical in French, which the i18n gate rejects. */}
        <Label htmlFor={`note_body_${mode}`}>Details</Label>
        <Textarea
          id={`note_body_${mode}`}
          name="body"
          defaultValue={note?.body ?? ''}
          rows={4}
          maxLength={4000}
          placeholder="Anything worth remembering about this day."
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
          {NOTE_COLORS.map((swatch) => (
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
          pendingText={mode === 'create' ? 'Saving note' : 'Saving note'}
        >
          {mode === 'create' ? 'Save note' : 'Save changes'}
        </SubmitButton>
        <Link href={cancelHref} className={cn(buttonVariants({ variant: 'outline' }), formBtnCls)}>
          Cancel
        </Link>
      </div>
    </form>
  )
}
