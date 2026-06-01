import Link from 'next/link'
import type { ReactNode } from 'react'

const dashboardLinks = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/dashboard/accounts', label: 'Accounts' },
  { href: '/dashboard/categories', label: 'Categories' },
]

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b">
        <nav className="mx-auto flex w-full max-w-5xl flex-wrap gap-2 px-6 py-3">
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
      </header>

      {children}
    </div>
  )
}
