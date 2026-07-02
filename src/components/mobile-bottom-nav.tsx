'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import type { LucideIcon } from 'lucide-react'
import {
  ArrowLeftRight,
  Home,
  MoreHorizontal,
  Plus,
  Scale,
  TrendingDown,
  TrendingUp,
  Upload,
  Wallet,
} from 'lucide-react'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { useTransactionDialog } from '@/components/transaction-dialog-provider'
import { useLanguage } from '@/components/language-provider'
import { cn } from '@/lib/utils'
import type { TranslationKey } from '@/lib/i18n/translate'

type Tab = {
  href: string
  labelKey: TranslationKey
  icon: LucideIcon
}

// Two tabs on each side of the central FAB.
const leftTabs: Tab[] = [
  { href: '/dashboard', labelKey: 'nav.home', icon: Home },
  { href: '/dashboard/transactions', labelKey: 'nav.movements', icon: ArrowLeftRight },
]

const rightTabs: Tab[] = [
  // Accounts is opened far more often than Plan, so it earns the primary slot.
  // Plan stays reachable from the budgets page and via its own route.
  { href: '/dashboard/accounts', labelKey: 'nav.accounts', icon: Wallet },
  { href: '/dashboard/more', labelKey: 'nav.more', icon: MoreHorizontal },
]

export function MobileBottomNav({ className }: { className?: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const { t } = useLanguage()
  const { openDialog } = useTransactionDialog()
  const [fabOpen, setFabOpen] = useState(false)

  function isActive(href: string) {
    if (href === '/dashboard') return pathname === '/dashboard'
    return pathname === href || pathname.startsWith(`${href}/`)
  }

  function openTransaction(type: 'expense' | 'income' | 'transfer') {
    setFabOpen(false)
    // Let the drawer close before opening the dialog so focus moves cleanly.
    window.requestAnimationFrame(() => openDialog({ type }))
  }

  function navigate(href: string) {
    setFabOpen(false)
    router.push(href)
  }

  const fabActions: {
    key: string
    labelKey: TranslationKey
    icon: LucideIcon
    accent: string
    onClick: () => void
  }[] = [
    {
      key: 'expense',
      labelKey: 'mobile.addExpense',
      icon: TrendingDown,
      accent: 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400',
      onClick: () => openTransaction('expense'),
    },
    {
      key: 'income',
      labelKey: 'mobile.addIncome',
      icon: TrendingUp,
      accent: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400',
      onClick: () => openTransaction('income'),
    },
    {
      key: 'transfer',
      labelKey: 'mobile.transfer',
      icon: ArrowLeftRight,
      accent: 'bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-400',
      onClick: () => openTransaction('transfer'),
    },
    {
      key: 'debt',
      labelKey: 'mobile.debtPayment',
      icon: Scale,
      accent: 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400',
      onClick: () => navigate('/dashboard/debts'),
    },
    {
      key: 'import',
      labelKey: 'mobile.importCsv',
      icon: Upload,
      accent: 'bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400',
      onClick: () => navigate('/dashboard/transactions/import'),
    },
  ]

  return (
    <>
      <nav
        aria-label={t('nav.navigation')}
        className={cn(
          'fixed inset-x-0 bottom-0 z-40 border-t bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75',
          'pb-[env(safe-area-inset-bottom)]',
          className
        )}
      >
        <div className="mx-auto grid h-16 max-w-md grid-cols-5 items-center">
          {leftTabs.map((tab) => (
            <BottomTab key={tab.href} tab={tab} active={isActive(tab.href)} label={t(tab.labelKey)} />
          ))}

          {/* Center FAB */}
          <div className="flex items-center justify-center">
            <button
              type="button"
              onClick={() => setFabOpen(true)}
              aria-label={t('mobile.addTitle')}
              className="flex size-14 -translate-y-3 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-4 ring-background transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Plus className="size-6" aria-hidden="true" />
            </button>
          </div>

          {rightTabs.map((tab) => (
            <BottomTab key={tab.href} tab={tab} active={isActive(tab.href)} label={t(tab.labelKey)} />
          ))}
        </div>
      </nav>

      <Drawer open={fabOpen} onOpenChange={setFabOpen}>
        <DrawerContent className="pb-[env(safe-area-inset-bottom)]">
          <DrawerHeader>
            <DrawerTitle>{t('mobile.addTitle')}</DrawerTitle>
            <DrawerDescription>{t('mobile.addSubtitle')}</DrawerDescription>
          </DrawerHeader>
          <div className="grid gap-1.5 px-4 pb-6">
            {fabActions.map((action) => (
              <button
                key={action.key}
                type="button"
                onClick={action.onClick}
                className="flex items-center gap-3 rounded-xl border bg-card px-3 py-3 text-left text-sm font-medium transition-colors hover:bg-muted"
              >
                <span
                  className={cn(
                    'flex size-9 shrink-0 items-center justify-center rounded-lg [&_svg]:size-4',
                    action.accent
                  )}
                  aria-hidden="true"
                >
                  <action.icon />
                </span>
                {t(action.labelKey)}
              </button>
            ))}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  )
}

function BottomTab({ tab, active, label }: { tab: Tab; active: boolean; label: string }) {
  const Icon = tab.icon
  return (
    <Link
      href={tab.href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex h-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors',
        active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
      )}
    >
      <Icon className="size-5 shrink-0" aria-hidden="true" />
      <span className="truncate">{label}</span>
    </Link>
  )
}
