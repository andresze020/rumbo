'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { LucideIcon } from 'lucide-react'
import { ArrowLeftRight, Home, MoreHorizontal, Plus, Wallet } from 'lucide-react'
import { useTransactionDialog } from '@/components/transaction-dialog-provider'
import { useLanguage } from '@/components/language-provider'
import { cn } from '@/lib/utils'
import { useTransactionsLinkClick } from '@/lib/filters/transaction-scope-link'
import type { TranslationKey } from '@/lib/i18n/translate'

type Tab = {
  href: string
  labelKey: TranslationKey
  icon: LucideIcon
  // Next.js default (`prefetch={null}`) only prefetches up to a route's
  // `loading.tsx` boundary for a dynamic page, not its data. The three tabs
  // people actually bounce between (RUM-007, baseline §3.1) opt into full
  // prefetch so the Router Cache already holds their RSC payload by the time
  // the tap lands. More too since MQ-009: it has no data, so its full payload
  // costs the server next to nothing and the tab opens with no wait at all.
  prefetch?: boolean
}

// Two tabs on each side of the central FAB.
const leftTabs: Tab[] = [
  { href: '/dashboard', labelKey: 'nav.home', icon: Home, prefetch: true },
  {
    href: '/dashboard/transactions',
    labelKey: 'nav.transactions',
    icon: ArrowLeftRight,
    prefetch: true,
  },
]

const rightTabs: Tab[] = [
  // Accounts is opened far more often than Plan, so it earns the primary slot.
  // Plan stays reachable from the budgets page and via its own route.
  { href: '/dashboard/accounts', labelKey: 'nav.accounts', icon: Wallet, prefetch: true },
  { href: '/dashboard/more', labelKey: 'nav.more', icon: MoreHorizontal, prefetch: true },
]

export function MobileBottomNav({ className }: { className?: string }) {
  const pathname = usePathname()
  const { t } = useLanguage()
  const { openDialog } = useTransactionDialog()

  function isActive(href: string) {
    if (href === '/dashboard') return pathname === '/dashboard'
    return pathname === href || pathname.startsWith(`${href}/`)
  }

  return (
    <nav
      aria-label={t('nav.navigation')}
      className={cn(
        // A plain flex row in the app shell, not `fixed` over the page. The
        // shell does not scroll, so this cannot be scrolled away from, and
        // there is no viewport geometry to track to keep it in place — see
        // the comment on the shell in `app/dashboard/layout.tsx`.
        'z-10 shrink-0 border-t bg-background',
        'pb-[env(safe-area-inset-bottom)]',
        className
      )}
    >
      <div className="mx-auto grid h-16 max-w-md grid-cols-5 items-center">
        {leftTabs.map((tab) => (
          <BottomTab key={tab.href} tab={tab} active={isActive(tab.href)} label={t(tab.labelKey)} />
        ))}

        {/* Center FAB: straight into the entry form. It used to open a menu
            first (expense, income, transfer, debt payment, import CSV),
            which cost a tap on every entry. The form has its own
            expense / income / transfer selector, and debt payments and CSV
            import are rare, so they live under More. */}
        <div className="flex items-center justify-center">
          <button
            type="button"
            onClick={() => openDialog()}
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
  )
}

function BottomTab({ tab, active, label }: { tab: Tab; active: boolean; label: string }) {
  const Icon = tab.icon
  // MQ-003: Transactions goes to the remembered scope's own URL, not to the
  // prefetched render of the bare one — see `lib/filters/transaction-scope-link`.
  const onClick = useTransactionsLinkClick(tab.href)
  return (
    <Link
      href={tab.href}
      prefetch={tab.prefetch}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(
        // `active:` gives the tab the press-down a native tab bar has; without
        // it a tap has no feedback at all until the next screen paints.
        'flex h-full select-none flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-[color,transform] duration-150 active:scale-95',
        active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
      )}
    >
      <Icon className="size-5 shrink-0" aria-hidden="true" />
      <span className="truncate">{label}</span>
    </Link>
  )
}
