import Link from 'next/link'
import type { ReactNode } from 'react'
import { LogOut, Menu, Plus } from 'lucide-react'
import { SubmitButton } from '@/components/submit-button'
import { buttonVariants } from '@/components/ui/button'
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

            <div className="mt-3 flex flex-col gap-2">
              <Link
                href="/dashboard/transactions?mode=create"
                className={buttonVariants({ className: 'w-full' })}
              >
                + Add transaction
              </Link>

              <form action={signOutAction}>
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
            </div>
          </details>
        </div>
      </header>

      <div className="pb-20">
        {children}
      </div>

      {/* FAB — visible on all dashboard pages */}
      <Link
        href="/dashboard/transactions?mode=create"
        aria-label="Add transaction"
        title="Add transaction"
        className="fixed bottom-6 right-6 z-50 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <Plus className="size-6" aria-hidden="true" />
      </Link>
    </div>
  )
}
