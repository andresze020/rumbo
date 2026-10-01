/**
 * Budgets skeleton (MQ-009): the page's own frame — header, month switcher —
 * and one neutral block where the content goes, nothing more.
 *
 * It used to draw four labelled KPI cards and a lines table under a "Loading"
 * caption, then often resolve to a single "No budget for this month" card: the
 * layout jumped from five boxes to one. A skeleton cannot know which of the two
 * it is waiting for, so it promises neither.
 */
export default function BudgetsLoading() {
  return (
    <main
      role="status"
      aria-live="polite"
      className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 pb-24 sm:gap-6 sm:p-6"
    >
      <span className="sr-only">Loading budgets…</span>

      {/* Desktop header: title + month switcher. */}
      <div className="hidden items-end justify-between gap-4 md:flex" aria-hidden="true">
        <h1 className="text-2xl font-semibold tracking-normal">Budgets</h1>
        <div className="h-9 w-56 animate-pulse rounded-lg bg-muted" />
      </div>

      {/* Phone header: back, title, action; then the month switcher. */}
      <div className="flex items-center gap-2 md:hidden" aria-hidden="true">
        <div className="size-9 rounded-lg border" />
        <h1 className="min-w-0 flex-1 truncate text-[15px] font-bold leading-tight">Budgets</h1>
      </div>
      <div className="h-9 w-full animate-pulse rounded-lg bg-muted md:hidden" aria-hidden="true" />

      <div
        className="space-y-3 rounded-2xl border border-dashed bg-card/50 p-6 md:p-8"
        aria-hidden="true"
      >
        <div className="mx-auto h-4 w-48 animate-pulse rounded-lg bg-muted" />
        <div className="mx-auto h-3 w-full max-w-md animate-pulse rounded-lg bg-muted" />
        <div className="mx-auto h-3 w-2/3 max-w-sm animate-pulse rounded-lg bg-muted" />
      </div>
    </main>
  )
}
