import { redirect } from 'next/navigation'
import { Download } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { ServerPageHeader as PageHeader } from '@/components/server-page-header'
import { ConfirmActionButton } from '@/components/confirm-action-button'
import { getLocale } from '@/lib/i18n/server'
import { translate } from '@/lib/i18n/translate'
import { canLeave, privateExportHref } from '@/lib/households/members'
import { leaveHouseholdAction } from '../member-actions'
import { BackToHousehold } from '../back-link'
import { HOUSEHOLD_PATH } from '../members-card'
import { countOwnPrivateAccounts, loadHouseholdBase } from '../data'

/**
 * HH-7: leaving is a page of its own (MEM-3). It says what happens, offers the
 * private-data CSV first (LIF-1), and the button still confirms in an alert
 * dialog. The owner never gets here (S26: transfer first).
 */
export default async function LeaveHouseholdPage() {
  const locale = await getLocale()
  const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate(locale, key, vars)
  const { householdId, household, callerRole, sharingEnabled } = await loadHouseholdBase()
  if (!sharingEnabled || !canLeave(callerRole)) redirect(HOUSEHOLD_PATH)

  const privateAccounts = await countOwnPrivateAccounts(householdId)
  const householdName = household?.name ?? ''

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8 sm:px-6">
      <PageHeader
        eyebrow={<BackToHousehold label={t('members.household.back')} />}
        title={t('members.actions.leaveTitle', { household: householdName })}
        description={t('members.actions.leaveDescription')}
      />

      {privateAccounts > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('members.leave.privateTitle')}</CardTitle>
            <CardDescription>{t('members.actions.leavePrivate', { count: privateAccounts })}</CardDescription>
          </CardHeader>
          <CardContent>
            <a
              href={privateExportHref(householdId)}
              download
              className={buttonVariants({ variant: 'outline', size: 'sm', className: 'gap-1.5' })}
            >
              <Download aria-hidden="true" />
              {t('members.actions.downloadPrivate')}
            </a>
          </CardContent>
        </Card>
      ) : null}

      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-destructive">{t('members.actions.leave')}</CardTitle>
          <CardDescription>{t('members.leave.confirmDescription', { household: householdName })}</CardDescription>
        </CardHeader>
        <CardContent>
          <ConfirmActionButton
            action={leaveHouseholdAction}
            hiddenFields={{ household_id: householdId }}
            triggerVariant="destructive"
            triggerLabel={t('members.actions.leave')}
            pendingLabel={t('members.actions.leaving')}
            title={t('members.actions.leaveTitle', { household: householdName })}
            description={t('members.leave.confirmDescription', { household: householdName })}
            cancelLabel={t('common.cancel')}
            confirmLabel={t('members.actions.leave')}
          />
        </CardContent>
      </Card>
    </div>
  )
}
