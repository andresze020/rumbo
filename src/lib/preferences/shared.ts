/**
 * Per-user interface preferences (BR-032 + BR-038).
 *
 * Stored as one `jsonb` object on `profiles.ui_preferences`. Everything here is
 * presentation-only: no preference may ever change a stored amount, a total, or
 * what the ledger contains — only what is rendered and what a bare URL defaults
 * to. Parsing is deliberately forgiving so an older or hand-edited object still
 * loads: any missing or malformed key falls back to the default, and the
 * defaults reproduce the app's behaviour before these tickets.
 */

/** BR-032 — optional fields the add-transaction form can hide. */
export const TRANSACTION_FORM_FIELDS = ['payee', 'tags', 'notes', 'repeat', 'status'] as const
export type TransactionFormField = (typeof TRANSACTION_FORM_FIELDS)[number]

/** BR-038 — which window /dashboard/transactions opens on. */
export const TRANSACTION_PERIODS = ['current_month', 'last_30_days', 'all_time'] as const
export type TransactionPeriod = (typeof TRANSACTION_PERIODS)[number]

export type UiPreferences = {
  /** Which optional form fields render. Every field defaults to visible. */
  formFields: Record<TransactionFormField, boolean>
  transactions: {
    defaultPeriod: TransactionPeriod
    /** Account the list opens filtered to, or null for every account. */
    defaultAccountId: string | null
    compactList: boolean
    /** BR-017 balance adjustments are shown by default. */
    showBalanceAdjustments: boolean
  }
}

export const DEFAULT_UI_PREFERENCES: UiPreferences = {
  formFields: {
    payee: true,
    tags: true,
    notes: true,
    repeat: true,
    status: true,
  },
  transactions: {
    defaultPeriod: 'current_month',
    defaultAccountId: null,
    compactList: false,
    showBalanceAdjustments: true,
  },
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function asBoolean(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback
}

export function isTransactionPeriod(value: unknown): value is TransactionPeriod {
  return TRANSACTION_PERIODS.includes(value as TransactionPeriod)
}

export function parseUiPreferences(raw: unknown): UiPreferences {
  const root = asRecord(raw)
  const formFields = asRecord(root.formFields)
  const transactions = asRecord(root.transactions)

  const defaultAccountId = transactions.defaultAccountId
  const period = transactions.defaultPeriod

  return {
    formFields: Object.fromEntries(
      TRANSACTION_FORM_FIELDS.map((field) => [
        field,
        asBoolean(formFields[field], DEFAULT_UI_PREFERENCES.formFields[field]),
      ])
    ) as Record<TransactionFormField, boolean>,
    transactions: {
      defaultPeriod: isTransactionPeriod(period)
        ? period
        : DEFAULT_UI_PREFERENCES.transactions.defaultPeriod,
      defaultAccountId:
        typeof defaultAccountId === 'string' && defaultAccountId
          ? defaultAccountId
          : null,
      compactList: asBoolean(
        transactions.compactList,
        DEFAULT_UI_PREFERENCES.transactions.compactList
      ),
      showBalanceAdjustments: asBoolean(
        transactions.showBalanceAdjustments,
        DEFAULT_UI_PREFERENCES.transactions.showBalanceAdjustments
      ),
    },
  }
}

/**
 * True when the transaction-list preferences match the built-in defaults —
 * i.e. a bare `/dashboard/transactions` URL needs no redirect to apply them.
 */
export function hasDefaultTransactionScope(preferences: UiPreferences) {
  return (
    preferences.transactions.defaultPeriod ===
      DEFAULT_UI_PREFERENCES.transactions.defaultPeriod &&
    preferences.transactions.defaultAccountId === null
  )
}
