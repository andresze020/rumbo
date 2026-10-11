import 'server-only'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getOwnPrivateAccountIds } from '@/lib/privacy/server'
import { isHouseholdSharingEnabled } from '@/lib/households/sharing-flag'
import { invitableRoles, isInvitationRole, type InvitationRole } from '@/lib/households/invitations'
import { isMemberRole, parseHouseholdMembers, type HouseholdMember, type MemberRole } from '@/lib/households/members'

/**
 * The signed-in user and their active household, for every screen of the
 * Household section. Redirects like Settings did: no session → /login, no
 * household → /onboarding. Reads only; never throws on an optional read.
 */
export async function loadHouseholdBase() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('default_household_id')
    .eq('id', user.id)
    .maybeSingle()
  const householdId = (profile?.default_household_id as string | null) ?? null
  if (!householdId) redirect('/onboarding')

  const [{ data: household }, { data: membership }] = await Promise.all([
    supabase.from('households').select('name, base_currency, month_start_day').eq('id', householdId).maybeSingle(),
    supabase
      .from('household_members')
      .select('role')
      .eq('household_id', householdId)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle(),
  ])
  const role = (membership as { role?: string } | null)?.role
  const callerRole: MemberRole | null = isMemberRole(role) ? role : null

  return {
    supabase,
    user,
    householdId,
    household: household as { name: string; base_currency: string; month_start_day: number } | null,
    callerRole,
    sharingEnabled: isHouseholdSharingEnabled(),
  }
}

/** get_household_members, former members included (names for history). */
export async function loadMembers(householdId: string): Promise<HouseholdMember[]> {
  const supabase = await createClient()
  const { data } = await supabase.rpc('get_household_members', { p_household_id: householdId })
  return parseHouseholdMembers(data)
}

export type PendingInvitation = {
  id: string
  email: string
  role: InvitationRole
  invitedByName: string | null
  expiresAt: string
}

export async function loadPendingInvitations(householdId: string): Promise<PendingInvitation[]> {
  const supabase = await createClient()
  const { data } = await supabase.rpc('list_household_invitations', { p_household_id: householdId })
  return ((data ?? []) as {
    id: string
    email: string
    role: string
    invited_by_name: string | null
    expires_at: string
  }[])
    .filter((row) => isInvitationRole(row.role))
    .map((row) => ({
      id: row.id,
      email: row.email,
      role: row.role as InvitationRole,
      invitedByName: row.invited_by_name,
      expiresAt: row.expires_at,
    }))
}

/**
 * INV-3: every account as Shared / Only me, but only before the first link —
 * a single active member and nothing pending. null otherwise.
 */
export async function loadInviteReview(
  householdId: string,
  pendingCount: number
): Promise<{ id: string; name: string; isPrivate: boolean }[] | null> {
  if (pendingCount > 0) return null
  const supabase = await createClient()
  const [{ count: activeMembers }, { data: rows }] = await Promise.all([
    supabase
      .from('household_members')
      .select('user_id', { count: 'exact', head: true })
      .eq('household_id', householdId)
      .eq('status', 'active'),
    supabase
      .from('accounts')
      .select('id, name, private_owner_id')
      .eq('household_id', householdId)
      .is('deleted_at', null)
      .order('is_archived', { ascending: true })
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('name', { ascending: true }),
  ])
  if (activeMembers !== 1) return null
  return ((rows ?? []) as { id: string; name: string; private_owner_id: string | null }[]).map((row) => ({
    id: row.id,
    name: row.name,
    isPrivate: row.private_owner_id !== null,
  }))
}

export function inviteRolesFor(callerRole: MemberRole | null, sharingEnabled: boolean): InvitationRole[] {
  return sharingEnabled ? invitableRoles(callerRole) : []
}

export async function countOwnPrivateAccounts(householdId: string): Promise<number> {
  return (await getOwnPrivateAccountIds(householdId)).size
}
