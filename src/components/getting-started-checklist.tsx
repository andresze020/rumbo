'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Check, Circle } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { GlobalAddTransactionButton } from '@/components/global-add-transaction-button'
import { useLanguage } from '@/components/language-provider'
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
  const { t } = useLanguage()
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
        <CardTitle>{t('gettingStarted.title')}</CardTitle>
        <CardDescription>{t('gettingStarted.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {hasAccounts ? (
          <ChecklistStep done>{t('gettingStarted.addAccount')}</ChecklistStep>
        ) : (
          <Link href="/dashboard/accounts?mode=create" className="block">
            <ChecklistStep done={false}>{t('gettingStarted.addAccount')}</ChecklistStep>
          </Link>
        )}

        {hasTransactions ? (
          <ChecklistStep done>{t('gettingStarted.addTransaction')}</ChecklistStep>
        ) : (
          <GlobalAddTransactionButton className="block w-full text-left">
            <ChecklistStep done={false}>{t('gettingStarted.addTransaction')}</ChecklistStep>
          </GlobalAddTransactionButton>
        )}

        {hasBudget ? (
          <ChecklistStep done>{t('gettingStarted.setBudget')}</ChecklistStep>
        ) : (
          <Link href="/dashboard/budgets" className="block">
            <ChecklistStep done={false}>{t('gettingStarted.setBudget')}</ChecklistStep>
          </Link>
        )}

        <div className="pt-1">
          <Button type="button" variant="ghost" size="sm" onClick={handleHide}>
            {t('gettingStarted.hide')}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
