import type { ReactNode } from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export type InsightTone = 'positive' | 'warning' | 'info'

// The tone lives in the icon's badge only (2026-09-26): a list of tinted
// boxes reads as a wall of alerts; one colored mark per line reads as a feed.
const TONE_CLASS: Record<InsightTone, string> = {
  positive: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  warning: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  info: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
}

type InsightCardProps = {
  tone: InsightTone
  icon: ReactNode
  children: ReactNode
  /** Where the user can act on this insight (RUM-009). */
  action?: { href: string; label: string }
}

/**
 * A single insight derived from the household's real data (budget, cash
 * flow, account liabilities, spending). Presentation only — which insights
 * exist is decided by lib/insights/dashboard. Non-regulated: never investment
 * advice.
 */
export function InsightCard({ tone, icon, children, action }: InsightCardProps) {
  return (
    <div className="flex items-start gap-3">
      <span
        className={cn('flex size-8 shrink-0 items-center justify-center rounded-full [&_svg]:size-4', TONE_CLASS[tone])}
        aria-hidden="true"
      >
        {icon}
      </span>
      <div className="min-w-0 text-sm leading-snug">
        <p className="text-foreground">{children}</p>
        {action ? (
          <Link
            href={action.href}
            className="mt-1 inline-flex items-center text-xs font-medium text-primary hover:underline"
          >
            {action.label}
            <ChevronRight className="size-3.5" aria-hidden="true" />
          </Link>
        ) : null}
      </div>
    </div>
  )
}
