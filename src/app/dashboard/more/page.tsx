'use client'

import Link from 'next/link'
import { ChevronRight, LogOut } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { SectionHeading } from '@/components/section-heading'
import { PhaseBadge } from '@/components/phase-badge'
import { ThemeToggle } from '@/components/theme-toggle'
import { SubmitButton } from '@/components/submit-button'
import { signOutAction } from '@/app/dashboard/session-actions'
import { useLanguage } from '@/components/language-provider'
import { navGroups, PHASE_LABEL_KEY, type NavItem } from '@/lib/nav/config'
import { cn } from '@/lib/utils'

const SETTINGS_GROUP_KEY = 'nav.groupSettings'

export default function MorePage() {
  const { t } = useLanguage()

  const moduleGroups = navGroups.filter((g) => g.titleKey !== SETTINGS_GROUP_KEY)
  const settingsGroup = navGroups.find((g) => g.titleKey === SETTINGS_GROUP_KEY)

  const available = moduleGroups.flatMap((g) => g.items).filter((i) => i.phase === 'alpha')
  const comingLater = moduleGroups.flatMap((g) => g.items).filter((i) => i.phase !== 'alpha')

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 sm:p-6">
      <PageHeader title={t('nav.more')} description={t('mobile.moreSubtitle')} />

      {/* Available modules */}
      <section className="space-y-3">
        <SectionHeading title={t('mobile.available')} />
        <div className="divide-y overflow-hidden rounded-xl border bg-card shadow-sm shadow-black/[0.03]">
          {available.map((item) => (
            <ModuleRow key={item.href} item={item} label={t(item.labelKey)} />
          ))}
        </div>
      </section>

      {/* Coming later */}
      <section className="space-y-3">
        <SectionHeading title={t('mobile.comingLater')} />
        <div className="divide-y overflow-hidden rounded-xl border bg-card shadow-sm shadow-black/[0.03]">
          {comingLater.map((item) => (
            <ModuleRow
              key={item.href}
              item={item}
              label={t(item.labelKey)}
              badge={
                item.phase === 'alpha' ? undefined : (
                  <PhaseBadge phase={item.phase} label={t(PHASE_LABEL_KEY[item.phase])} />
                )
              }
            />
          ))}
        </div>
      </section>

      {/* Preferences */}
      <section className="space-y-3">
        <SectionHeading title={t('mobile.preferences')} />
        <div className="divide-y overflow-hidden rounded-xl border bg-card shadow-sm shadow-black/[0.03]">
          {settingsGroup?.items.map((item) => (
            <ModuleRow
              key={item.href}
              item={item}
              label={t(item.labelKey)}
              badge={
                item.phase === 'alpha' ? undefined : (
                  <PhaseBadge phase={item.phase} label={t(PHASE_LABEL_KEY[item.phase])} />
                )
              }
            />
          ))}

          {/* Theme toggle */}
          <div className="flex items-center gap-3 px-4 py-3">
            <span className="text-sm font-medium">{t('nav.theme')}</span>
            <div className="ml-auto">
              <ThemeToggle />
            </div>
          </div>

          {/* Sign out */}
          <form action={signOutAction}>
            <SubmitButton
              type="submit"
              variant="ghost"
              pendingText="…"
              className="w-full justify-start gap-3 rounded-none px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              <LogOut className="size-4 shrink-0" aria-hidden="true" />
              {t('nav.signOut')}
            </SubmitButton>
          </form>
        </div>
      </section>
    </main>
  )
}

function ModuleRow({
  item,
  label,
  badge,
}: {
  item: NavItem
  label: string
  badge?: React.ReactNode
}) {
  const Icon: LucideIcon = item.icon
  return (
    <Link
      href={item.href}
      className={cn(
        'flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors hover:bg-muted/50',
        item.phase !== 'alpha' && 'text-muted-foreground'
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <span className="truncate">{label}</span>
      {badge ? <span className="ml-1">{badge}</span> : null}
      <ChevronRight className="ml-auto size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </Link>
  )
}
