/**
 * HH-2 privacy scope (docs/features/household-sharing.md SCP-2, §7 HH-2).
 *
 * Which side of the household a read covers:
 *   household = shared rows only — the same numbers for every member;
 *   mine      = the caller's private rows only;
 *   all       = both (everything RLS lets the caller see).
 *
 * Called "privacy scope" in code because "scope" already names the
 * Transactions filter set (`af_tx_scope`, TRANSACTION_SCOPE_KEYS).
 *
 * RLS decides what is visible; a scope only narrows it, so no scope can
 * reveal another member's private row. Reporting RPCs take it as `p_scope`;
 * direct `.from()` reads apply it with the helpers below.
 */
export const PRIVACY_SCOPES = ['household', 'mine', 'all'] as const

export type PrivacyScope = (typeof PRIVACY_SCOPES)[number]

export function isPrivacyScope(value: unknown): value is PrivacyScope {
  return typeof value === 'string' && (PRIVACY_SCOPES as readonly string[]).includes(value)
}

/**
 * The scope a request reads when nothing else is chosen: everything for a
 * user who owns a private account in the household (open decision "default
 * scope: all"), household otherwise — for whom the two are the same rows, so
 * every screen renders exactly what it did before HH-2 (SCP-6).
 */
export function defaultPrivacyScope(ownsPrivateAccount: boolean): PrivacyScope {
  return ownsPrivateAccount ? 'all' : 'household'
}

/**
 * The scope a request reads (HH-3, SCP-1/5/6): the one the user last chose in
 * the app bar while they own a private account in the household, else the
 * default above. Without a private account there is no switch and no choice —
 * household, the same rows as everything for them.
 */
export function resolvePrivacyScope(
  ownsPrivateAccount: boolean,
  remembered: PrivacyScope | null
): PrivacyScope {
  if (!ownsPrivateAccount) return 'household'
  return remembered ?? defaultPrivacyScope(true)
}

// The query type parameters are unconstrained on purpose: checking a PostgREST
// builder (whose type parses the select string) against any method-shaped
// constraint exceeds the compiler's instantiation depth (TS2589). Callers pass
// a filter builder; its filters return the builder itself.
type OwnerFilterable = {
  is(column: string, value: null): unknown
  eq(column: string, value: string): unknown
}

/**
 * Narrow a direct read by a row's own `private_owner_id` — accounts, goals,
 * debts, recurring rules, installment plans, import batches, payees, and
 * entries / allocations (whose owner is derived from the account / the
 * transaction). `column` may name an embedded resource's column
 * (`'accounts.private_owner_id'`) when the embed is `!inner`.
 */
export function scopeByOwner<Q>(query: Q, scope: PrivacyScope, userId: string, column = 'private_owner_id'): Q {
  const builder = query as unknown as OwnerFilterable
  if (scope === 'household') return builder.is(column, null) as Q
  if (scope === 'mine') return builder.eq(column, userId) as Q
  return query
}

type TransactionFilterable = {
  neq(column: string, value: string): unknown
  eq(column: string, value: string): unknown
}

/**
 * Narrow a direct read of `transactions` the way the transaction list does: a
 * mixed transfer (a private and a shared leg) shows in every scope its viewer
 * may see — household keeps everything that is not fully private, mine keeps
 * what the caller owns any part of. `prefix` targets an `!inner` embed
 * (`'transactions.'`).
 */
export function scopeByTransaction<Q>(query: Q, scope: PrivacyScope, userId: string, prefix = ''): Q {
  const builder = query as unknown as TransactionFilterable
  if (scope === 'household') return builder.neq(`${prefix}visibility`, 'private') as Q
  if (scope === 'mine') return builder.eq(`${prefix}private_owner_id`, userId) as Q
  return query
}
