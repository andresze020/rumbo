/**
 * HH-5 household members — the section-2 role matrix as the app shows it, and
 * what a refused member call means. Pure: no I/O, so it is tested directly.
 *
 * The database is the enforcement point (set_household_member_role,
 * remove_household_member, leave_household, transfer_household_ownership);
 * these only decide which buttons to offer, so a button that is shown and then
 * refused is a bug here, never a hole.
 */

export const MEMBER_ROLES = ['owner', 'admin', 'member', 'viewer'] as const
export type MemberRole = (typeof MEMBER_ROLES)[number]

export function isMemberRole(value: unknown): value is MemberRole {
  return typeof value === 'string' && (MEMBER_ROLES as readonly string[]).includes(value)
}

/** The roles a role change can give: never owner (that is a transfer). */
export type AssignableRole = Exclude<MemberRole, 'owner'>

export function isAssignableRole(value: unknown): value is AssignableRole {
  return value === 'admin' || value === 'member' || value === 'viewer'
}

/**
 * The roles the caller may move the target to, excluding the one they hold.
 * Owner: anyone else, to admin, member or viewer. Admin: a member or a viewer,
 * to member or viewer. Nobody changes their own role or the owner's.
 */
export function assignableRoles(
  callerRole: MemberRole | null,
  targetRole: MemberRole,
  isSelf: boolean
): AssignableRole[] {
  if (isSelf || targetRole === 'owner') return []
  const roles: AssignableRole[] =
    callerRole === 'owner'
      ? ['admin', 'member', 'viewer']
      : callerRole === 'admin' && (targetRole === 'member' || targetRole === 'viewer')
        ? ['member', 'viewer']
        : []
  return roles.filter((role) => role !== targetRole)
}

/** Owner: anyone but themselves. Admin: members and viewers. */
export function canRemoveMember(callerRole: MemberRole | null, targetRole: MemberRole, isSelf: boolean): boolean {
  if (isSelf || targetRole === 'owner') return false
  if (callerRole === 'owner') return true
  return callerRole === 'admin' && (targetRole === 'member' || targetRole === 'viewer')
}

/** Only the owner, to another active member. */
export function canTransferOwnership(callerRole: MemberRole | null, isSelf: boolean): boolean {
  return callerRole === 'owner' && !isSelf
}

/** Anyone but the owner (S26: the owner transfers first). */
export function canLeave(callerRole: MemberRole | null): boolean {
  return callerRole !== null && callerRole !== 'owner'
}

export type HouseholdMember = {
  userId: string
  displayName: string | null
  /** Only for an owner/admin caller (MEM-1); null otherwise. */
  email: string | null
  role: MemberRole
  joinedAt: string | null
  isFormer: boolean
}

/**
 * get_household_members' rows, defensively: a row without a user id or with
 * an unknown role is dropped rather than shown half-formed.
 */
export function parseHouseholdMembers(rows: unknown): HouseholdMember[] {
  if (!Array.isArray(rows)) return []
  const members: HouseholdMember[] = []
  for (const value of rows) {
    const row = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
    const text = (key: string) => (typeof row[key] === 'string' && row[key] !== '' ? (row[key] as string) : null)
    const userId = text('user_id')
    if (!userId || !isMemberRole(row.role)) continue
    members.push({
      userId,
      displayName: text('display_name'),
      email: text('email'),
      role: row.role,
      joinedAt: text('joined_at'),
      isFormer: row.is_former === true,
    })
  }
  return members
}

/**
 * MEM-5: who added a shared transaction, by user id. Only in a household that
 * has ever had two members (former ones count); with one, the map is empty
 * and no transaction names anyone. A former member keeps their name, flagged.
 */
export type TransactionAuthor = { name: string | null; isFormer: boolean }

export function transactionAuthors(members: readonly HouseholdMember[]): Map<string, TransactionAuthor> {
  const authors = new Map<string, TransactionAuthor>()
  if (members.length < 2) return authors
  for (const member of members) {
    authors.set(member.userId, { name: member.displayName, isFormer: member.isFormer })
  }
  return authors
}

/**
 * What a refused member call means, from the database's own sentence. Settings
 * translates the code; an unknown message is `generic`, so a Postgres error
 * never reaches the screen as is.
 */
export type MemberRefusal =
  | 'not_authorized'
  | 'not_active_member'
  | 'own_role'
  | 'use_transfer'
  | 'invalid_role'
  | 'cannot_change_role'
  | 'cannot_remove'
  | 'remove_self'
  | 'not_member'
  | 'owner_must_transfer'
  | 'only_owner_transfers'
  | 'choose_new_owner'
  | 'export_unavailable'
  | 'generic'

const REFUSALS: Record<string, MemberRefusal> = {
  'Not authorized': 'not_authorized',
  "Not authorized to manage this household's members": 'not_authorized',
  'That person is not an active member of this household': 'not_active_member',
  'You cannot change your own role': 'own_role',
  'Transfer ownership to make someone the owner': 'use_transfer',
  'Choose a valid role': 'invalid_role',
  "You cannot change this member's role": 'cannot_change_role',
  'You cannot remove this member': 'cannot_remove',
  'You cannot remove yourself. Leave the household instead': 'remove_self',
  'You are not a member of this household': 'not_member',
  'The owner must transfer ownership before leaving': 'owner_must_transfer',
  'Only the owner can transfer ownership': 'only_owner_transfers',
  'Choose another active member as the new owner': 'choose_new_owner',
  'This export is no longer available': 'export_unavailable',
}

export function memberRefusal(message: string | null | undefined): MemberRefusal {
  return (message && REFUSALS[message]) || 'generic'
}

export function isMemberRefusal(value: unknown): value is MemberRefusal {
  return typeof value === 'string' && (value === 'generic' || Object.values(REFUSALS).includes(value as MemberRefusal))
}

/** The private-data CSV of one household (LIF-1, LIF-2). */
export function privateExportHref(householdId: string): string {
  return `/dashboard/household/private-export?household=${encodeURIComponent(householdId)}`
}

/** The success flags Settings shows after a member action (`?memberSaved=`). */
export const MEMBER_SAVED = ['role', 'removed', 'transferred'] as const
export type MemberSaved = (typeof MEMBER_SAVED)[number]

export function isMemberSaved(value: unknown): value is MemberSaved {
  return typeof value === 'string' && (MEMBER_SAVED as readonly string[]).includes(value)
}

/**
 * MEM-6: the audit actions Settings knows how to say. Anything else (a future
 * action) is shown generically rather than dropped, so the trail stays whole.
 */
export const AUDIT_ACTIONS = [
  'household_created',
  'invitation_created',
  'invitation_revoked',
  'invitation_accepted',
  'invitation_declined',
  'member_role_changed',
  'member_removed',
  'member_left',
  'ownership_transferred',
  'account_shared',
] as const
export type AuditAction = (typeof AUDIT_ACTIONS)[number]

export function isAuditAction(value: unknown): value is AuditAction {
  return typeof value === 'string' && (AUDIT_ACTIONS as readonly string[]).includes(value)
}
