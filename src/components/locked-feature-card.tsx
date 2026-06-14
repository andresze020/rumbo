import type { LucideIcon } from 'lucide-react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Callout } from '@/components/callout'
import { PhaseBadge } from '@/components/phase-badge'
import type { Phase } from '@/lib/nav/config'

type LockedFeatureCardProps = {
  icon: LucideIcon
  title: string
  description: string
  phase: Phase
  phaseLabel: string
  calloutText: string
  backHref: string
  backLabel: string
}

/**
 * Placeholder shown for nav items that are not built yet (beta/soon/pro).
 * Communicates what the feature will do and links back to the dashboard.
 */
export function LockedFeatureCard({
  icon: Icon,
  title,
  description,
  phase,
  phaseLabel,
  calloutText,
  backHref,
  backLabel,
}: LockedFeatureCardProps) {
  return (
    <div className="mx-auto max-w-xl space-y-4 py-6 text-center">
      <div className="mx-auto flex size-14 items-center justify-center rounded-2xl border bg-card shadow-sm">
        <Icon className="size-6 text-muted-foreground" aria-hidden="true" />
      </div>
      <div className="flex items-center justify-center gap-2">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">{title}</h2>
        <PhaseBadge phase={phase} label={phaseLabel} />
      </div>
      <p className="text-sm text-muted-foreground">{description}</p>
      <Callout className="text-left sm:text-center">{calloutText}</Callout>
      <Link
        href={backHref}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {backLabel}
      </Link>
    </div>
  )
}
