import { redirect } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ServerPageHeader as PageHeader } from '@/components/server-page-header'
import { ConfirmActionButton } from '@/components/confirm-action-button'
import { getLocale } from '@/lib/i18n/server'
import { translate } from '@/lib/i18n/translate'
import { localeToBcp47 } from '@/lib/format'
import {
  assignableRoles,
  canRemoveMember,
  canTransferOwnership,
  type AssignableRole,
} from '@/lib/households/members'
import { removeMemberAction, setMemberRoleAction, transferOwnershipAction } from '../../member-actions'
import { BackToHousehold } from '../../back-link'
import { HOUSEHOLD_PATH, memberName, roleLabel } from '../../members-card'
import { loadHouseholdBase, loadMembers } from '../../data'

const MAKE_ROLE_KEY = {
  admin: 'members.actions.makeAdmin',
  member: 'members.actions.makeMember',
  viewer: 'members.actions.makeViewer',
} as const satisfies Record<AssignableRole, string>

type Props = { params: Promise<{ userId: string }> }

/**
 * HH-7: one member, full page (MEM-1, MEM-2). Shows only what the section-2
 * matrix lets the caller do to this person; every action still confirms in an
 * alert dialog and the database decides (src/lib/households/members.ts).
 */
export default async function MemberPage({ params }: Props) {
  const { userId } = await params
  const locale = await getLocale()
  const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate(locale, key, vars)
  const { user, householdId, callerRole, sharingEnabled } = await loadHouseholdBase()
  if (!sharingEnabled) redirect(HOUSEHOLD_PATH)

  const members = await loadMembers(householdId)
  const member = members.find((candidate) => candidate.userId === userId && !candidate.isFormer)
  if (!member) redirect(HOUSEHOLD_PATH)

  const isSelf = member.userId === user.id
  const name = memberName(t, member)
  const roles = assignableRoles(callerRole, member.role, isSelf)
  const removable = canRemoveMember(callerRole, member.role, isSelf)
  const transferable = canTransferOwnership(callerRole, isSelf)
  const ids = { household_id: householdId, user_id: member.userId }
  const dateFormat = new Intl.DateTimeFormat(localeToBcp47(locale), { dateStyle: 'medium' })

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8 sm:px-6">
      <PageHeader
        eyebrow={<BackToHousehold label={t('members.household.back')} />}
        title={isSelf ? `${name} · ${t('members.settings.you')}` : name}
        description={[
          roleLabel(t, member.role),
          member.joinedAt ? t('members.settings.joined', { date: dateFormat.format(new Date(member.joinedAt)) }) : null,
          member.email,
        ]
          .filter(Boolean)
          .join(' · ')}
      />

      {roles.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('members.member.roleTitle')}</CardTitle>
            <CardDescription>{t('members.member.roleDescription', { name, role: roleLabel(t, member.role) })}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {roles.map((role) => (
              <div key={role} className="flex flex-col gap-2 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{roleLabel(t, role)}</p>
                  <p className="text-xs text-muted-foreground">{t(`members.roleEffects.${role}`)}</p>
                </div>
                <ConfirmActionButton
                  action={setMemberRoleAction}
                  hiddenFields={{ ...ids, role }}
                  triggerVariant="outline"
                  triggerLabel={t(MAKE_ROLE_KEY[role])}
                  pendingLabel={t('members.actions.changing')}
                  title={t('members.actions.changeRoleTitle', { name })}
                  description={t('members.actions.changeRoleDescription', {
                    name,
                    role: roleLabel(t, role),
                    effect: t(`members.roleEffects.${role}`),
                  })}
                  cancelLabel={t('common.cancel')}
                  confirmLabel={t(MAKE_ROLE_KEY[role])}
                />
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {transferable ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('members.member.ownershipTitle')}</CardTitle>
            <CardDescription>{t('members.actions.makeOwnerDescription', { name })}</CardDescription>
          </CardHeader>
          <CardContent>
            <ConfirmActionButton
              action={transferOwnershipAction}
              hiddenFields={ids}
              triggerVariant="outline"
              triggerLabel={t('members.actions.makeOwner')}
              pendingLabel={t('members.actions.transferring')}
              title={t('members.actions.makeOwnerTitle', { name })}
              description={t('members.actions.makeOwnerDescription', { name })}
              cancelLabel={t('common.cancel')}
              confirmLabel={t('members.actions.makeOwner')}
            />
          </CardContent>
        </Card>
      ) : null}

      {removable ? (
        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle className="text-destructive">{t('members.member.removeTitle')}</CardTitle>
            <CardDescription>{t('members.actions.removeDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            <ConfirmActionButton
              action={removeMemberAction}
              hiddenFields={ids}
              triggerVariant="destructive"
              triggerLabel={t('members.actions.remove')}
              pendingLabel={t('members.actions.removing')}
              title={t('members.actions.removeTitle', { name })}
              description={t('members.actions.removeDescription')}
              cancelLabel={t('common.cancel')}
              confirmLabel={t('members.actions.remove')}
            />
          </CardContent>
        </Card>
      ) : null}

      {roles.length === 0 && !transferable && !removable ? (
        <p className="text-sm text-muted-foreground">
          {isSelf ? t('members.member.selfNoActions') : t('members.member.noActions')}
        </p>
      ) : null}
    </div>
  )
}
