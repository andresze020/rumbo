'use client'

import { useState } from 'react'

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
}: {
  label: string
  name: string
  options: MultiSelectOption[]
  selectedIds: string[]
}) {
  const [checked, setChecked] = useState<Set<string>>(() => new Set(selectedIds))

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
    <details className="relative shrink-0">
      <summary className="flex h-9 cursor-pointer list-none items-center gap-1.5 rounded-lg border bg-background px-2.5 [&::-webkit-details-marker]:hidden">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className="max-w-[120px] truncate text-sm font-medium text-foreground">
          {summary}
        </span>
      </summary>
      <div className="absolute z-20 mt-1 max-h-60 w-56 overflow-auto rounded-lg border bg-popover p-1 shadow-md">
        {options.length === 0 ? (
          <p className="px-2 py-1.5 text-sm text-muted-foreground">No options</p>
        ) : (
          options.map((option) => (
            <label
              key={option.id}
              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent"
            >
              <input
                type="checkbox"
                name={name}
                value={option.id}
                checked={checked.has(option.id)}
                onChange={(e) => toggle(option.id, e.currentTarget.checked)}
                className="size-3.5 accent-primary"
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
