"use client"

import { useState, type ReactNode } from "react"
import { ChevronDown } from "lucide-react"
import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"

/**
 * Collapsible "Advanced options" section for forms. Fields stay mounted
 * (just visually hidden) so their values are always submitted, even while
 * collapsed.
 */
export function AdvancedFields({
  children,
  defaultOpen = false,
  summary,
  label = "Advanced options",
  className,
}: {
  children: ReactNode
  /** Start expanded — use when the field values are required (e.g. non-base currency). */
  defaultOpen?: boolean
  /** Short text shown next to the trigger while collapsed, e.g. a current value. */
  summary?: string
  /** Trigger label. Defaults to "Advanced options". */
  label?: string
  className?: string
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className={cn("border-t pt-3", className)}
    >
      <CollapsibleTrigger type="button" className="w-full justify-between">
        <span className="flex min-w-0 items-center gap-1.5">
          {label}
          {!open && summary ? (
            <span className="truncate text-xs font-normal text-muted-foreground">
              · {summary}
            </span>
          ) : null}
        </span>
        <ChevronDown
          className={cn("size-4 shrink-0 transition-transform", open && "rotate-180")}
          aria-hidden="true"
        />
      </CollapsibleTrigger>
      <CollapsiblePanel className="space-y-3 pt-3">{children}</CollapsiblePanel>
    </Collapsible>
  )
}
