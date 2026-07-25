"use client"

import { HelpCircle } from "lucide-react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { GLOSSARY, type GlossaryTerm } from "@/lib/glossary"
import { useUiTranslation } from "@/lib/i18n/use-ui-translation"
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
  const ui = useUiTranslation()
  const content = text ?? (term ? GLOSSARY[term] : undefined)
  if (!content) return null

  return (
    <Tooltip>
      <TooltipTrigger
        render={<span tabIndex={0} role="button" />}
        className={cn(
          "inline-flex shrink-0 items-center text-muted-foreground transition-colors hover:text-foreground",
          className
        )}
        aria-label={ui(label ?? "More information")}
        onClick={(e) => e.stopPropagation()}
      >
        <HelpCircle className="size-3.5" aria-hidden="true" />
      </TooltipTrigger>
      <TooltipContent>{ui(content)}</TooltipContent>
    </Tooltip>
  )
}
