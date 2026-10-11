import { describe, expect, it } from 'vitest'
import {
  inviteReturnPathFromNext,
  invitableRoles,
  invitationRefusal,
  invitePath,
  isInvitationRefusal,
  isInvitationToken,
  parseInvitationPreview,
  parseInviteReturnPath,
} from './invitations'

const TOKEN = 'aB3_-'.repeat(8) + 'xyz' // 43 base64url characters

describe('isInvitationToken', () => {
  it('accepts 43 base64url characters only', () => {
    expect(TOKEN).toHaveLength(43)
    expect(isInvitationToken(TOKEN)).toBe(true)
    expect(isInvitationToken(TOKEN.slice(1))).toBe(false)
    expect(isInvitationToken(`${TOKEN}=`)).toBe(false)
    expect(isInvitationToken(TOKEN.replace('_', '/'))).toBe(false)
    expect(isInvitationToken(undefined)).toBe(false)
  })
})

describe('parseInviteReturnPath (S14)', () => {
  it('keeps an invite path', () => {
    expect(parseInviteReturnPath(invitePath(TOKEN))).toBe(`/invite/${TOKEN}`)
  })
  it('refuses anything else, so the cookie can never redirect elsewhere', () => {
    for (const bad of [
      undefined,
      null,
      '',
      '/dashboard',
      `https://evil.com/invite/${TOKEN}`,
      `//evil.com/invite/${TOKEN}`,
      `/invite/${TOKEN}/extra`,
      `/invite/${TOKEN}?x=1`,
      '/invite/short',
    ]) {
      expect(parseInviteReturnPath(bad)).toBeNull()
    }
  })
})

describe('invitableRoles (INV-1)', () => {
  it('the owner invites admin, member and viewer', () => {
    expect(invitableRoles('owner')).toEqual(['admin', 'member', 'viewer'])
  })
  it('an admin invites member and viewer only', () => {
    expect(invitableRoles('admin')).toEqual(['member', 'viewer'])
  })
  it('a member, a viewer or nobody invites no one', () => {
    expect(invitableRoles('member')).toEqual([])
    expect(invitableRoles('viewer')).toEqual([])
    expect(invitableRoles(null)).toEqual([])
  })
})

describe('parseInvitationPreview', () => {
  it('reads a full preview', () => {
    expect(
      parseInvitationPreview({
        status: 'ok',
        household_name: 'Family',
        inviter_name: 'Ana',
        inviter_email: 'ana@example.test',
        role: 'member',
        expires_at: '2026-10-17T00:00:00Z',
        shared_accounts: 4,
      })
    ).toEqual({
      status: 'ok',
      householdName: 'Family',
      inviterName: 'Ana',
      inviterEmail: 'ana@example.test',
      role: 'member',
      expiresAt: '2026-10-17T00:00:00Z',
      sharedAccounts: 4,
    })
  })
  it('reads the status-only answers', () => {
    expect(parseInvitationPreview({ status: 'wrong_email' })).toEqual({ status: 'wrong_email' })
    expect(parseInvitationPreview({ status: 'unverified' })).toEqual({ status: 'unverified' })
    expect(
      parseInvitationPreview({ status: 'already_member', household_id: 'h1', household_name: 'Family' })
    ).toEqual({ status: 'already_member', householdId: 'h1', householdName: 'Family' })
  })
  it('treats anything incomplete or unknown as the neutral dead end', () => {
    expect(parseInvitationPreview(null)).toEqual({ status: 'unavailable' })
    expect(parseInvitationPreview({ status: 'ok', household_name: 'Family' })).toEqual({ status: 'unavailable' })
    expect(parseInvitationPreview({ status: 'ok', household_name: 'F', role: 'owner', expires_at: 'x', shared_accounts: 1 })).toEqual({
      status: 'unavailable',
    })
    expect(parseInvitationPreview({ status: 'surprise' })).toEqual({ status: 'unavailable' })
  })
})

describe('invitationRefusal', () => {
  it("maps the database's own sentences to a code", () => {
    expect(invitationRefusal('This invitation was sent to a different email address')).toBe('wrong_email')
    expect(invitationRefusal('This household already has 10 pending invitations. Revoke one first')).toBe('pending_cap')
    expect(invitationRefusal('Only the owner can invite an admin')).toBe('only_owner_invites_admin')
  })
  it('hides anything not written for a person', () => {
    expect(invitationRefusal('duplicate key value violates unique constraint')).toBe('generic')
    expect(invitationRefusal(undefined)).toBe('generic')
  })
  it('recognises its own codes (for a ?error= read back from the URL)', () => {
    expect(isInvitationRefusal('pending_cap')).toBe(true)
    expect(isInvitationRefusal('generic')).toBe(true)
    expect(isInvitationRefusal('<script>')).toBe(false)
  })
})

describe('inviteReturnPathFromNext (HH-7)', () => {
  it('keeps only the invite path of a full URL or a path', () => {
    expect(inviteReturnPathFromNext('https://app.example/invite/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')).toBe('/invite/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')
    expect(inviteReturnPathFromNext('/invite/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')).toBe('/invite/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')
    // Another site's URL keeps only its path: never a redirect off the app.
    expect(inviteReturnPathFromNext('https://evil.example/invite/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')).toBe('/invite/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')
  })

  it('refuses anything that is not an invite path', () => {
    expect(inviteReturnPathFromNext('https://app.example/')).toBeNull()
    expect(inviteReturnPathFromNext('/dashboard')).toBeNull()
    expect(inviteReturnPathFromNext('//evil.example/x')).toBeNull()
    expect(inviteReturnPathFromNext('/invite/short')).toBeNull()
    expect(inviteReturnPathFromNext(null)).toBeNull()
  })
})
