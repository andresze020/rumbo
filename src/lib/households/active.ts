/**
 * MEM-7: which household the app shows, from the profile's stored
 * `default_household_id` and the households the user is an ACTIVE member of.
 *
 * A stored id that is not one of them is stale — the user left or was removed,
 * or the row was edited by hand. It falls back to the first membership offered
 * (the list the app bar shows, in its order), or to none at all, which sends
 * the user to onboarding. No stored id is not stale: that is a user who has not
 * finished onboarding yet, and the pages already handle it.
 *
 * Pure, so it can be tested without a request; `getHouseholdContext` applies it.
 */
export function resolveActiveHousehold(
  storedId: string | null,
  households: readonly { id: string }[]
): { currentId: string | null; stale: boolean } {
  if (!storedId) return { currentId: null, stale: false }
  if (households.some((household) => household.id === storedId)) {
    return { currentId: storedId, stale: false }
  }
  return { currentId: households[0]?.id ?? null, stale: true }
}
