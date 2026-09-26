import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

const cardClass = 'rounded-2xl border bg-card shadow-sm shadow-black/[0.03]'

// Placeholder shown while DashboardSecondaryWidgets streams in. Roughly
// mirrors that component's real layout (two-column grid: budget, category and
// scheduled on the left, insights/debts/goals on the right) just enough to
// avoid a layout jump when it resolves — no pixel-perfect fidelity needed, and
// no text (nothing to translate).
export function SecondaryWidgetsSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden="true">
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px] [&>*]:min-w-0">
        <div className="flex min-w-0 flex-col gap-4">
          <div className={cn(cardClass, 'space-y-4 p-5')}>
            <Skeleton className="h-4 w-32" />
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-7 w-full" />
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
            <div className={cn(cardClass, 'space-y-4 p-5')}>
              <Skeleton className="h-4 w-32" />
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-7 w-full" />
              ))}
            </div>
            <div className={cn(cardClass, 'space-y-3 p-5')}>
              <Skeleton className="h-4 w-36" />
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-11 w-full" />
              ))}
            </div>
          </div>
        </div>
        <aside className="flex flex-col gap-4">
          {[2, 2, 2].map((rows, section) => (
            <div key={section} className={cn(cardClass, 'space-y-3 p-5')}>
              <Skeleton className="h-4 w-28" />
              {Array.from({ length: rows }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ))}
        </aside>
      </div>
    </div>
  )
}
