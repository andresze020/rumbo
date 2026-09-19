'use client'

import Link from 'next/link'
import { ChevronDown, Users } from 'lucide-react'
import { useUiTranslation } from '@/lib/i18n/use-ui-translation'
import { cn } from '@/lib/utils'

/**
 * The active household, as a compact control rather than a large eyebrow.
 *
 * It is a link to household settings, not a switcher: a profile carries exactly
 * one `default_household_id` and nothing in the app changes it, so a menu here
 * would be a menu with one entry. The affordance is built for a switcher
 * (chip + chevron, one tap target) so it can become one without moving.
 */
export function HouseholdChip({
  name,
  className,
}: {
  name: string
  className?: string
}) {
  const ui = useUiTranslation()
  if (!name) return null

  return (
    <Link
      href="/dashboard/settings"
      title={name}
      aria-label={ui('Household settings')}
      className={cn(
        // 24px tall so the row reads as an eyebrow, with the tap target pushed
        // out to 44px by the pseudo-element rather than by real height.
        'relative inline-flex h-6 min-w-0 max-w-[11rem] items-center gap-1 rounded-full px-1.5 text-xs font-medium text-muted-foreground transition-colors',
        'before:absolute before:inset-x-0 before:-top-2.5 before:-bottom-2.5 before:content-[\'\']',
        'hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
        className
      )}
    >
      <Users className="size-3 shrink-0" aria-hidden="true" />
      <span className="truncate">{name}</span>
      <ChevronDown className="size-3 shrink-0 opacity-70" aria-hidden="true" />
    </Link>
  )
}
