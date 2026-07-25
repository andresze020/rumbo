import { type ReactNode } from 'react'
import { Plus } from 'lucide-react'
import { AppSidebar } from '@/components/app-sidebar'
import { MobileNav } from '@/components/mobile-nav'
import { MobileBottomNav } from '@/components/mobile-bottom-nav'
import { GlobalAddTransactionButton } from '@/components/global-add-transaction-button'
import { TransactionDialogProvider } from '@/components/transaction-dialog-provider'
import { AssistantDrawer } from '@/components/assistant-drawer'
import { InstallAppHint } from '@/components/install-app-hint'
import { LanguageProvider } from '@/components/language-provider'
import { LocalizedClientBoundary } from '@/components/localized-client-boundary'
import { getLocale } from '@/lib/i18n/server'
import { createUiTranslator } from '@/lib/i18n/ui'
import { createClient } from '@/lib/supabase/server'

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale()
  const ui = createUiTranslator(locale)

  // Signed-in identity for the sidebar's bottom user block (Option D).
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const userEmail = user?.email ?? null

  return (
    <LanguageProvider locale={locale}>
      <TransactionDialogProvider>
        <LocalizedClientBoundary>
          <div className="flex min-h-screen">
          {/* Desktop sidebar */}
          <AppSidebar className="hidden lg:flex" userEmail={userEmail} />

          {/* Main content area */}
          <div className="flex min-w-0 flex-1 flex-col">
            {/* Mobile top bar */}
            <MobileNav className="lg:hidden" />

            <InstallAppHint />

            <main className="flex-1 pt-14 pb-24 lg:pt-0 lg:pb-24">
              {children}
            </main>
          </div>

          {/* Mobile bottom nav (replaces the desktop add FAB on small screens) */}
          <MobileBottomNav className="lg:hidden" />

          {/* FABs — assistant + add transaction (desktop only for add) */}
          <AssistantDrawer />
          <GlobalAddTransactionButton
            aria-label={ui('Add transaction')}
            title={ui('Add transaction')}
            className="fixed bottom-6 right-6 z-50 hidden size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 lg:flex"
          >
            <Plus className="size-6" aria-hidden="true" />
          </GlobalAddTransactionButton>
          </div>
        </LocalizedClientBoundary>
      </TransactionDialogProvider>
    </LanguageProvider>
  )
}
