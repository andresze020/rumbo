import { Suspense, type ReactNode } from 'react'
import { Plus } from 'lucide-react'
import { AppSidebar } from '@/components/app-sidebar'
import { MobileNav } from '@/components/mobile-nav'
import { GlobalAddTransactionButton } from '@/components/global-add-transaction-button'
import { TransactionDialogProvider } from '@/components/transaction-dialog-provider'
import { AssistantDrawer } from '@/components/assistant-drawer'
import { InstallAppHint } from '@/components/install-app-hint'
import { LanguageProvider } from '@/components/language-provider'
import { getLocale } from '@/lib/i18n/server'

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale()

  return (
    <LanguageProvider locale={locale}>
      <Suspense>
        <TransactionDialogProvider>
          <div className="flex min-h-screen">
            {/* Desktop sidebar */}
            <AppSidebar className="hidden lg:flex" />

            {/* Main content area */}
            <div className="flex min-w-0 flex-1 flex-col">
              {/* Mobile top bar */}
              <MobileNav className="lg:hidden" />

              <InstallAppHint />

              <main className="flex-1 pb-24">
                {children}
              </main>
            </div>

            {/* FABs — assistant + add transaction */}
            <AssistantDrawer />
            <GlobalAddTransactionButton
              aria-label="Add transaction"
              title="Add transaction"
              className="fixed bottom-6 right-6 z-50 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <Plus className="size-6" aria-hidden="true" />
            </GlobalAddTransactionButton>
          </div>
        </TransactionDialogProvider>
      </Suspense>
    </LanguageProvider>
  )
}
