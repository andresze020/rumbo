/**
 * HH-4 household invitations — the rules the app shares between the invite
 * page, the login flow and Settings. Pure: no I/O, so it is tested directly.
 *
 * The raw token exists only in create_household_invitation's return value,
 * the link the inviter is shown once, and the invite URL (`/invite/<token>`).
 * The return-after-sign-in cookie (S14) holds that same path and nothing else.
 */

/** The cookie that brings a signed-out invitee back to the link (S14). */
export const INVITE_RETURN_COOKIE = 'rumbo-invite-return'

/** Long enough to sign up and confirm an email address, short enough to forget. */
export const INVITE_RETURN_MAX_AGE_SECONDS = 60 * 60

/** 32 random bytes, base64url without padding (S9). */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/
const INVITE_PATH_PATTERN = /^\/invite\/[A-Za-z0-9_-]{43}$/

export function isInvitationToken(value: unknown): value is string {
  return typeof value === 'string' && TOKEN_PATTERN.test(value)
}

export function invitePath(token: string): string {
  return `/invite/${token}`
}

/**
 * The only value the return cookie may hold: an invite path. Anything else —
 * an absolute URL, another route, a malformed token — reads as no cookie, so
 * it can never become an open redirect.
 */
export function parseInviteReturnPath(value: string | null | undefined): string | null {
  return typeof value === 'string' && INVITE_PATH_PATTERN.test(value) ? value : null
}

export const INVITATION_ROLES = ['admin', 'member', 'viewer'] as const
export type InvitationRole = (typeof INVITATION_ROLES)[number]

export function isInvitationRole(value: unknown): value is InvitationRole {
  return typeof value === 'string' && (INVITATION_ROLES as readonly string[]).includes(value)
}

/** INV-1: the owner invites any role but owner; an admin, member or viewer only. */
export function invitableRoles(callerRole: string | null | undefined): InvitationRole[] {
  if (callerRole === 'owner') return ['admin', 'member', 'viewer']
  if (callerRole === 'admin') return ['member', 'viewer']
  return []
}

export type InvitationPreview =
  | { status: 'unavailable' }
  | { status: 'wrong_email' }
  | { status: 'unverified' }
  | { status: 'already_member'; householdId: string; householdName: string }
  | {
      status: 'ok'
      householdName: string
      inviterName: string | null
      inviterEmail: string | null
      role: InvitationRole
      expiresAt: string
      sharedAccounts: number
    }

/**
 * get_household_invitation_preview's jsonb, defensively: anything unexpected
 * reads as the neutral dead end, never as a partial invitation.
 */
export function parseInvitationPreview(value: unknown): InvitationPreview {
  const row = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const text = (key: string) => (typeof row[key] === 'string' ? (row[key] as string) : null)

  switch (row.status) {
    case 'wrong_email':
      return { status: 'wrong_email' }
    case 'unverified':
      return { status: 'unverified' }
    case 'already_member': {
      const householdId = text('household_id')
      const householdName = text('household_name')
      return householdId && householdName
        ? { status: 'already_member', householdId, householdName }
        : { status: 'unavailable' }
    }
    case 'ok': {
      const householdName = text('household_name')
      const expiresAt = text('expires_at')
      const shared = Number(row.shared_accounts)
      if (!householdName || !expiresAt || !isInvitationRole(row.role) || !Number.isFinite(shared)) {
        return { status: 'unavailable' }
      }
      return {
        status: 'ok',
        householdName,
        inviterName: text('inviter_name'),
        inviterEmail: text('inviter_email'),
        role: row.role,
        expiresAt,
        sharedAccounts: Math.max(0, Math.trunc(shared)),
      }
    }
    default:
      return { status: 'unavailable' }
  }
}

/**
 * What a refused invitation call means, from the database's own sentence. The
 * page and Settings translate the code; an unknown message is `generic`, so a
 * Postgres error never reaches the screen as is.
 */
export type InvitationRefusal =
  | 'not_authorized'
  | 'only_owner_invites_admin'
  | 'own_email'
  | 'invalid_email'
  | 'invalid_role'
  | 'members_cap'
  | 'pending_cap'
  | 'daily_cap'
  | 'no_longer_valid'
  | 'wrong_email'
  | 'unverified'
  | 'own_invitation'
  | 'no_longer_pending'
  | 'generic'

const REFUSALS: Record<string, InvitationRefusal> = {
  'Not authorized to invite to this household': 'not_authorized',
  'Household sharing is not enabled': 'not_authorized',
  'Only the owner can invite an admin': 'only_owner_invites_admin',
  'Only the owner can revoke an admin invitation': 'only_owner_invites_admin',
  'You cannot invite your own email address': 'own_email',
  'Enter a valid email address': 'invalid_email',
  'Choose a valid role for the invitation': 'invalid_role',
  'This household already has the maximum of 6 members': 'members_cap',
  'This household already has 10 pending invitations. Revoke one first': 'pending_cap',
  'This household has created 20 invitations in the last day. Try again tomorrow': 'daily_cap',
  'This invitation is no longer valid': 'no_longer_valid',
  'This invitation was sent to a different email address': 'wrong_email',
  'Confirm your email address first': 'unverified',
  'You cannot accept your own invitation': 'own_invitation',
  'This invitation is no longer pending': 'no_longer_pending',
}

export function invitationRefusal(message: string | null | undefined): InvitationRefusal {
  return (message && REFUSALS[message]) || 'generic'
}

export function isInvitationRefusal(value: unknown): value is InvitationRefusal {
  return typeof value === 'string' && (value === 'generic' || Object.values(REFUSALS).includes(value as InvitationRefusal))
}
