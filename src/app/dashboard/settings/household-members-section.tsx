import { Download } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { Callout } from '@/components/callout'
import { ConfirmActionButton } from '@/components/confirm-action-button'
import { translate } from '@/lib/i18n/translate'
import type { Locale } from '@/lib/i18n/dictionaries'
import { localeToBcp47 } from '@/lib/format'
import {
  assignableRoles,
  canLeave,
  canRemoveMember,
  canTransferOwnership,
  isAuditAction,
  isMemberRole,
  privateExportHref,
  type AssignableRole,
  type HouseholdMember,
  type MemberRefusal,
  type MemberRole,
  type MemberSaved,
} from '@/lib/households/members'
import {
  leaveHouseholdAction,
  removeMemberAction,
  setMemberRoleAction,
  transferOwnershipAction,
} from './member-actions'

export type AuditEvent = {
  id: string
  actorId: string | null
  targetUserId: string | null
  action: string
  role: string | null
  createdAt: string
}

const MAKE_ROLE_KEY = {
  admin: 'members.actions.makeAdmin',
  member: 'members.actions.makeMember',
  viewer: 'members.actions.makeViewer',
} as const satisfies Record<AssignableRole, string>

/**
 * HH-5 Settings › Members (MEM-1, MEM-2, MEM-3, MEM-6, LIF-1). The page shows
 * it only with RUMBO_HOUSEHOLD_SHARING on. Every action here is a confirm
 * dialog posting a Server Action; the database enforces the role matrix, and
 * the buttons only follow it (src/lib/households/members.ts).
 */
export function HouseholdMembersSection({
  householdId,
  householdName,
  locale,
  callerId,
  callerRole,
  members,
  ownPrivateAccounts,
  activity,
  saved,
  errorCode,
}: {
  householdId: string
  householdName: string
  locale: Locale
  callerId: string
  callerRole: MemberRole | null
  /** get_household_members, former members included (for names). */
  members: HouseholdMember[]
  /** LIF-1: how many private accounts the caller holds in this household. */
  ownPrivateAccounts: number
  /** MEM-6: the last 50 events, or null when the caller may not see them. */
  activity: AuditEvent[] | null
  saved: MemberSaved | null
  errorCode: MemberRefusal | null
}) {
  const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate(locale, key, vars)
  const dateFormat = new Intl.DateTimeFormat(localeToBcp47(locale), { dateStyle: 'medium' })
  const dateTimeFormat = new Intl.DateTimeFormat(localeToBcp47(locale), { dateStyle: 'medium', timeStyle: 'short' })
  const active = members.filter((member) => !member.isFormer)
  // S26: the owner cannot leave while others remain; they transfer first.
  const showOwnerMustTransfer = callerRole === 'owner' && active.length > 1
  const nameOf = (member: HouseholdMember) => member.displayName ?? t('members.settings.unnamed')
  const roleLabel = (role: string) => (isMemberRole(role) ? t(`members.roleLabels.${role}`) : role)

  const byId = new Map(members.map((member) => [member.userId, member]))
  const personName = (userId: string | null) => {
    const member = userId ? byId.get(userId) : undefined
    if (!member) return t('members.activity.someone')
    return member.isFormer
      ? member.displayName
        ? t('members.formerMember', { name: member.displayName })
        : t('members.formerMemberUnnamed')
      : nameOf(member)
  }
  const describe = (event: AuditEvent) => {
    const vars = {
      actor: personName(event.actorId),
      target: personName(event.targetUserId),
      role: event.role ? roleLabel(event.role) : '',
      action: event.action,
    }
    return isAuditAction(event.action)
      ? t(`members.activity.actions.${event.action}`, vars)
      : t('members.activity.actions.other', vars)
  }

  return (
    <Card id="members" className="scroll-mt-20">
      <CardHeader>
        <CardTitle>{t('members.settings.title')}</CardTitle>
        <CardDescription>{t('members.settings.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {saved ? <Callout variant="success">{t(`members.settings.saved.${saved}`)}</Callout> : null}
        {errorCode ? <Callout variant="error">{t(`members.errors.${errorCode}`)}</Callout> : null}

        <ul className="divide-y rounded-xl border">
          {active.map((member) => {
            const isSelf = member.userId === callerId
            const name = nameOf(member)
            const roles = assignableRoles(callerRole, member.role, isSelf)
            const removable = canRemoveMember(callerRole, member.role, isSelf)
            const transferable = canTransferOwnership(callerRole, isSelf)
            const ids = { household_id: householdId, user_id: member.userId }
            const hasActions = roles.length > 0 || removable || transferable

            return (
              <li key={member.userId} className="space-y-2 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
                    <span className="truncate">{name}</span>
                    {isSelf ? (
                      <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                        {t('members.settings.you')}
                      </span>
                    ) : null}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {roleLabel(member.role)}
                    {member.joinedAt
                      ? ` · ${t('members.settings.joined', { date: dateFormat.format(new Date(member.joinedAt)) })}`
                      : ''}
                  </p>
                  {member.email ? <p className="truncate text-xs text-muted-foreground">{member.email}</p> : null}
                </div>

                {hasActions ? (
                  <details className="group">
                    <summary className="cursor-pointer select-none text-xs font-medium text-primary">
                      {t('members.settings.manage')}
                    </summary>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {roles.map((role) => (
                        <ConfirmActionButton
                          key={role}
                          action={setMemberRoleAction}
                          hiddenFields={{ ...ids, role }}
                          triggerVariant="outline"
                          triggerLabel={t(MAKE_ROLE_KEY[role])}
                          pendingLabel={t('members.actions.changing')}
                          title={t('members.actions.changeRoleTitle', { name })}
                          description={t('members.actions.changeRoleDescription', {
                            name,
                            role: roleLabel(role),
                            effect: t(`members.roleEffects.${role}`),
                          })}
                          cancelLabel={t('common.cancel')}
                          confirmLabel={t(MAKE_ROLE_KEY[role])}
                        />
                      ))}
                      {transferable ? (
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
                      ) : null}
                      {removable ? (
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
                      ) : null}
                    </div>
                  </details>
                ) : null}
              </li>
            )
          })}
        </ul>

        {canLeave(callerRole) ? (
          <ConfirmActionButton
            action={leaveHouseholdAction}
            hiddenFields={{ household_id: householdId }}
            triggerVariant="outline"
            triggerLabel={t('members.actions.leave')}
            pendingLabel={t('members.actions.leaving')}
            title={t('members.actions.leaveTitle', { household: householdName })}
            description={
              <span className="flex flex-col gap-3">
                <span>{t('members.actions.leaveDescription')}</span>
                {ownPrivateAccounts > 0 ? (
                  <>
                    <span>{t('members.actions.leavePrivate', { count: ownPrivateAccounts })}</span>
                    {/* LIF-1: a plain download link; the dialog stays open. */}
                    <a
                      href={privateExportHref(householdId)}
                      download
                      className={buttonVariants({ variant: 'outline', size: 'sm', className: 'w-fit gap-1.5' })}
                    >
                      <Download aria-hidden="true" />
                      {t('members.actions.downloadPrivate')}
                    </a>
                  </>
                ) : null}
              </span>
            }
            cancelLabel={t('common.cancel')}
            confirmLabel={t('members.actions.leave')}
          />
        ) : showOwnerMustTransfer ? (
          <p className="text-xs text-muted-foreground">{t('members.settings.ownerMustTransfer')}</p>
        ) : null}

        {activity ? (
          <details className="rounded-xl border px-3 py-2.5">
            <summary className="cursor-pointer select-none text-sm font-medium">{t('members.activity.title')}</summary>
            <p className="mt-1 text-xs text-muted-foreground">{t('members.activity.description')}</p>
            {activity.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">{t('members.activity.empty')}</p>
            ) : (
              <ol className="mt-2 space-y-2">
                {activity.map((event) => (
                  <li key={event.id} className="text-sm">
                    <p>{describe(event)}</p>
                    <p className="text-xs text-muted-foreground">{dateTimeFormat.format(new Date(event.createdAt))}</p>
                  </li>
                ))}
              </ol>
            )}
          </details>
        ) : null}
      </CardContent>
    </Card>
  )
}
