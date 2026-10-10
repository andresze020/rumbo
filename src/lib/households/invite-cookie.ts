import 'server-only'
import { cookies } from 'next/headers'
import {
  INVITE_RETURN_COOKIE,
  INVITE_RETURN_MAX_AGE_SECONDS,
  invitePath,
  parseInviteReturnPath,
} from './invitations'
import { isHouseholdSharingEnabled } from './sharing-flag'

/**
 * S14: return-after-sign-in for an invitation. httpOnly (no script reads it),
 * SameSite=Lax (sent on the top-level navigation back from email
 * confirmation), short-lived, and only ever an `/invite/<token>` path — never a
 * query parameter.
 *
 * Readable anywhere on the server; written and cleared only from a Server
 * Action or a route handler (Next refuses cookie writes during render).
 */
export async function readInviteReturnPath(): Promise<string | null> {
  // With invitations switched off, a leftover cookie leads nowhere useful.
  if (!isHouseholdSharingEnabled()) return null
  const store = await cookies()
  return parseInviteReturnPath(store.get(INVITE_RETURN_COOKIE)?.value)
}

export async function setInviteReturnCookie(token: string): Promise<void> {
  const store = await cookies()
  store.set(INVITE_RETURN_COOKIE, invitePath(token), {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: INVITE_RETURN_MAX_AGE_SECONDS,
  })
}

export async function clearInviteReturnCookie(): Promise<void> {
  const store = await cookies()
  store.delete(INVITE_RETURN_COOKIE)
}
