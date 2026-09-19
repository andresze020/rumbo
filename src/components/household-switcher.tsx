'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { Check, ChevronDown, Settings2, Users } from 'lucide-react'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { switchHouseholdAction } from '@/app/dashboard/household-actions'
import { useUiTranslation } from '@/lib/i18n/use-ui-translation'
import { cn } from '@/lib/utils'

export type HouseholdOption = { id: string; name: string }

/**
 * The active household, in the app bar beside the Rumbo mark.
 *
 * It was an eyebrow row on the Transactions screen that linked to Settings —
 * a whole row of vertical space, on one screen only, for something that scopes
 * every screen, and a tap that went somewhere nobody asked to go. It is a
 * selector now: the households this user is an active member of, the current
 * one ticked, and "Manage households" as the secondary way into Settings.
 *
 * Switching posts to a server action that re-checks membership; general
 * Settings stays reachable from More and from the sidebar, not from here.
 */
export function HouseholdSwitcher({
  households,
  currentId,
  className,
}: {
  households: HouseholdOption[]
  currentId: string | null
  className?: string
}) {
  const ui = useUiTranslation()
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const current = households.find((household) => household.id === currentId)
  if (!current) return null

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
        aria-label={`${ui('Household')}: ${current.name}`}
        className={cn(
          // 32px tall so it sits inside the app bar without growing it; the
          // pseudo-element takes the tap target out to 44px.
          'relative inline-flex h-8 min-w-0 items-center gap-1 rounded-full border border-border/70 bg-card px-2.5 text-xs font-medium text-muted-foreground transition-colors',
          "before:absolute before:inset-x-0 before:-top-1.5 before:-bottom-1.5 before:content-['']",
          'hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
          className
        )}
      >
        {/* A household, not a person: two figures rather than one. */}
        <Users className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate">{current.name}</span>
        <ChevronDown className="size-3.5 shrink-0 opacity-70" aria-hidden="true" />
      </button>

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent className="pb-[max(1rem,env(safe-area-inset-bottom))]">
          <DrawerHeader className="pb-2">
            <DrawerTitle>{ui('Household')}</DrawerTitle>
            <DrawerDescription>
              {ui('Everything in Rumbo belongs to the household you pick here.')}
            </DrawerDescription>
          </DrawerHeader>

          <div className="mx-auto w-full max-w-md space-y-1.5 px-4">
            {households.map((household) => {
              const isCurrent = household.id === current.id
              return (
                <form key={household.id} action={switchHouseholdAction}>
                  <input type="hidden" name="household_id" value={household.id} />
                  <input type="hidden" name="return_to" value={returnTo} />
                  <button
                    type="submit"
                    onClick={() => setOpen(false)}
                    aria-current={isCurrent ? 'true' : undefined}
                    className={cn(
                      'flex min-h-13 w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                      isCurrent
                        ? 'border-primary/40 bg-primary/10'
                        : 'bg-background hover:bg-muted'
                    )}
                  >
                    <Users
                      className={cn(
                        'size-4 shrink-0',
                        isCurrent ? 'text-primary' : 'text-muted-foreground'
                      )}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {household.name}
                    </span>
                    {isCurrent ? (
                      <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />
                    ) : null}
                  </button>
                </form>
              )
            })}

            {/* The secondary action. Renaming a household, its base currency and
                its month start day all live in Settings; this is the way there
                that does not hijack the name itself. */}
            <Link
              href="/dashboard/settings#household"
              onClick={() => setOpen(false)}
              className="flex min-h-13 w-full items-center gap-3 rounded-xl border border-dashed px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              <Settings2 className="size-4 shrink-0" aria-hidden="true" />
              {ui('Manage households')}
            </Link>
          </div>
        </DrawerContent>
      </Drawer>
    </>
  )
}
