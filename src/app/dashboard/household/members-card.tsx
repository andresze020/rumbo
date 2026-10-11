import Link from 'next/link'
import { ChevronRight, LogOut } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { translate } from '@/lib/i18n/translate'
import type { Locale } from '@/lib/i18n/dictionaries'
import { localeToBcp47 } from '@/lib/format'
import {
  canLeave,
  isAuditAction,
  isMemberRole,
  type HouseholdMember,
  type MemberRole,
} from '@/lib/households/members'

export type AuditEvent = {
  id: string
  actorId: string | null
  targetUserId: string | null
  action: string
  role: string | null
  createdAt: string
}

export const HOUSEHOLD_PATH = '/dashboard/household'

export function memberPath(userId: string): string {
  return `${HOUSEHOLD_PATH}/members/${userId}`
}

type T = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => string

function translator(locale: Locale): T {
  return (key, vars) => translate(locale, key, vars)
}

export function memberName(t: T, member: HouseholdMember): string {
  return member.displayName ?? t('members.settings.unnamed')
}

export function roleLabel(t: T, role: string): string {
  return isMemberRole(role) ? t(`members.roleLabels.${role}`) : role
}

/**
 * HH-7 Household › Members (MEM-1). Each member is a row that opens their own
 * page, where the role, ownership and removal actions live (MEM-2). Leaving is
 * its own page too (MEM-3, LIF-1).
 */
export function MembersCard({
  locale,
  callerId,
  callerRole,
  members,
}: {
  locale: Locale
  callerId: string
  callerRole: MemberRole | null
  /** get_household_members, former members included; only active ones are listed. */
  members: HouseholdMember[]
}) {
  const t = translator(locale)
  const dateFormat = new Intl.DateTimeFormat(localeToBcp47(locale), { dateStyle: 'medium' })
  const active = members.filter((member) => !member.isFormer)
  // S26: the owner cannot leave while others remain; they transfer first.
  const showOwnerMustTransfer = callerRole === 'owner' && active.length > 1

  return (
    <Card id="members" className="scroll-mt-20">
      <CardHeader>
        <CardTitle>{t('members.settings.title')}</CardTitle>
        <CardDescription>{t('members.settings.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="divide-y rounded-xl border">
          {active.map((member) => {
            const isSelf = member.userId === callerId
            return (
              <li key={member.userId}>
                <Link
                  href={memberPath(member.userId)}
                  className="flex items-center gap-3 px-3 py-3 transition-colors hover:bg-muted/50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
                      <span className="truncate">{memberName(t, member)}</span>
                      {isSelf ? (
                        <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                          {t('members.settings.you')}
                        </span>
                      ) : null}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {roleLabel(t, member.role)}
                      {member.joinedAt
                        ? ` · ${t('members.settings.joined', { date: dateFormat.format(new Date(member.joinedAt)) })}`
                        : ''}
                    </p>
                    {member.email ? <p className="truncate text-xs text-muted-foreground">{member.email}</p> : null}
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                </Link>
              </li>
            )
          })}
        </ul>

        {canLeave(callerRole) ? (
          <Link
            href={`${HOUSEHOLD_PATH}/leave`}
            className={buttonVariants({ variant: 'outline', size: 'sm', className: 'gap-1.5' })}
          >
            <LogOut aria-hidden="true" />
            {t('members.actions.leave')}
          </Link>
        ) : showOwnerMustTransfer ? (
          <p className="text-xs text-muted-foreground">{t('members.settings.ownerMustTransfer')}</p>
        ) : null}
      </CardContent>
    </Card>
  )
}

/** MEM-6: the last 50 membership events, owner/admin only. */
export function ActivityCard({
  locale,
  members,
  activity,
}: {
  locale: Locale
  members: HouseholdMember[]
  activity: AuditEvent[]
}) {
  const t = translator(locale)
  const dateTimeFormat = new Intl.DateTimeFormat(localeToBcp47(locale), { dateStyle: 'medium', timeStyle: 'short' })
  const byId = new Map(members.map((member) => [member.userId, member]))
  const personName = (userId: string | null) => {
    const member = userId ? byId.get(userId) : undefined
    if (!member) return t('members.activity.someone')
    return member.isFormer
      ? member.displayName
        ? t('members.formerMember', { name: member.displayName })
        : t('members.formerMemberUnnamed')
      : memberName(t, member)
  }
  const describe = (event: AuditEvent) => {
    const vars = {
      actor: personName(event.actorId),
      target: personName(event.targetUserId),
      role: event.role ? roleLabel(t, event.role) : '',
      action: event.action,
    }
    return isAuditAction(event.action)
      ? t(`members.activity.actions.${event.action}`, vars)
      : t('members.activity.actions.other', vars)
  }

  return (
    <Card id="activity" className="scroll-mt-20">
      <CardHeader>
        <CardTitle>{t('members.activity.title')}</CardTitle>
        <CardDescription>{t('members.activity.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        {activity.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('members.activity.empty')}</p>
        ) : (
          <ol className="space-y-3">
            {activity.map((event) => (
              <li key={event.id} className="text-sm">
                <p>{describe(event)}</p>
                <p className="text-xs text-muted-foreground">{dateTimeFormat.format(new Date(event.createdAt))}</p>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  )
}
