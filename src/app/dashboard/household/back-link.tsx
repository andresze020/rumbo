import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { HOUSEHOLD_PATH } from './members-card'

/** The way back to /dashboard/household from its sub-pages, as the header eyebrow. */
export function BackToHousehold({ label }: { label: string }) {
  return (
    <Link
      href={HOUSEHOLD_PATH}
      className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
    >
      <ChevronLeft className="size-4" aria-hidden="true" />
      {label}
    </Link>
  )
}
