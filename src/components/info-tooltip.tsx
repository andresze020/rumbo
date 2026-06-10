"use client"

import { HelpCircle } from "lucide-react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { GLOSSARY, type GlossaryTerm } from "@/lib/glossary"
import { cn } from "@/lib/utils"

export function InfoTooltip({
  term,
  text,
  label,
  className,
}: {
  /** Looks up plain-language copy from the shared glossary. */
  term?: GlossaryTerm
  /** One-off explanation, used instead of / in addition to `term`. */
  text?: string
  /** Accessible label for the trigger button. Defaults to "More information". */
  label?: string
  className?: string
}) {
  const content = text ?? (term ? GLOSSARY[term] : undefined)
  if (!content) return null

  return (
    <Tooltip>
      <TooltipTrigger
        className={cn(
          "inline-flex shrink-0 items-center text-muted-foreground transition-colors hover:text-foreground",
          className
        )}
        aria-label={label ?? "More information"}
      >
        <HelpCircle className="size-3.5" aria-hidden="true" />
      </TooltipTrigger>
      <TooltipContent>{content}</TooltipContent>
    </Tooltip>
  )
}
