'use client'

import { useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

type AccountGroupProps = {
  label: string
  count: number
  subtotalLabel: string
  defaultOpen?: boolean
  children: ReactNode
}

/**
 * Collapsible group header for the "Group by type" account view. Mirrors the
 * expand/collapse idiom of AccountCardDetails so grouped and ungrouped lists feel
 * consistent. Display-only — subtotal is pre-formatted by the caller.
 */
export function AccountGroup({
  label,
  count,
  subtotalLabel,
  defaultOpen = true,
  children,
}: AccountGroupProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/60"
        aria-expanded={open}
      >
        <div className="flex min-w-0 items-center gap-2">
          <ChevronDown
            className={`size-4 shrink-0 text-muted-foreground transition-transform duration-200 ${
              open ? '' : '-rotate-90'
            }`}
            aria-hidden="true"
          />
          <span className="truncate text-sm font-semibold">{label}</span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {count} {count === 1 ? 'account' : 'accounts'}
          </span>
        </div>
        <span className="shrink-0 text-sm font-semibold tabular-nums">
          {subtotalLabel}
        </span>
      </button>

      <div
        className={`grid transition-all duration-200 ease-in-out ${
          open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className="overflow-hidden">
          <div className="divide-y border-t">{children}</div>
        </div>
      </div>
    </div>
  )
}
