import Link from 'next/link'
import type { ReactNode } from 'react'
import { LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { signOutAction } from './session-actions'

const dashboardLinks = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/dashboard/accounts', label: 'Accounts' },
  { href: '/dashboard/categories', label: 'Categories' },
  { href: '/dashboard/transactions', label: 'Transactions' },
  { href: '/dashboard/transactions/import', label: 'Import CSV' },
  { href: '/dashboard/export', label: 'Export' },
  { href: '/dashboard/budgets', label: 'Budgets' },
  { href: '/dashboard/debts', label: 'Debts' },
  { href: '/dashboard/net-worth', label: 'Net Worth' },
]

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-6 py-3 sm:flex-row sm:items-center sm:justify-between">
          <nav className="flex flex-wrap gap-2">
            {dashboardLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <form action={signOutAction} className="shrink-0">
            <Button
              type="submit"
              variant="outline"
              size="sm"
              className="w-full sm:w-auto"
            >
              <LogOut aria-hidden="true" />
              Sign out
            </Button>
          </form>
        </div>
      </header>

      {children}
    </div>
  )
}
