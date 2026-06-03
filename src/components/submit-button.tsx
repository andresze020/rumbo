'use client'

import type { ComponentProps } from 'react'
import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'

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

  return (
    <Button
      {...props}
      disabled={disabled || pending}
      aria-disabled={disabled || pending}
    >
      {pending && pendingText ? pendingText : children}
    </Button>
  )
}
