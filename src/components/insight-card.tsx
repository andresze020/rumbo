import type { ReactNode } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

export type InsightTone = 'positive' | 'warning' | 'info'

const TONE_CLASS: Record<InsightTone, { box: string; icon: string }> = {
  positive: {
    box: 'border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40',
    icon: 'text-emerald-600 dark:text-emerald-400',
  },
  warning: {
    box: 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40',
    icon: 'text-amber-600 dark:text-amber-400',
  },
  info: {
    box: 'border-sky-200 bg-sky-50 dark:border-sky-900 dark:bg-sky-950/40',
    icon: 'text-sky-600 dark:text-sky-400',
  },
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
  const tones = TONE_CLASS[tone]
  return (
    <div className={cn('flex items-start gap-2.5 rounded-lg border p-2.5', tones.box)}>
      <span className={cn('mt-0.5 flex shrink-0 [&_svg]:size-[15px]', tones.icon)} aria-hidden="true">
        {icon}
      </span>
      <span className="text-xs leading-relaxed text-foreground">
        {children}
        {action ? (
          <>
            {' '}
            <Link href={action.href} className="font-semibold text-primary hover:underline">
              {action.label} →
            </Link>
          </>
        ) : null}
      </span>
    </div>
  )
}
