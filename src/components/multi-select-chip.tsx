'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

export type MultiSelectOption = { id: string; label: string; isArchived?: boolean }

/**
 * A compact `<details>` chip holding a checkbox list, used in the Transactions
 * and Reports filter bars. Draft selections are tracked locally so several
 * options can be ticked before the parent form is submitted ("Apply filters").
 * Emits a checkbox per option under `name`, so it round-trips as repeated query
 * params in a plain GET form.
 */
export function MultiSelectChip({
  label,
  name,
  options,
  selectedIds,
  open,
  onOpenChange,
}: {
  label: string
  name: string
  options: MultiSelectOption[]
  selectedIds: string[]
  /**
   * Controlled open state. Pass it (with `onOpenChange`) when several chips
   * share a row: their panels are absolutely positioned, so two open at once
   * overlap each other and the content underneath. Omit both to let the native
   * `<details>` manage itself.
   */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const isControlled = open !== undefined && onOpenChange !== undefined
  const [checked, setChecked] = useState<Set<string>>(() => new Set(selectedIds))

  // Re-seed the draft whenever the applied selection changes under us. The
  // transactions bar applies filters with a client-side navigation, so this
  // component is no longer remounted on every apply, and a stale draft would
  // silently re-add a filter the user had just removed. Adjusted during render
  // rather than in an effect, per
  // https://react.dev/learn/you-might-not-need-an-effect.
  const appliedKey = selectedIds.join(',')
  const [syncedKey, setSyncedKey] = useState(appliedKey)
  if (appliedKey !== syncedKey) {
    setSyncedKey(appliedKey)
    setChecked(new Set(selectedIds))
  }

  function toggle(id: string, isChecked: boolean) {
    setChecked((prev) => {
      const next = new Set(prev)
      if (isChecked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const summary =
    checked.size === 0
      ? 'All'
      : checked.size === 1
        ? options.find((o) => o.id === [...checked][0])?.label ?? '1 selected'
        : `${checked.size} selected`

  return (
    // Full-width disclosure row on phones, compact chip from `sm` up: a row of
    // truncated chips is unusable on a narrow screen, and a floating panel has
    // nowhere to float inside a bottom sheet.
    <details
      className="group relative w-full shrink-0 sm:w-auto"
      open={isControlled ? open : undefined}
    >
      <summary
        // With a controlled `open`, the browser's own toggle would fight the
        // prop — take over the click and report the intent instead.
        onClick={
          isControlled
            ? (event) => {
                event.preventDefault()
                onOpenChange(!open)
              }
            : undefined
        }
        className="flex h-11 cursor-pointer list-none items-center gap-1.5 rounded-xl border bg-background px-3 transition-colors hover:bg-muted/50 sm:h-9 sm:rounded-lg sm:px-2.5 [&::-webkit-details-marker]:hidden"
      >
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground sm:max-w-[120px] sm:flex-none">
          {summary}
        </span>
        <ChevronDown
          className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <div className="static mt-1.5 max-h-60 w-full overflow-auto rounded-xl border bg-popover p-1 sm:absolute sm:z-20 sm:mt-1 sm:w-56 sm:rounded-lg sm:shadow-md">
        {options.length === 0 ? (
          <p className="px-2 py-1.5 text-sm text-muted-foreground">No options</p>
        ) : (
          options.map((option) => (
            <label
              key={option.id}
              className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2.5 text-sm hover:bg-accent sm:py-1.5"
            >
              <input
                type="checkbox"
                name={name}
                value={option.id}
                checked={checked.has(option.id)}
                onChange={(e) => toggle(option.id, e.currentTarget.checked)}
                className="size-4 shrink-0 accent-primary sm:size-3.5"
              />
              <span className="truncate">
                {option.label}
                {option.isArchived ? ' (archived)' : ''}
              </span>
            </label>
          ))
        )}
      </div>
    </details>
  )
}
