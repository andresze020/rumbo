import { Download } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { translate } from '@/lib/i18n/translate'
import type { Locale } from '@/lib/i18n/dictionaries'
import { localeToBcp47 } from '@/lib/format'
import { privateExportHref } from '@/lib/households/members'

export type FormerHousehold = {
  householdId: string
  householdName: string
  exportUntil: string
  privateAccounts: number
}

/**
 * get_my_former_households' rows, defensively: anything malformed is dropped.
 */
export function parseFormerHouseholds(rows: unknown): FormerHousehold[] {
  if (!Array.isArray(rows)) return []
  return rows.flatMap((value) => {
    const row = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
    const accounts = Number(row.private_accounts)
    return typeof row.household_id === 'string' &&
      typeof row.household_name === 'string' &&
      typeof row.export_until === 'string' &&
      Number.isFinite(accounts)
      ? [{
          householdId: row.household_id,
          householdName: row.household_name,
          exportUntil: row.export_until,
          privateAccounts: accounts,
        }]
      : []
  })
}

/**
 * HH-5 (LIF-2): households the user left or was removed from in the last 30
 * days and still has private accounts in, each with a CSV download of that
 * private data. On Settings, and on onboarding for someone with no household
 * left. Renders nothing when the list is empty.
 */
export function FormerHouseholdsSection({
  locale,
  households,
}: {
  locale: Locale
  households: FormerHousehold[]
}) {
  if (households.length === 0) return null
  const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate(locale, key, vars)
  const dateFormat = new Intl.DateTimeFormat(localeToBcp47(locale), { dateStyle: 'medium' })

  return (
    <Card id="former-households" className="scroll-mt-20">
      <CardHeader>
        <CardTitle>{t('members.formerHouseholds.title')}</CardTitle>
        <CardDescription>{t('members.formerHouseholds.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y rounded-xl border">
          {households.map((household) => (
            <li key={household.householdId} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{household.householdName}</p>
                <p className="text-xs text-muted-foreground">
                  {t('members.formerHouseholds.accounts', { count: household.privateAccounts })}
                  {' · '}
                  {t('members.formerHouseholds.until', { date: dateFormat.format(new Date(household.exportUntil)) })}
                </p>
              </div>
              <a
                href={privateExportHref(household.householdId)}
                download
                className={buttonVariants({ variant: 'outline', size: 'sm', className: 'shrink-0 gap-1.5' })}
              >
                <Download aria-hidden="true" />
                {t('members.formerHouseholds.download')}
              </a>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
