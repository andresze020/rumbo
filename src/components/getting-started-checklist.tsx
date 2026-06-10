'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Check, Circle } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { GlobalAddTransactionButton } from '@/components/global-add-transaction-button'
import { cn } from '@/lib/utils'

const HIDE_KEY = 'af_hide_getting_started'

function ChecklistStep({
  done,
  children,
}: {
  done: boolean
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-3">
      {done ? (
        <Check className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
      ) : (
        <Circle className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      )}
      <span className={cn('text-sm', done && 'text-muted-foreground line-through')}>
        {children}
      </span>
    </div>
  )
}

export function GettingStartedChecklist({
  hasAccounts,
  hasTransactions,
  hasBudget,
}: {
  hasAccounts: boolean
  hasTransactions: boolean
  hasBudget: boolean
}) {
  const allDone = hasAccounts && hasTransactions && hasBudget
  const [dismissed, setDismissed] = useState(true)

  useEffect(() => {
    if (allDone) return
    setDismissed(localStorage.getItem(HIDE_KEY) === '1')
  }, [allDone])

  if (allDone || dismissed) return null

  function handleHide() {
    localStorage.setItem(HIDE_KEY, '1')
    setDismissed(true)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Getting started</CardTitle>
        <CardDescription>A few steps to set up your finances in App Finanzas.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {hasAccounts ? (
          <ChecklistStep done>Add your first account</ChecklistStep>
        ) : (
          <Link href="/dashboard/accounts?mode=create" className="block">
            <ChecklistStep done={false}>Add your first account</ChecklistStep>
          </Link>
        )}

        {hasTransactions ? (
          <ChecklistStep done>Record a transaction</ChecklistStep>
        ) : (
          <GlobalAddTransactionButton className="block w-full text-left">
            <ChecklistStep done={false}>Record a transaction</ChecklistStep>
          </GlobalAddTransactionButton>
        )}

        {hasBudget ? (
          <ChecklistStep done>Set up a budget for this month</ChecklistStep>
        ) : (
          <Link href="/dashboard/budgets" className="block">
            <ChecklistStep done={false}>Set up a budget for this month</ChecklistStep>
          </Link>
        )}

        <div className="pt-1">
          <Button type="button" variant="ghost" size="sm" onClick={handleHide}>
            Hide this
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
