import { redirect } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { ServerPageHeader as PageHeader } from '@/components/server-page-header'
import { getLocale } from '@/lib/i18n/server'
import { translate } from '@/lib/i18n/translate'
import { InviteMemberForm } from '../invite-member-form'
import { BackToHousehold } from '../back-link'
import { HOUSEHOLD_PATH } from '../members-card'
import { inviteRolesFor, loadHouseholdBase, loadInviteReview, loadPendingInvitations } from '../data'

/**
 * HH-7: inviting someone is a page of its own (it used to be a dialog over
 * Settings). Same three steps as HH-4 — INV-3 review before the first link,
 * email and role (INV-1), then the link once (INV-2) — plus the email the
 * invitee now receives.
 */
export default async function InvitePage() {
  const locale = await getLocale()
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key)
  const { householdId, callerRole, sharingEnabled } = await loadHouseholdBase()
  const roles = inviteRolesFor(callerRole, sharingEnabled)
  if (roles.length === 0) redirect(HOUSEHOLD_PATH)

  const pending = await loadPendingInvitations(householdId)
  const review = await loadInviteReview(householdId, pending.length)

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8 sm:px-6">
      <PageHeader
        eyebrow={<BackToHousehold label={t('members.household.back')} />}
        title={t('invitations.page.title')}
        description={t('invitations.page.description')}
      />
      <Card>
        <CardContent className="pt-6">
          <InviteMemberForm householdId={householdId} roles={roles} review={review} closeHref={HOUSEHOLD_PATH} />
        </CardContent>
      </Card>
    </div>
  )
}
