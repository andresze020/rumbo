'use client'

import type { ReactNode } from 'react'
import { useTransactionDialog } from '@/components/transaction-dialog-provider'

export function GlobalAddTransactionButton({
  className,
  children,
  'aria-label': ariaLabel,
  title,
  defaultAccountId,
}: {
  className?: string
  children?: ReactNode
  'aria-label'?: string
  title?: string
  defaultAccountId?: string
}) {
  const { openDialog } = useTransactionDialog()

  return (
    <button
      type="button"
      onClick={() => openDialog(defaultAccountId)}
      className={className}
      aria-label={ariaLabel}
      title={title}
    >
      {children}
    </button>
  )
}
