import { cn } from '@/lib/utils'

const TOTAL_STEPS = 5

/** "Step X of 5" progress header shared by every onboarding step after the welcome page. */
export function StepIndicator({ step }: { step: number }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Step {step} of {TOTAL_STEPS}
      </p>
      <div className="flex items-center gap-1.5" aria-hidden="true">
        {Array.from({ length: TOTAL_STEPS }, (_, index) => (
          <span
            key={index}
            className={cn(
              'size-1.5 rounded-full transition-colors',
              index < step ? 'bg-primary' : 'bg-muted-foreground/25'
            )}
          />
        ))}
      </div>
    </div>
  )
}
