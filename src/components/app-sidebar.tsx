'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { LucideIcon } from 'lucide-react'
import { ChevronLeft, ChevronRight, LogOut, Settings, Wallet } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ThemeToggle } from '@/components/theme-toggle'
import { SubmitButton } from '@/components/submit-button'
import { PhaseBadge } from '@/components/phase-badge'
import { signOutAction } from '@/app/dashboard/session-actions'
import { useLanguage } from '@/components/language-provider'
import { navGroups, PHASE_LABEL_KEY, type Phase } from '@/lib/nav/config'

type SidebarLinkProps = {
  href: string
  label: string
  icon: LucideIcon
  active: boolean
  collapsed: boolean
  phase: Phase
  phaseLabel?: string
  hint?: string
}

function SidebarLink({ href, label, icon: Icon, active, collapsed, phase, phaseLabel, hint }: SidebarLinkProps) {
  const showTooltip = collapsed && Boolean(hint)
  const link = (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      title={collapsed && !showTooltip ? label : undefined}
      className={cn(
        'flex items-center gap-3 rounded-lg px-2 py-2 text-sm font-medium transition-colors',
        active
          ? 'bg-primary/10 text-primary'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      {!collapsed && (
        <>
          <span className="truncate">{label}</span>
          {phaseLabel && <PhaseBadge phase={phase} label={phaseLabel} className="ml-auto" />}
        </>
      )}
    </Link>
  )

  if (!showTooltip) {
    return link
  }

  return (
    <Tooltip>
      <TooltipTrigger render={link} />
      <TooltipContent side="right" className="space-y-0.5">
        <p className="font-semibold">{label}</p>
        <p className="text-muted-foreground">{hint}</p>
      </TooltipContent>
    </Tooltip>
  )
}

/** Two-letter initials from an email's local part (falls back to "?"). */
function emailInitials(email: string | null | undefined) {
  if (!email) return '?'
  const local = email.split('@')[0] ?? ''
  const cleaned = local.replace(/[^a-zA-Z0-9]/g, '')
  if (!cleaned) return '?'
  return cleaned.slice(0, 2).toUpperCase()
}

export function AppSidebar({
  className,
  userEmail,
}: {
  className?: string
  userEmail?: string | null
}) {
  const pathname = usePathname()
  const { t } = useLanguage()
  const [collapsed, setCollapsed] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    window.requestAnimationFrame(() => {
      setMounted(true)
      const stored = localStorage.getItem('sidebar-collapsed')
      if (stored !== null) setCollapsed(stored === 'true')
    })
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
          title={collapsed ? t('nav.appName') : undefined}
        >
          <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Wallet className="size-4" aria-hidden="true" />
          </span>
          {!collapsed && (
            <span className="truncate text-sm font-semibold">{t('nav.appName')}</span>
          )}
        </Link>
        <button
          type="button"
          onClick={toggle}
          className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label={collapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar')}
        >
          {collapsed ? (
            <ChevronRight className="size-4" aria-hidden="true" />
          ) : (
            <ChevronLeft className="size-4" aria-hidden="true" />
          )}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-4 overflow-y-auto px-2 py-3">
        {navGroups.map((group) => (
          <div key={group.titleKey} className="space-y-0.5">
            {!collapsed && (
              <h3 className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                {t(group.titleKey)}
              </h3>
            )}
            {group.items.map((item) => (
              <SidebarLink
                key={item.href}
                href={item.href}
                label={t(item.labelKey)}
                icon={item.icon}
                active={isActive(item.href)}
                collapsed={collapsed}
                phase={item.phase}
                phaseLabel={item.phase === 'alpha' ? undefined : t(PHASE_LABEL_KEY[item.phase])}
                hint={item.hint}
              />
            ))}
          </div>
        ))}
      </nav>

      {/* Bottom controls */}
      <div className="shrink-0 space-y-1 border-t px-2 py-3">
        {/* Signed-in user → settings (Option D avatar block) */}
        {userEmail ? (
          <Link
            href="/dashboard/settings"
            title={collapsed ? userEmail : undefined}
            aria-current={isActive('/dashboard/settings') ? 'page' : undefined}
            className={cn(
              'flex items-center gap-2 rounded-lg py-1.5 text-sm transition-colors',
              isActive('/dashboard/settings')
                ? 'bg-primary/10'
                : 'hover:bg-muted',
              collapsed ? 'justify-center px-0' : 'px-1.5'
            )}
          >
            <span
              className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary"
              aria-hidden="true"
            >
              {emailInitials(userEmail)}
            </span>
            {!collapsed && (
              <>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">
                  {userEmail}
                </span>
                <Settings
                  className="size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
              </>
            )}
          </Link>
        ) : null}

        <div className={cn('flex items-center', collapsed ? 'justify-center' : 'px-1')}>
          <ThemeToggle />
          {!collapsed && (
            <span className="ml-2 text-sm text-muted-foreground">{t('nav.theme')}</span>
          )}
        </div>
        <form action={signOutAction}>
          <SubmitButton
            type="submit"
            variant="ghost"
            size="sm"
            pendingText="..."
            title={collapsed ? t('nav.signOut') : undefined}
            className={cn(
              'w-full gap-3 text-muted-foreground',
              collapsed ? 'justify-center px-2' : 'justify-start'
            )}
          >
            <LogOut className="size-4 shrink-0" aria-hidden="true" />
            {!collapsed && t('nav.signOut')}
          </SubmitButton>
        </form>
      </div>
    </aside>
  )
}
