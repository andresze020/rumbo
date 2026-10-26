import { notFound } from 'next/navigation'
import { LanguageProvider } from '@/components/language-provider'
import { TransactionDialogProvider } from '@/components/transaction-dialog-provider'
import { getLocale } from '@/lib/i18n/server'
import { TransactionForm } from '@/app/dashboard/transactions/transaction-form'
import { EditTransactionSheet } from '@/app/dashboard/transactions/edit-transaction-sheet'
import { OpenEntryButton } from './open-entry-button'
import fixtures from '../../../../e2e/entry/fixtures.json'

export const dynamic = 'force-dynamic'

// The stand-in's own fixtures (shared with e2e/entry/mock-supabase.mjs), for
// the edit mode below, which the Transactions page would load from the
// database. Kept outside src/ so the i18n audit does not read fixture names
// as interface copy.
const { accounts: ACCOUNTS, categories: CATEGORIES } = fixtures

/**
 * Test harness for `npm run e2e:entry`: the transaction entry dialog on an
 * otherwise empty page, so the browser scenarios exercise the real form
 * without the dashboard around it. `?edit=expense` or `?edit=transfer` opens
 * the edit sheet instead, as the Transactions page does.
 *
 * It exists only when the server runs with `RUMBO_E2E=1` outside Vercel;
 * everywhere else, production included, it is a 404.
 */
export default async function EntryHarnessPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  // Never on a Vercel deployment (preview or production), even if the flag
  // leaked into its environment. Not NODE_ENV: the scenarios run against a
  // production build on purpose.
  if (process.env.RUMBO_E2E !== '1' || process.env.VERCEL) notFound()
  const locale = await getLocale()
  const { edit } = await searchParams
  // Out of the JSX, so the i18n audit does not read the enum values as copy.
  const editKind = edit === 'transfer' || edit === 'expense' ? edit : null
  const editTitle = editKind === 'transfer' ? 'Edit transfer' : 'Edit transaction'
  return (
    <LanguageProvider locale={locale}>
      <TransactionDialogProvider householdId="h1">
        {/* Tall enough to scroll, like a real screen behind the dialog. */}
        <div style={{ height: 2000 }} />
        <OpenEntryButton />
        {editKind ? (
          <EditTransactionSheet
            title={editTitle}
            cancelHref="/e2e/entry"
          >
            <TransactionForm
              editTransactionId="tx-1"
              defaultType={editKind}
              defaultDate="2026-10-20"
              defaultAccountId="a1"
              defaultCurrencyCode="CAD"
              defaultCategoryId="c1"
              defaultFromAccountId="a1"
              defaultToAccountId="a3"
              defaultAmount="25.00"
              defaultToAmount="50000.00"
              defaultDescription="Groceries run"
              defaultNotes=""
              defaultStatus="posted"
              accounts={ACCOUNTS}
              categories={CATEGORIES}
              payees={[]}
              tags={[]}
              baseCurrency="CAD"
              cancelHref="/e2e/entry"
              returnTo="/e2e/entry"
            />
          </EditTransactionSheet>
        ) : null}
      </TransactionDialogProvider>
    </LanguageProvider>
  )
}
