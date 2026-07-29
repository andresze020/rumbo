'use client'

import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
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
import { useUiTranslation } from '@/lib/i18n/use-ui-translation'

type ConfirmActionButtonProps = {
  action: (formData: FormData) => void | Promise<void>
  hiddenFields: Record<string, string>
  triggerLabel: ReactNode
  pendingLabel: string
  title: ReactNode
  description: ReactNode
  cancelLabel: ReactNode
  confirmLabel: ReactNode
  /** Trigger styling. Defaults to `secondary` — the archive actions' look. */
  triggerVariant?: 'secondary' | 'outline' | 'destructive'
  /** `icon-sm` for an icon-only trigger; pass the icon as `triggerLabel`. */
  triggerSize?: 'sm' | 'icon-sm'
  /** Native tooltip, needed when the trigger is icon-only. */
  triggerTitle?: string
}

/**
 * Shared confirm-before-submit button: a trigger that opens an AlertDialog and a
 * form that only posts once the user confirms. Its original home is archive
 * (restoring stays a plain submit — only the destructive direction is gated),
 * and it is reused for other one-way actions such as BR-047's promote-subcategory.
 */
export function ConfirmActionButton({
  action,
  hiddenFields,
  triggerLabel,
  pendingLabel,
  title,
  description,
  cancelLabel,
  confirmLabel,
  triggerVariant = 'secondary',
  triggerSize = 'sm',
  triggerTitle,
}: ConfirmActionButtonProps) {
  const ui = useUiTranslation()
  const translated = (value: ReactNode) =>
    typeof value === 'string' ? ui(value) : value

  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button
            type="button"
            variant={triggerVariant}
            size={triggerSize}
            title={triggerTitle ? ui(triggerTitle) : undefined}
            aria-label={triggerTitle ? ui(triggerTitle) : undefined}
          />
        }
      >
        {translated(triggerLabel)}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <form action={action}>
          {Object.entries(hiddenFields).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          <AlertDialogHeader>
            <AlertDialogTitle>{translated(title)}</AlertDialogTitle>
            <AlertDialogDescription>{translated(description)}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{translated(cancelLabel)}</AlertDialogCancel>
            <SubmitButton type="submit" variant="secondary" size="sm" pendingText={ui(pendingLabel)}>
              {translated(confirmLabel)}
            </SubmitButton>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  )
}
