import { Skeleton } from '@/components/ui/skeleton'
import { SecondaryWidgetsSkeleton } from './secondary-widgets-skeleton'

const cardClass = 'rounded-2xl border bg-card shadow-sm shadow-black/[0.03]'

/**
 * Mirrors the Dashboard's real layout (2026-09-26 redesign): header with the
 * month switcher, net-worth hero with its trend, spending pace beside the
 * cash-flow card, then the streamed
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

      {/* Net worth hero: figures beside the trend on desktop, above it on a phone */}
      <div className={`${cardClass} grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-center`} aria-hidden="true">
        <div className="space-y-3">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-11 w-60" />
          <Skeleton className="h-5 w-40 rounded-full" />
          <div className="flex gap-8 border-t pt-4">
            <Skeleton className="h-10 w-28" />
            <Skeleton className="h-10 w-28" />
          </div>
        </div>
        <Skeleton className="h-[152px] w-full rounded-xl lg:h-[200px]" />
      </div>

      {/* Spending pace + cash flow */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]" aria-hidden="true">
        <div className={`${cardClass} space-y-3 p-5`}>
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-3 w-56" />
          <Skeleton className="mt-5 h-[192px] w-full rounded-xl" />
        </div>
        <div className={`${cardClass} space-y-3 p-5`}>
          <Skeleton className="h-4 w-24" />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between gap-3 py-1.5">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-6 w-28" />
            </div>
          ))}
          <Skeleton className="h-2 w-full rounded-full" />
          <div className="flex items-center gap-3 border-t pt-4">
            <Skeleton className="size-12 shrink-0 rounded-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </div>
      </div>

      <SecondaryWidgetsSkeleton />
    </main>
  )
}
