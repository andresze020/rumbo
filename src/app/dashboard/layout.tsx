import { type ReactNode } from 'react'
import { after } from 'next/server'
import { redirect } from 'next/navigation'
import { Plus } from 'lucide-react'
import { AppSidebar } from '@/components/app-sidebar'
import { MobileNav } from '@/components/mobile-nav'
import { MobileBottomNav } from '@/components/mobile-bottom-nav'
import { GlobalAddTransactionButton } from '@/components/global-add-transaction-button'
import { TransactionDialogProvider } from '@/components/transaction-dialog-provider'
import { AssistantProvider } from '@/components/assistant-drawer'
import { InstallAppHint } from '@/components/install-app-hint'
import { ExchangeRateAutoRefresh } from './exchange-rate-auto-refresh'
import { LanguageProvider } from '@/components/language-provider'
import { LocalizedClientBoundary } from '@/components/localized-client-boundary'
import { ScreenTransition } from '@/components/screen-transition'
import { TextSizeSync } from '@/components/text-size-sync'
import { TimeZoneCookieSync } from '@/components/time-zone-cookie-sync'
import { APP_SCROLL_ID } from '@/lib/app-scroll'
import { getLocale } from '@/lib/i18n/server'
import { createUiTranslator } from '@/lib/i18n/ui'
import { getHouseholdContext } from '@/lib/households/server'
import { reportPerfAfterResponse } from '@/lib/perf/collector'
import { getUiPreferences } from '@/lib/preferences/server'
import { getRequestUser } from '@/lib/supabase/request'

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  // RUM-001. No-op unless RUMBO_PERF=1. Registered here rather than per page so
  // one hook covers every dashboard route, and it runs after the response, by
  // which time the page's own queries have been recorded too.
  reportPerfAfterResponse(after)

  const locale = await getLocale()
  const ui = createUiTranslator(locale)

  // Signed-in identity for the sidebar's bottom user block (Option D).
  const user = await getRequestUser()
  const userEmail = user?.email ?? null

  // Read here rather than in the root layout: `<html>` lives up there, but so
  // does `/login`, and an unauthenticated page should not pay for a profile
  // query to learn a preference it cannot have.
  //
  // In parallel with the households the app bar's selector offers: two
  // independent reads, one round trip's worth of latency.
  const [{ textSize }, householdContext] = await Promise.all([
    getUiPreferences(),
    getHouseholdContext(),
  ])

  // MEM-7: the active household is not one the user belongs to any more. Hand
  // off to /onboarding, which repairs it in a Server Action — the same place
  // every page under this layout already redirects to when it cannot read the
  // household, so whichever redirect wins the race lands in one spot.
  if (householdContext.staleId) {
    redirect('/onboarding')
  }

  return (
    <LanguageProvider locale={locale}>
      <TransactionDialogProvider householdId={householdContext.currentId}>
        <LocalizedClientBoundary>
          <TextSizeSync value={textSize} />
          {/* MQ-001: the browser's time zone, for every server-side "today". */}
          <TimeZoneCookieSync />
          {/*
            The app shell: a box exactly the height of the viewport that does
            not scroll. The chrome is *in* it, and only the middle row moves.

            This replaces `position: fixed` chrome over a scrolling document,
            which never held still on iOS. Fixed anchors to the layout
            viewport, and on a phone that box is regularly not the box you can
            see — a collapsing browser toolbar, a rubber-band overscroll and a
            pinch zoom each move one and not the other. Correcting for that
            from JS meant tracking `visualViewport` and translating the bars to
            match, and the corrections kept being wrong in a new direction:
            first the bars sat low, then they walked *down* the screen
            mid-scroll, then they rode *up* off it. Every one of those was the
            same mistake — chasing what an engine reports instead of stepping
            out of the way.

            A bar that is not inside the scrolling box cannot be moved by the
            scrolling box, on any engine, with no measurement and nothing to
            keep in sync. `dvh` (not `vh`) so the shell tracks a browser
            toolbar opening and closing rather than hanging a bar's height off
            the bottom.

            `ViewportPin` stays: dialogs, sheets and the FABs are still
            `fixed`, and still want re-boxing onto the screen under pinch zoom.
            It is the two bars that stop needing it.
          */}
          {/* Owns the assistant sheet, so the mobile top bar can open it. */}
          <AssistantProvider>
          <div className="flex h-dvh overflow-hidden">
          {/* Desktop sidebar */}
          <AppSidebar
            className="hidden lg:flex"
            userEmail={userEmail}
            households={householdContext.households}
            currentHouseholdId={householdContext.currentId}
          />

          {/* Main content area */}
          <div className="flex min-w-0 flex-1 flex-col">
            {/* Mobile top bar */}
            <MobileNav
              className="lg:hidden"
              households={householdContext.households}
              currentHouseholdId={householdContext.currentId}
            />

            {/* Tops up the household's FX rates once a day, so a
                foreign-currency balance reads at today's rate without anyone
                entering one. Renders nothing. */}
            <ExchangeRateAutoRefresh />

            {/* The only scrolling box in the dashboard — see `lib/app-scroll`.
                `overscroll-contain` keeps a bounce at either end from handing
                the gesture to the document behind it.

                `relative` makes it the containing block of every `absolute`
                element a screen renders. Without it, one with no positioned
                ancestor of its own resolves against the root instead: this
                box neither clips nor scrolls it, and it lands at its in-flow
                offset in *document* coordinates — making the document taller
                than the screen, so the whole shell scrolls away (MQ-002). */}
            <main
              id={APP_SCROLL_ID}
              className="relative flex-1 overflow-y-auto overscroll-contain pb-6"
            >
              {/* Above `ScreenTransition` so it does not replay the arrival
                  animation on every route change. */}
              <InstallAppHint />
              <ScreenTransition>{children}</ScreenTransition>
            </main>

            {/* Mobile bottom nav (replaces the desktop add FAB on small
                screens). A real flex row under the scroller now, so content
                ends above it instead of behind it. */}
            <MobileBottomNav className="lg:hidden" />
          </div>

          {/* Add-transaction FAB, desktop only. The assistant's FAB (also
              desktop only) renders from `AssistantProvider`. */}
          <GlobalAddTransactionButton
            aria-label={ui('Add transaction')}
            title={ui('Add transaction')}
            className="vv-pin-corner [--vv-pin-inset-x:1.5rem] [--vv-pin-inset-y:1.5rem] fixed bottom-6 right-6 z-50 hidden size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 lg:flex"
          >
            <Plus className="size-6" aria-hidden="true" />
          </GlobalAddTransactionButton>
          </div>
          </AssistantProvider>
        </LocalizedClientBoundary>
      </TransactionDialogProvider>
    </LanguageProvider>
  )
}
