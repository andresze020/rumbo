import Link from 'next/link'
import { UserPlus } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { Callout } from '@/components/callout'
import { FormDialog } from '@/components/form-dialog'
import { ConfirmActionButton } from '@/components/confirm-action-button'
import { translate } from '@/lib/i18n/translate'
import type { Locale } from '@/lib/i18n/dictionaries'
import { localeToBcp47 } from '@/lib/format'
import type { InvitationRefusal, InvitationRole } from '@/lib/households/invitations'
import { revokeInvitationAction } from './invitation-actions'
import { InviteMemberForm, type InviteReviewAccount } from './invite-member-form'

export type PendingInvitation = {
  id: string
  email: string
  role: InvitationRole
  invitedByName: string | null
  expiresAt: string
}

const SETTINGS_PATH = '/dashboard/settings'

/**
 * HH-4 Settings › Invitations (INV-1…INV-4), owner/admin only and only with
 * RUMBO_HOUSEHOLD_SHARING on (the page decides both). The pending list comes
 * from list_household_invitations; the invite dialog opens on `?invite=1`.
 */
export function HouseholdInvitationsSection({
  locale,
  callerRole,
  roles,
  invitations,
  review,
  dialogOpen,
  revoked,
  errorCode,
}: {
  locale: Locale
  callerRole: string
  roles: InvitationRole[]
  invitations: PendingInvitation[]
  /** INV-3: the accounts to review before the first link, or null. */
  review: InviteReviewAccount[] | null
  dialogOpen: boolean
  revoked: boolean
  errorCode: InvitationRefusal | null
}) {
  const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate(locale, key, vars)
  const dateFormat = new Intl.DateTimeFormat(localeToBcp47(locale), { dateStyle: 'medium' })
  const closeHref = `${SETTINGS_PATH}#invitations`
  // Only the owner revokes an admin invitation (INV-1).
  const rows = invitations.map((invitation) => ({
    ...invitation,
    canRevoke: invitation.role !== 'admin' || callerRole === 'owner',
  }))

  return (
    <Card id="invitations" className="scroll-mt-20">
      <CardHeader>
        <CardTitle>{t('invitations.settings.title')}</CardTitle>
        <CardDescription>{t('invitations.settings.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {revoked ? <Callout variant="success">{t('invitations.settings.revoked')}</Callout> : null}
        {errorCode ? <Callout variant="error">{t(`invitations.errors.${errorCode}`)}</Callout> : null}

        <Link
          href={`${SETTINGS_PATH}?invite=1#invitations`}
          scroll={false}
          className={buttonVariants({ size: 'sm', className: 'gap-1.5' })}
        >
          <UserPlus aria-hidden="true" />
          {t('invitations.settings.invite')}
        </Link>

        <div className="space-y-2">
          <p className="text-sm font-medium">{t('invitations.settings.pendingTitle')}</p>
          {invitations.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('invitations.settings.empty')}</p>
          ) : (
            <ul className="divide-y rounded-xl border">
              {rows.map((invitation) => (
                <li key={invitation.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{invitation.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {t(`invitations.roleLabels.${invitation.role}`)}
                      {' · '}
                      {t('invitations.settings.expires', { date: dateFormat.format(new Date(invitation.expiresAt)) })}
                      {invitation.invitedByName
                        ? ` · ${t('invitations.settings.invitedBy', { name: invitation.invitedByName })}`
                        : ''}
                    </p>
                  </div>
                  {invitation.canRevoke ? (
                    <ConfirmActionButton
                      action={revokeInvitationAction}
                      hiddenFields={{ invitation_id: invitation.id }}
                      triggerVariant="outline"
                      triggerLabel={t('invitations.settings.revoke')}
                      pendingLabel={t('invitations.settings.revoking')}
                      title={t('invitations.settings.revokeTitle')}
                      description={t('invitations.settings.revokeDescription', { email: invitation.email })}
                      cancelLabel={t('common.cancel')}
                      confirmLabel={t('invitations.settings.revoke')}
                    />
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>

      {dialogOpen ? (
        <FormDialog
          title={t('invitations.settings.dialogTitle')}
          description={t('invitations.settings.dialogDescription')}
          cancelHref={closeHref}
        >
          <InviteMemberForm roles={roles} review={review} closeHref={closeHref} />
        </FormDialog>
      ) : null}
    </Card>
  )
}
