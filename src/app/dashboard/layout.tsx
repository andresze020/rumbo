import Link from 'next/link'
import type { ReactNode } from 'react'
import { LogOut, Menu } from 'lucide-react'
import { SubmitButton } from '@/components/submit-button'
import { NavLinks } from '@/components/nav-links'
import { signOutAction } from './session-actions'

const dashboardLinks = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/dashboard/accounts', label: 'Accounts' },
  { href: '/dashboard/transactions', label: 'Transactions' },
  { href: '/dashboard/budgets', label: 'Budgets' },
  { href: '/dashboard/debts', label: 'Debts' },
  { href: '/dashboard/net-worth', label: 'Net Worth' },
  { href: '/dashboard/categories', label: 'Categories' },
  { href: '/dashboard/transactions/import', label: 'Import CSV' },
  { href: '/dashboard/export', label: 'Export' },
]

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-b-primary/15 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-4 py-3 sm:px-6">
          <div className="hidden items-center justify-between gap-4 lg:flex">
            <div className="flex min-w-0 items-center gap-4">
              <Link
                href="/dashboard"
                className="shrink-0 text-sm font-semibold text-foreground"
              >
                App Finanzas
              </Link>
              <NavLinks links={dashboardLinks} />
            </div>

            <form action={signOutAction} className="shrink-0">
              <SubmitButton
                type="submit"
                variant="outline"
                size="sm"
                pendingText="Signing out"
              >
                <LogOut aria-hidden="true" />
                Sign out
              </SubmitButton>
            </form>
          </div>

          <details className="lg:hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between rounded-lg border px-3 py-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
              <span className="inline-flex items-center gap-2">
                <Menu aria-hidden="true" className="size-4" />
                Menu
              </span>
              <span className="text-sm font-semibold">App Finanzas</span>
            </summary>

            <NavLinks links={dashboardLinks} variant="mobile" />

            <form action={signOutAction} className="mt-3">
              <SubmitButton
                type="submit"
                variant="outline"
                size="sm"
                className="w-full"
                pendingText="Signing out"
              >
                <LogOut aria-hidden="true" />
                Sign out
              </SubmitButton>
            </form>
          </details>
        </div>
      </header>

      {children}
    </div>
  )
}
