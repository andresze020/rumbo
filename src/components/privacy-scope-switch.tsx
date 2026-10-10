'use client'

import { useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { Check, ChevronDown, Layers, Lock, Users, type LucideIcon } from 'lucide-react'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { setPrivacyScopeAction } from '@/app/dashboard/privacy-scope-actions'
import { useUiTranslation } from '@/lib/i18n/use-ui-translation'
import type { PrivacyScope } from '@/lib/privacy/scope'
import { cn } from '@/lib/utils'

const OPTIONS: { scope: PrivacyScope; label: string; description: string; icon: LucideIcon }[] = [
  {
    scope: 'household',
    label: 'Household',
    description: 'Shared accounts only: the numbers everyone in the household sees.',
    icon: Users,
  },
  { scope: 'mine', label: 'Mine', description: 'Only your private accounts.', icon: Lock },
  { scope: 'all', label: 'Everything', description: 'Shared accounts and your private ones.', icon: Layers },
]

/**
 * HH-3 (SCP-1): Household / Mine / Everything, in the app bar beside the
 * household selector.
 *
 * Shown only to a user who owns a private account in this household — for
 * everyone else the three are the same rows (SCP-6). Absent on Budgets, which
 * always count the household and say so on screen (SCP-4). The choice is
 * remembered per user (SCP-5) by a server action; RLS, not this switch,
 * decides what anyone can see.
 */
export function PrivacyScopeSwitch({
  scope,
  visible,
  className,
}: {
  scope: PrivacyScope
  visible: boolean
  className?: string
}) {
  const ui = useUiTranslation()
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const searchParams = useSearchParams()

  if (!visible || pathname.startsWith('/dashboard/budgets')) return null

  const current = OPTIONS.find((option) => option.scope === scope) ?? OPTIONS[2]
  const CurrentIcon = current.icon
  // Come back to the view the switch was made from, filters and all.
  const query = searchParams.toString()
  const returnTo = query ? `${pathname}?${query}` : pathname

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${ui('Showing')}: ${ui(current.label)}`}
        className={cn(
          // Same footprint as the household selector beside it: 32px tall, the
          // pseudo-element takes the tap target out to 44px.
          'relative inline-flex h-8 min-w-0 shrink-0 items-center gap-1 rounded-full border border-border/70 bg-card px-2.5 text-xs font-medium text-muted-foreground transition-colors',
          "before:absolute before:inset-x-0 before:-top-1.5 before:-bottom-1.5 before:content-['']",
          'hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
          className
        )}
      >
        <CurrentIcon className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate">{ui(current.label)}</span>
        <ChevronDown className="size-3.5 shrink-0 opacity-70" aria-hidden="true" />
      </button>

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent className="pb-[max(1rem,env(safe-area-inset-bottom))]">
          <DrawerHeader className="pb-2">
            <DrawerTitle>{ui('What to show')}</DrawerTitle>
            <DrawerDescription>
              {ui('Budgets and the month close always count the household.')}
            </DrawerDescription>
          </DrawerHeader>

          <div className="mx-auto w-full max-w-md space-y-1.5 px-4">
            {OPTIONS.map((option) => {
              const isCurrent = option.scope === current.scope
              const Icon = option.icon
              return (
                <form key={option.scope} action={setPrivacyScopeAction}>
                  <input type="hidden" name="scope" value={option.scope} />
                  <input type="hidden" name="return_to" value={returnTo} />
                  <button
                    type="submit"
                    onClick={() => setOpen(false)}
                    aria-current={isCurrent ? 'true' : undefined}
                    className={cn(
                      'flex min-h-13 w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                      isCurrent ? 'border-primary/40 bg-primary/10' : 'bg-background hover:bg-muted'
                    )}
                  >
                    <Icon
                      className={cn('size-4 shrink-0', isCurrent ? 'text-primary' : 'text-muted-foreground')}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{ui(option.label)}</span>
                      <span className="block text-xs text-muted-foreground">{ui(option.description)}</span>
                    </span>
                    {isCurrent ? <Check className="size-4 shrink-0 text-primary" aria-hidden="true" /> : null}
                  </button>
                </form>
              )
            })}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  )
}
