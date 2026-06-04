'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
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

export function MobileMenu() {
  const pathname = usePathname()
  const detailsRef = useRef<HTMLDetailsElement>(null)

  useEffect(() => {
    if (detailsRef.current) {
      detailsRef.current.open = false
    }
  }, [pathname])

  return (
    <details ref={detailsRef} className="lg:hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between rounded-lg border px-3 py-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
        <span className="inline-flex items-center gap-2">
          <Menu aria-hidden="true" className="size-4" />
          Menu
        </span>
        <span className="text-sm font-semibold">App Finanzas</span>
      </summary>

      <NavLinks links={dashboardLinks} variant="mobile" />

      <div className="mt-3 flex flex-col gap-2">
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
  )
}
