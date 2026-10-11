import { describe, expect, it } from 'vitest'
import {
  assignableRoles,
  canLeave,
  canRemoveMember,
  canTransferOwnership,
  isMemberRefusal,
  memberRefusal,
  parseHouseholdMembers,
  transactionAuthors,
} from './members'

describe('assignableRoles (section 2)', () => {
  it('lets the owner move anyone else to any role but owner', () => {
    expect(assignableRoles('owner', 'admin', false)).toEqual(['member', 'viewer'])
    expect(assignableRoles('owner', 'member', false)).toEqual(['admin', 'viewer'])
    expect(assignableRoles('owner', 'viewer', false)).toEqual(['admin', 'member'])
  })

  it('lets an admin only switch a member and a viewer', () => {
    expect(assignableRoles('admin', 'member', false)).toEqual(['viewer'])
    expect(assignableRoles('admin', 'viewer', false)).toEqual(['member'])
    expect(assignableRoles('admin', 'admin', false)).toEqual([])
    expect(assignableRoles('admin', 'owner', false)).toEqual([])
  })

  it('offers nothing for your own role, the owner, or a member or viewer caller', () => {
    expect(assignableRoles('owner', 'owner', true)).toEqual([])
    expect(assignableRoles('admin', 'admin', true)).toEqual([])
    expect(assignableRoles('member', 'viewer', false)).toEqual([])
    expect(assignableRoles('viewer', 'member', false)).toEqual([])
    expect(assignableRoles(null, 'member', false)).toEqual([])
  })
})

describe('canRemoveMember, canTransferOwnership, canLeave', () => {
  it('follows the section-2 matrix for removal', () => {
    expect(canRemoveMember('owner', 'admin', false)).toBe(true)
    expect(canRemoveMember('owner', 'viewer', false)).toBe(true)
    expect(canRemoveMember('owner', 'owner', true)).toBe(false)
    expect(canRemoveMember('admin', 'member', false)).toBe(true)
    expect(canRemoveMember('admin', 'viewer', false)).toBe(true)
    expect(canRemoveMember('admin', 'admin', false)).toBe(false)
    expect(canRemoveMember('admin', 'owner', false)).toBe(false)
    expect(canRemoveMember('member', 'viewer', false)).toBe(false)
  })

  it('lets only the owner transfer, to someone else', () => {
    expect(canTransferOwnership('owner', false)).toBe(true)
    expect(canTransferOwnership('owner', true)).toBe(false)
    expect(canTransferOwnership('admin', false)).toBe(false)
  })

  it('lets everyone but the owner leave (S26)', () => {
    expect(canLeave('owner')).toBe(false)
    expect(canLeave('admin')).toBe(true)
    expect(canLeave('member')).toBe(true)
    expect(canLeave('viewer')).toBe(true)
    expect(canLeave(null)).toBe(false)
  })
})

describe('parseHouseholdMembers', () => {
  it('keeps well-formed rows and drops unknown roles or missing ids', () => {
    expect(
      parseHouseholdMembers([
        { user_id: 'u1', display_name: 'Ana', email: 'ana@example.test', role: 'owner', joined_at: '2026-01-01T00:00:00Z', is_former: false },
        { user_id: 'u2', display_name: '', email: null, role: 'viewer', joined_at: null, is_former: true },
        { user_id: 'u3', role: 'superuser' },
        { role: 'member' },
      ])
    ).toEqual([
      { userId: 'u1', displayName: 'Ana', email: 'ana@example.test', role: 'owner', joinedAt: '2026-01-01T00:00:00Z', isFormer: false },
      { userId: 'u2', displayName: null, email: null, role: 'viewer', joinedAt: null, isFormer: true },
    ])
    expect(parseHouseholdMembers(null)).toEqual([])
  })
})

describe('transactionAuthors (MEM-5)', () => {
  const owner = { userId: 'u1', displayName: 'Ana', email: null, role: 'owner' as const, joinedAt: null, isFormer: false }
  const former = { userId: 'u2', displayName: 'Luis', email: null, role: 'member' as const, joinedAt: null, isFormer: true }

  it('names nobody in a household that never had a second member', () => {
    expect(transactionAuthors([owner]).size).toBe(0)
  })

  it('names every member, former ones flagged, once there were two', () => {
    const authors = transactionAuthors([owner, former])
    expect(authors.get('u1')).toEqual({ name: 'Ana', isFormer: false })
    expect(authors.get('u2')).toEqual({ name: 'Luis', isFormer: true })
  })
})

describe('memberRefusal', () => {
  it('maps the database sentences and hides anything else', () => {
    expect(memberRefusal("Not authorized to manage this household's members")).toBe('not_authorized')
    expect(memberRefusal('The owner must transfer ownership before leaving')).toBe('owner_must_transfer')
    expect(memberRefusal('You cannot remove this member')).toBe('cannot_remove')
    expect(memberRefusal('duplicate key value violates unique constraint')).toBe('generic')
    expect(memberRefusal(undefined)).toBe('generic')
  })

  it('accepts only known codes from the URL', () => {
    expect(isMemberRefusal('cannot_remove')).toBe(true)
    expect(isMemberRefusal('generic')).toBe(true)
    expect(isMemberRefusal('<script>')).toBe(false)
  })
})
