'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  ArrowLeftRight,
  Download,
  LayoutDashboard,
  LogOut,
  Menu,
  Scale,
  Settings,
  Tag,
  Target,
  TrendingUp,
  Upload,
  Wallet,
} from 'lucide-react'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { ThemeToggle } from '@/components/theme-toggle'
import { SubmitButton } from '@/components/submit-button'
import { signOutAction } from '@/app/dashboard/session-actions'
import { useLanguage } from '@/components/language-provider'
import type { TranslationKey } from '@/lib/i18n/translate'

const primaryLinks = [
  { href: '/dashboard', labelKey: 'nav.dashboard' as TranslationKey, icon: LayoutDashboard },
  { href: '/dashboard/accounts', labelKey: 'nav.accounts' as TranslationKey, icon: Wallet },
  { href: '/dashboard/transactions', labelKey: 'nav.transactions' as TranslationKey, icon: ArrowLeftRight },
  { href: '/dashboard/budgets', labelKey: 'nav.budgets' as TranslationKey, icon: Target },
  { href: '/dashboard/debts', labelKey: 'nav.debts' as TranslationKey, icon: Scale },
  { href: '/dashboard/net-worth', labelKey: 'nav.netWorth' as TranslationKey, icon: TrendingUp },
]

const secondaryLinks = [
  { href: '/dashboard/categories', labelKey: 'nav.categories' as TranslationKey, icon: Tag },
  { href: '/dashboard/transactions/import', labelKey: 'nav.importCsv' as TranslationKey, icon: Upload },
  { href: '/dashboard/export', labelKey: 'nav.export' as TranslationKey, icon: Download },
  { href: '/dashboard/settings', labelKey: 'nav.settings' as TranslationKey, icon: Settings },
]

export function MobileNav({ className }: { className?: string }) {
  const pathname = usePathname()
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    setOpen(false)
  }, [pathname])

  function isActive(href: string) {
    if (href === '/dashboard') return pathname === '/dashboard'
    return pathname.startsWith(href)
  }

  return (
    <header
      className={cn(
        'sticky top-0 z-40 flex h-14 shrink-0 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/70',
        className
      )}
    >
      <Sheet open={open} onOpenChange={setOpen}>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={t('nav.openMenu')}
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Menu className="size-5" aria-hidden="true" />
        </button>

        <SheetContent side="left" className="flex w-64 flex-col p-0">
          <SheetTitle className="sr-only">{t('nav.navigation')}</SheetTitle>

          {/* Brand */}
          <div className="flex h-14 shrink-0 items-center border-b px-4">
            <Link
              href="/dashboard"
              className="flex items-center gap-2"
              onClick={() => setOpen(false)}
            >
              <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Wallet className="size-4" aria-hidden="true" />
              </span>
              <span className="text-sm font-semibold">{t('nav.appName')}</span>
            </Link>
          </div>

          {/* Nav */}
          <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
            {primaryLinks.map(({ href, labelKey, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                aria-current={isActive(href) ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-2 py-2 text-sm font-medium transition-colors',
                  isActive(href)
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                {t(labelKey)}
              </Link>
            ))}

            <div className="my-2 h-px bg-border" />

            {secondaryLinks.map(({ href, labelKey, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                aria-current={isActive(href) ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-2 py-2 text-sm font-medium transition-colors',
                  isActive(href)
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                {t(labelKey)}
              </Link>
            ))}
          </nav>

          {/* Bottom controls */}
          <div className="shrink-0 space-y-1 border-t px-2 py-3">
            <div className="flex items-center gap-2 px-1">
              <ThemeToggle />
              <span className="text-sm text-muted-foreground">{t('nav.theme')}</span>
            </div>
            <form action={signOutAction}>
              <SubmitButton
                type="submit"
                variant="ghost"
                size="sm"
                pendingText="Signing out…"
                className="w-full justify-start gap-3 text-muted-foreground"
              >
                <LogOut className="size-4 shrink-0" aria-hidden="true" />
                {t('nav.signOut')}
              </SubmitButton>
            </form>
          </div>
        </SheetContent>
      </Sheet>

      {/* Brand mark in top bar */}
      <Link href="/dashboard" className="flex items-center gap-2">
        <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Wallet className="size-4" aria-hidden="true" />
        </span>
        <span className="text-sm font-semibold">{t('nav.appName')}</span>
      </Link>

      <div className="ml-auto">
        <ThemeToggle />
      </div>
    </header>
  )
}
