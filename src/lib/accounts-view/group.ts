import { formatLabel } from '@/lib/format'

/**
 * Groups account-like rows by their account type, preserving the incoming order
 * as the single source of truth: rows are expected to arrive already sorted by
 * `sort_order`, so a group's position is decided by the first row of that type
 * that appears. This keeps the global sort order driving both row order (within
 * a group) and group order, so drag-and-drop on the accounts page stays the only
 * thing that needs to write `sort_order`.
 *
 * `subtotalBase` is summed in the household base currency — groups can hold mixed
 * account currencies, so a single account-currency subtotal would be meaningless.
 */
export type AccountGroupResult<T> = {
  type: string
  label: string
  count: number
  subtotalBase: number
  rows: T[]
}

export function groupAccountsByType<T>(
  rows: T[],
  options: {
    getType: (row: T) => string
    getBaseAmount: (row: T) => number
  }
): AccountGroupResult<T>[] {
  const { getType, getBaseAmount } = options
  const groups: AccountGroupResult<T>[] = []
  const byType = new Map<string, AccountGroupResult<T>>()

  for (const row of rows) {
    const type = getType(row)
    let group = byType.get(type)

    if (!group) {
      group = {
        type,
        label: formatLabel(type),
        count: 0,
        subtotalBase: 0,
        rows: [],
      }
      byType.set(type, group)
      groups.push(group)
    }

    group.rows.push(row)
    group.count += 1
    group.subtotalBase += getBaseAmount(row)
  }

  return groups
}
