import { notFound } from 'next/navigation'
import { LanguageProvider } from '@/components/language-provider'
import { TransactionDialogProvider } from '@/components/transaction-dialog-provider'
import { getLocale } from '@/lib/i18n/server'
import { OpenEntryButton } from './open-entry-button'

export const dynamic = 'force-dynamic'

/**
 * Test harness for `npm run e2e:entry`: the transaction entry dialog on an
 * otherwise empty page, so the browser scenarios exercise the real form
 * without the dashboard around it. It exists only when the server runs with
 * `RUMBO_E2E=1`; everywhere else, production included, it is a 404.
 */
export default async function EntryHarnessPage() {
  if (process.env.RUMBO_E2E !== '1') notFound()
  const locale = await getLocale()
  return (
    <LanguageProvider locale={locale}>
      <TransactionDialogProvider householdId="h1">
        {/* Tall enough to scroll, like a real screen behind the dialog. */}
        <div style={{ height: 2000 }} />
        <OpenEntryButton />
      </TransactionDialogProvider>
    </LanguageProvider>
  )
}
