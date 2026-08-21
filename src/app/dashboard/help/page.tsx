import Link from 'next/link'
import { ArrowRight, CalendarCheck, ListChecks } from 'lucide-react'
import { ServerPageHeader as PageHeader } from '@/components/server-page-header'
import { getLocale } from '@/lib/i18n/server'
import { translate, type TranslationKey } from '@/lib/i18n/translate'
import { cn } from '@/lib/utils'

const CARD = 'rounded-2xl border bg-card shadow-sm shadow-black/[0.03]'

/**
 * The home for the how-to content that used to live only in the "Getting
 * started" card. That card retires after a household's second month; these
 * answers do not.
 */
const FAQ: {
  question: TranslationKey
  answer: TranslationKey
  href: string
  linkLabel: TranslationKey
}[] = [
  { question: 'help.q1', answer: 'help.a1', href: '/dashboard/transactions', linkLabel: 'nav.transactions' },
  { question: 'help.q2', answer: 'help.a2', href: '/dashboard/transactions', linkLabel: 'nav.transactions' },
  { question: 'help.q3', answer: 'help.a3', href: '/dashboard/accounts', linkLabel: 'nav.accounts' },
  { question: 'help.q4', answer: 'help.a4', href: '/dashboard/budgets', linkLabel: 'nav.budgets' },
  { question: 'help.q5', answer: 'help.a5', href: '/dashboard/month-review', linkLabel: 'nav.monthReview' },
  { question: 'help.q6', answer: 'help.a6', href: '/dashboard/recurring', linkLabel: 'nav.recurring' },
  {
    question: 'help.q7',
    answer: 'help.a7',
    href: '/dashboard/transactions?review=unreviewed',
    linkLabel: 'nav.reviewQueue',
  },
  {
    question: 'help.q8',
    answer: 'help.a8',
    href: '/dashboard/transactions/import',
    linkLabel: 'nav.importCsv',
  },
  { question: 'help.q9', answer: 'help.a9', href: '/dashboard/transactions', linkLabel: 'nav.transactions' },
]

export default async function HelpPage() {
  const locale = await getLocale()
  const t = (key: TranslationKey) => translate(locale, key)

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 sm:p-6">
      <PageHeader title={t('help.title')} description={t('help.description')} />

      {/* How the Control center nudge behaves over a household's lifetime. */}
      <section className={cn(CARD, 'space-y-2 p-4 sm:p-5')}>
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <CalendarCheck className="size-4 text-primary" aria-hidden="true" />
          {t('help.rhythmTitle')}
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground">{t('help.rhythmBody')}</p>
        <Link
          href="/dashboard/month-review"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          <ListChecks className="size-4" aria-hidden="true" />
          {t('nav.monthReview')}
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      </section>

      <h2 className="px-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {t('help.faqTitle')}
      </h2>

      <div className="space-y-3">
        {FAQ.map((entry) => (
          <section key={entry.question} className={cn(CARD, 'space-y-2 p-4 sm:p-5')}>
            <h3 className="text-sm font-bold">{t(entry.question)}</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">{t(entry.answer)}</p>
            <Link
              href={entry.href}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              {t(entry.linkLabel)}
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          </section>
        ))}
      </div>
    </main>
  )
}
