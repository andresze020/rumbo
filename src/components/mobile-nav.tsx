'use client'

import Link from 'next/link'
import { Bot, Wallet } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ThemeToggle } from '@/components/theme-toggle'
import { Button } from '@/components/ui/button'
import { useOpenAssistant } from '@/components/assistant-drawer'
import { useUiTranslation } from '@/lib/i18n/use-ui-translation'
import { HouseholdSwitcher, type HouseholdOption } from '@/components/household-switcher'
import { useLanguage } from '@/components/language-provider'

/**
 * Slim mobile top bar: brand, the active household, the assistant, theme.
 * Navigation lives in the bottom nav (`MobileBottomNav`) and the "More" page.
 *
 * The assistant is a button here rather than a floating one (MQ-004): a FAB
 * over a phone screen covered the amounts and row actions on the right edge.
 *
 * The household sits here rather than on the screens themselves. It scopes all
 * of them, and the bar already had the empty middle to hold it — which is how
 * the Transactions header lost a whole row without losing the control.
 */
export function MobileNav({
  className,
  households = [],
  currentHouseholdId = null,
}: {
  className?: string
  households?: HouseholdOption[]
  currentHouseholdId?: string | null
}) {
  const { t } = useLanguage()
  const ui = useUiTranslation()
  const openAssistant = useOpenAssistant()

  return (
    <header
      className={cn(
        // A plain flex row in the app shell, not `fixed` over the page. The
        // shell does not scroll, so this cannot be scrolled away from, and
        // there is no viewport geometry to track to keep it in place — see the
        // comment on the shell in `app/dashboard/layout.tsx`.
        'z-10 flex h-[calc(3.5rem+env(safe-area-inset-top))] shrink-0 items-center gap-2 border-b bg-background px-3 pt-[env(safe-area-inset-top)]',
        className
      )}
    >
      <Link href="/dashboard" className="flex shrink-0 items-center gap-2">
        <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Wallet className="size-4" aria-hidden="true" />
        </span>
        {/* The wordmark is the first thing to go when the household name is
            long: the mark beside it still says which app this is. */}
        <span className="hidden text-sm font-semibold min-[360px]:inline">
          {t('nav.appName')}
        </span>
      </Link>

      <HouseholdSwitcher
        households={households}
        currentId={currentHouseholdId}
        className="min-w-0 shrink"
      />

      <div className="ml-auto flex shrink-0 items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={openAssistant}
          aria-label={ui('Open assistant')}
          title={ui('AI Assistant')}
          className="size-8 shrink-0"
        >
          <Bot className="size-4" aria-hidden="true" />
        </Button>
        <ThemeToggle />
      </div>
    </header>
  )
}
