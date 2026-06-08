'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  ArrowLeftRight,
  Bot,
  ChevronLeft,
  ChevronRight,
  Download,
  LayoutDashboard,
  LogOut,
  Scale,
  Settings,
  Tag,
  Target,
  TrendingUp,
  Upload,
  Wallet,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { ThemeToggle } from '@/components/theme-toggle'
import { SubmitButton } from '@/components/submit-button'
import { signOutAction } from '@/app/dashboard/session-actions'

const primaryLinks = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/assistant', label: 'Assistant', icon: Bot },
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
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
]

type NavItemProps = {
  href: string
  label: string
  icon: React.ElementType
  active: boolean
  collapsed: boolean
}

function NavItem({ href, label, icon: Icon, active, collapsed }: NavItemProps) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      title={collapsed ? label : undefined}
      className={cn(
        'flex items-center gap-3 rounded-lg px-2 py-2 text-sm font-medium transition-colors',
        active
          ? 'bg-primary/10 text-primary'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      {!collapsed && <span className="truncate">{label}</span>}
    </Link>
  )
}

export function AppSidebar({ className }: { className?: string }) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const stored = localStorage.getItem('sidebar-collapsed')
    if (stored !== null) setCollapsed(stored === 'true')
  }, [])

  function toggle() {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem('sidebar-collapsed', String(next))
  }

  function isActive(href: string) {
    if (href === '/dashboard') return pathname === '/dashboard'
    return pathname.startsWith(href)
  }

  return (
    <aside
      className={cn(
        'sticky top-0 flex h-screen shrink-0 flex-col border-r bg-card',
        mounted ? 'transition-[width] duration-200' : '',
        collapsed ? 'w-14' : 'w-60',
        className
      )}
    >
      {/* Brand */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b px-3">
        <Link
          href="/dashboard"
          className="flex min-w-0 items-center gap-2"
          title={collapsed ? 'App Finanzas' : undefined}
        >
          <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Wallet className="size-4" aria-hidden="true" />
          </span>
          {!collapsed && (
            <span className="truncate text-sm font-semibold">App Finanzas</span>
          )}
        </Link>
        <button
          type="button"
          onClick={toggle}
          className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <ChevronRight className="size-4" aria-hidden="true" />
          ) : (
            <ChevronLeft className="size-4" aria-hidden="true" />
          )}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
        {primaryLinks.map(({ href, label, icon }) => (
          <NavItem
            key={href}
            href={href}
            label={label}
            icon={icon}
            active={isActive(href)}
            collapsed={collapsed}
          />
        ))}

        <div className="my-2 h-px bg-border" />

        {secondaryLinks.map(({ href, label, icon }) => (
          <NavItem
            key={href}
            href={href}
            label={label}
            icon={icon}
            active={isActive(href)}
            collapsed={collapsed}
          />
        ))}
      </nav>

      {/* Bottom controls */}
      <div className="shrink-0 space-y-1 border-t px-2 py-3">
        <div className={cn('flex items-center', collapsed ? 'justify-center' : 'px-1')}>
          <ThemeToggle />
          {!collapsed && (
            <span className="ml-2 text-sm text-muted-foreground">Theme</span>
          )}
        </div>
        <form action={signOutAction}>
          <SubmitButton
            type="submit"
            variant="ghost"
            size="sm"
            pendingText="..."
            title={collapsed ? 'Sign out' : undefined}
            className={cn(
              'w-full gap-3 text-muted-foreground',
              collapsed ? 'justify-center px-2' : 'justify-start'
            )}
          >
            <LogOut className="size-4 shrink-0" aria-hidden="true" />
            {!collapsed && 'Sign out'}
          </SubmitButton>
        </form>
      </div>
    </aside>
  )
}
