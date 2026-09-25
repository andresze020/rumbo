import { Skeleton } from '@/components/ui/skeleton'
import { SecondaryWidgetsSkeleton } from './secondary-widgets-skeleton'

const cardClass = 'rounded-2xl border bg-card shadow-sm shadow-black/[0.03]'

/**
 * Mirrors the Dashboard's real layout (2026-09-25 redesign): header with the
 * month switcher, net-worth hero, the cash-flow card, then the streamed
 * section's own skeleton — so nothing jumps when the page arrives.
 */
export default function DashboardLoading() {
  return (
    <main
      role="status"
      aria-live="polite"
      className="mx-auto flex w-full max-w-[1340px] flex-col gap-4 p-4 sm:p-6"
    >
      <span className="sr-only">Loading dashboard…</span>

      {/* Header + month switcher */}
      <div className="flex items-center justify-between gap-3" aria-hidden="true">
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-9 w-48" />
      </div>

      {/* Net worth hero */}
      <div className={`${cardClass} space-y-3 p-5`} aria-hidden="true">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-9 w-48" />
        <div className="grid grid-cols-2 gap-3 pt-2 lg:w-1/2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>

      {/* Cash flow */}
      <div className={`${cardClass} space-y-4 p-4 sm:p-5`} aria-hidden="true">
        <Skeleton className="h-4 w-40" />
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-3 w-14" />
              <Skeleton className="h-6 w-full max-w-28" />
            </div>
          ))}
        </div>
        <Skeleton className="h-1.5 w-full rounded-full" />
        <div className="flex items-center gap-3 border-t pt-3">
          <Skeleton className="size-9 shrink-0 rounded-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>

      <SecondaryWidgetsSkeleton />
    </main>
  )
}
