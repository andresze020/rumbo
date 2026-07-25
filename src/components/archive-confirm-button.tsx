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

type ArchiveConfirmButtonProps = {
  action: (formData: FormData) => void | Promise<void>
  hiddenFields: Record<string, string>
  triggerLabel: ReactNode
  pendingLabel: string
  title: ReactNode
  description: ReactNode
  cancelLabel: ReactNode
  confirmLabel: ReactNode
}

/** Confirm-before-archive button. Restoring stays a plain form submit — only the destructive direction gets a confirm step. */
export function ArchiveConfirmButton({
  action,
  hiddenFields,
  triggerLabel,
  pendingLabel,
  title,
  description,
  cancelLabel,
  confirmLabel,
}: ArchiveConfirmButtonProps) {
  const ui = useUiTranslation()
  const translated = (value: ReactNode) =>
    typeof value === 'string' ? ui(value) : value

  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button type="button" variant="secondary" size="sm" />}>
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
