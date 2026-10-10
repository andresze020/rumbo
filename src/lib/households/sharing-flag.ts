import 'server-only'

/**
 * HH-4: household sharing (invitations) is off unless RUMBO_HOUSEHOLD_SHARING
 * is "1" or "true". One variable turns the whole invite flow off: Settings
 * hides it, the invite page answers like a dead link, and the actions refuse.
 * The database functions stay; with the flag off nothing in the app calls them.
 */
export function isHouseholdSharingEnabled(): boolean {
  const value = process.env.RUMBO_HOUSEHOLD_SHARING?.trim().toLowerCase()
  return value === '1' || value === 'true'
}
