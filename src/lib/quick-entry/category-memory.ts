import type { createClient } from '@/lib/supabase/server'

/**
 * BR-046 — "the last time I spent on Groceries, what did the rest of the entry
 * look like?"
 *
 * One entry per category, holding the account, payee and tags of the most
 * recent income/expense that touched it. The add-transaction form uses it to
 * seed those three fields the moment a category is picked, so the common case
 * (the same shop, the same card, the same tags, week after week) is amount +
 * category + Save.
 *
 * This is a *suggestion*, never a decision: the form only applies it to fields
 * the user has not filled in yet, every seeded value stays editable, and the
 * whole thing is off until the user turns it on in Settings. It carries no
 * amount and no date, so nothing here can influence what the ledger stores.
 */
export type CategoryEntryMemory = Record<
  string,
  {
    accountId: string | null
    payeeName: string | null
    tagIds: string[]
    /**
     * The descriptions most recently used in this category, newest first and
     * de-duplicated. Offered as one-tap chips rather than filled in: unlike the
     * account or the payee, a description is genuinely different most times, so
     * guessing one is wrong more often than right — but *showing* the last few
     * beats hunting for the browser's own cached-input strip.
     */
    descriptions: string[]
  }
>

/**
 * How far back to look. The map only needs to cover the categories somebody
 * actually enters by hand, and those repeat constantly — a few hundred rows
 * reaches months back for a normal household while keeping this one bounded
 * query instead of one per category.
 */
const LOOKBACK_TRANSACTIONS = 400

/** How many past descriptions to offer per category. */
const MAX_DESCRIPTIONS = 3

type MemoryRow = {
  description: string | null
  payees: { name: string } | { name: string }[] | null
  transaction_allocations: { category_id: string }[] | null
  transaction_entries: { account_id: string }[] | null
  transaction_tags: { tag_id: string }[] | null
}

function payeeName(payees: MemoryRow['payees']) {
  if (!payees) return null
  const row = Array.isArray(payees) ? payees[0] : payees
  return row?.name ?? null
}

/**
 * Reduce the household's recent ledger into one row per category.
 *
 * Rows arrive newest-first and the reducer keeps the *first* it sees for a
 * category, so later (older) rows never overwrite a fresher memory.
 *
 * Deliberately tolerant of the shapes a transaction can take:
 * - A split (several allocations) teaches every category it touched — the
 *   account and payee were the same for all of them.
 * - A transaction with anything other than exactly one entry leaves the
 *   account blank rather than guessing which of them to remember.
 * Transfers are excluded outright: they carry no reporting allocation, so they
 * have no category to be remembered under.
 */
export async function loadCategoryEntryMemory(
  supabase: Awaited<ReturnType<typeof createClient>>,
  householdId: string
): Promise<CategoryEntryMemory> {
  const { data, error } = await supabase
    .from('transactions')
    .select(
      `description,
       payees(name),
       transaction_allocations(category_id),
       transaction_entries(account_id),
       transaction_tags(tag_id)`
    )
    .eq('household_id', householdId)
    .in('transaction_type', ['income', 'expense'])
    .in('status', ['posted', 'pending'])
    .is('deleted_at', null)
    .is('voided_at', null)
    .order('transaction_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(LOOKBACK_TRANSACTIONS)

  if (error || !data) return {}

  const memory: CategoryEntryMemory = {}

  for (const row of data as unknown as MemoryRow[]) {
    const categories = row.transaction_allocations ?? []
    if (categories.length === 0) continue

    const entries = row.transaction_entries ?? []
    const accountId = entries.length === 1 ? entries[0].account_id : null
    const name = payeeName(row.payees)
    const tagIds = (row.transaction_tags ?? []).map((tag) => tag.tag_id)

    const description = row.description?.trim() || null

    for (const { category_id: categoryId } of categories) {
      if (!categoryId) continue
      // The first row wins for account / payee / tags — rows arrive newest
      // first, so that is the most recent entry. Descriptions keep collecting
      // past it, since the point is to offer a few to choose between.
      const entry = (memory[categoryId] ??= {
        accountId,
        payeeName: name,
        tagIds,
        descriptions: [],
      })
      if (
        description &&
        entry.descriptions.length < MAX_DESCRIPTIONS &&
        !entry.descriptions.includes(description)
      ) {
        entry.descriptions.push(description)
      }
    }
  }

  return memory
}
