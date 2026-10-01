'use client'

import * as React from 'react'

import { cn } from '@/lib/utils'
import { useUiTranslation } from '@/lib/i18n/use-ui-translation'

/**
 * `autoComplete` defaults to "off" (MQ-007). Every field in the app — amounts,
 * names of goals, debts, categories, payees — is the household's own data, and
 * the browser's suggestions over the keyboard (contact names in a debt's name,
 * last week's amount in a target, saved cards) were noise at best and a way to
 * mix someone else's details into a record at worst. A field that does want
 * autofill names its token explicitly, as login and the settings email and
 * password fields do, and that always wins.
 */
function Input({
  className,
  type,
  placeholder,
  'aria-label': ariaLabel,
  title,
  autoComplete = 'off',
  ...props
}: React.ComponentProps<'input'>) {
  const ui = useUiTranslation()
  return (
    <input
      type={type}
      placeholder={typeof placeholder === 'string' ? ui(placeholder) : placeholder}
      aria-label={typeof ariaLabel === 'string' ? ui(ariaLabel) : ariaLabel}
      title={typeof title === 'string' ? ui(title) : title}
      autoComplete={autoComplete}
      data-slot="input"
      className={cn(
        "h-11 w-full min-w-0 rounded-xl border border-input bg-transparent px-3 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Input }
