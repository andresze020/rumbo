"use client"

import * as React from "react"

import { cn } from "@/lib/utils"
import { useUiTranslation } from "@/lib/i18n/use-ui-translation"

function Label({ className, children, ...props }: React.ComponentProps<"label">) {
  const ui = useUiTranslation()
  return (
    <label
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className
      )}
      {...props}
    >
      {typeof children === "string" ? ui(children) : children}
    </label>
  )
}

export { Label }
