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

const primaryLinks = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/accounts', label: 'Accounts', icon: Wallet },
  { href: '/dashboard/transactions', label: 'Transactions', icon: ArrowLeftRight },
  { href: '/dashboard/budgets', label: 'Budgets', icon: Target },
  { href: '/dashboard/debts', label: 'Debts', icon: Scale },
  { href: '/dashboard/net-worth', label: 'Net Worth', icon: TrendingUp },
]

const secondaryLinks = [
  { href: '/dashboard/categories', label: 'Categories', icon: Tag },
  { href: '/dashboard/transactions/import', label: 'Import CSV', icon: Upload },
  { href: '/dashboard/export', label: 'Export', icon: Download },
]

export function MobileNav({ className }: { className?: string }) {
  const pathname = usePathname()
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
          aria-label="Open navigation menu"
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Menu className="size-5" aria-hidden="true" />
        </button>

        <SheetContent side="left" className="flex w-64 flex-col p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>

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
              <span className="text-sm font-semibold">App Finanzas</span>
            </Link>
          </div>

          {/* Nav */}
          <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
            {primaryLinks.map(({ href, label, icon: Icon }) => (
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
                {label}
              </Link>
            ))}

            <div className="my-2 h-px bg-border" />

            {secondaryLinks.map(({ href, label, icon: Icon }) => (
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
                {label}
              </Link>
            ))}
          </nav>

          {/* Bottom controls */}
          <div className="shrink-0 space-y-1 border-t px-2 py-3">
            <div className="flex items-center gap-2 px-1">
              <ThemeToggle />
              <span className="text-sm text-muted-foreground">Theme</span>
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
                Sign out
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
        <span className="text-sm font-semibold">App Finanzas</span>
      </Link>

      <div className="ml-auto">
        <ThemeToggle />
      </div>
    </header>
  )
}
