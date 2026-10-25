/**
 * Whether the next "Save & Add Next" draft needs the form's lists fetched again.
 *
 * Only when the entry just saved brought something the lists do not have yet:
 * an account or category created inline, a payee typed for the first time, a
 * tag created on the spot. Otherwise the lists in memory are already right,
 * and fetching them anyway was not free: Server Actions run one at a time, so
 * the background refresh sat in front of the *next* save — about 200 ms on
 * every quick batch entry (measured 2026-10-22).
 */

export type DraftLists = {
  accounts: readonly { id: string }[]
  categories: readonly { id: string }[]
  payees: readonly { name: string }[]
  tags: readonly { id: string }[]
}

export type NextDraftSeed = {
  accountId: string
  categoryId: string
  payeeName: string | null
  tagIds: readonly string[]
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

export function nextDraftNeedsFreshLists(lists: DraftLists | null, next: NextDraftSeed): boolean {
  if (!lists) return true
  if (!lists.accounts.some((account) => account.id === next.accountId)) return true
  if (!lists.categories.some((category) => category.id === next.categoryId)) return true
  const payee = next.payeeName?.trim()
  if (payee && !lists.payees.some((known) => sameName(known.name, payee))) return true
  return next.tagIds.some((id) => !lists.tags.some((tag) => tag.id === id))
}
