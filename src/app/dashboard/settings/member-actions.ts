'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isHouseholdSharingEnabled } from '@/lib/households/sharing-flag'
import { isAssignableRole, memberRefusal, type MemberSaved } from '@/lib/households/members'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MEMBERS_HASH = '#members'

async function signedInClient() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  return supabase
}

/**
 * The household the card was rendered for and the member the row is about,
 * never the profile's current default: another tab may have switched it. The
 * RPCs check the caller's role in exactly this household.
 */
function readIds(formData: FormData) {
  const householdId = String(formData.get('household_id') ?? '')
  const userId = String(formData.get('user_id') ?? '')
  return UUID_PATTERN.test(householdId) && UUID_PATTERN.test(userId) ? { householdId, userId } : null
}

function done(error: { message?: string } | null, saved: MemberSaved): never {
  // The member list, every page's household selector, and the pages a role
  // change opens or closes (MEM-4 is RLS; this only refreshes the cache).
  revalidatePath('/dashboard', 'layout')
  if (error) redirect(`/dashboard/settings?memberError=${memberRefusal(error.message)}${MEMBERS_HASH}`)
  redirect(`/dashboard/settings?memberSaved=${saved}${MEMBERS_HASH}`)
}

/** HH-5 (MEM-2): change another member's role, per the section-2 matrix. */
export async function setMemberRoleAction(formData: FormData) {
  const ids = readIds(formData)
  const role = formData.get('role')
  if (!isHouseholdSharingEnabled() || !ids || !isAssignableRole(role)) redirect(`/dashboard/settings${MEMBERS_HASH}`)

  const supabase = await signedInClient()
  const { error } = await supabase.rpc('set_household_member_role', {
    p_household_id: ids.householdId,
    p_user_id: ids.userId,
    p_role: role,
  })
  done(error, 'role')
}

/** HH-5 (MEM-2, MEM-4): remove a member. Their access ends on their next request. */
export async function removeMemberAction(formData: FormData) {
  const ids = readIds(formData)
  if (!isHouseholdSharingEnabled() || !ids) redirect(`/dashboard/settings${MEMBERS_HASH}`)

  const supabase = await signedInClient()
  const { error } = await supabase.rpc('remove_household_member', {
    p_household_id: ids.householdId,
    p_user_id: ids.userId,
  })
  done(error, 'removed')
}

/** HH-5 (MEM-2): hand the household to another member; the caller stays on as admin. */
export async function transferOwnershipAction(formData: FormData) {
  const ids = readIds(formData)
  if (!isHouseholdSharingEnabled() || !ids) redirect(`/dashboard/settings${MEMBERS_HASH}`)

  const supabase = await signedInClient()
  const { error } = await supabase.rpc('transfer_household_ownership', {
    p_household_id: ids.householdId,
    p_new_owner_id: ids.userId,
  })
  done(error, 'transferred')
}

/**
 * HH-5 (MEM-3): leave a household. The database moves the default household to
 * another membership or to none, so `/dashboard` lands in the next household
 * or in onboarding (MEM-7).
 */
export async function leaveHouseholdAction(formData: FormData) {
  const householdId = String(formData.get('household_id') ?? '')
  if (!isHouseholdSharingEnabled() || !UUID_PATTERN.test(householdId)) redirect(`/dashboard/settings${MEMBERS_HASH}`)

  const supabase = await signedInClient()
  const { error } = await supabase.rpc('leave_household', { p_household_id: householdId })
  revalidatePath('/', 'layout')
  if (error) redirect(`/dashboard/settings?memberError=${memberRefusal(error.message)}${MEMBERS_HASH}`)
  redirect('/dashboard')
}
