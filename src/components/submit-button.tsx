'use client'

import type { ComponentProps } from 'react'
import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'
import { useUiTranslation } from '@/lib/i18n/use-ui-translation'

type SubmitButtonProps = ComponentProps<typeof Button> & {
  pendingText?: string
}

export function SubmitButton({
  children,
  disabled,
  pendingText,
  ...props
}: SubmitButtonProps) {
  const { pending } = useFormStatus()
  const ui = useUiTranslation()
  const localizedChildren = typeof children === 'string' ? ui(children) : children

  return (
    <Button
      {...props}
      disabled={disabled || pending}
      aria-disabled={disabled || pending}
    >
      {pending && pendingText ? ui(pendingText) : localizedChildren}
    </Button>
  )
}
