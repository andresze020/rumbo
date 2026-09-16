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
export const TRANSACTION_FORM_FIELDS = [
  'payee',
  'tags',
  'notes',
  'repeat',
  'status',
  'time',
] as const
export type TransactionFormField = (typeof TRANSACTION_FORM_FIELDS)[number]

/** BR-038 — which window /dashboard/transactions opens on. */
export const TRANSACTION_PERIODS = ['current_month', 'last_30_days', 'all_time'] as const
export type TransactionPeriod = (typeof TRANSACTION_PERIODS)[number]

/**
 * BR-046 — where the entry chain starts. `category_first` puts the category
 * directly under the amount, which is what makes the autofill below useful: the
 * category is the one field that predicts the rest of the entry.
 */
export const TRANSACTION_FIELD_ORDERS = ['category_first', 'account_first'] as const
export type TransactionFieldOrder = (typeof TRANSACTION_FIELD_ORDERS)[number]

/** BR-046 — fields the category autofill is allowed to seed. */
export const QUICK_ENTRY_AUTOFILL_FIELDS = ['account', 'payee', 'tags'] as const
export type QuickEntryAutofillField = (typeof QUICK_ENTRY_AUTOFILL_FIELDS)[number]

/** App-wide type scale. */
export const TEXT_SIZES = ['default', 'large', 'larger'] as const
export type TextSize = (typeof TEXT_SIZES)[number]

export type UiPreferences = {
  /**
   * How large the app's type is, applied as a root font size so every `rem` in
   * the UI follows it. The durable answer to "the numbers are too small":
   * unlike a pinch it survives a reload, and unlike a zoom it never pushes the
   * layout off the screen. Tailwind's breakpoints are `rem` against the
   * *initial* root size, not this one, so raising it scales the type without
   * moving the phone into a different breakpoint.
   */
  textSize: TextSize
  /**
   * Which optional form fields render. Every field that existed before BR-045
   * defaults to visible; `time` defaults to **hidden**, because it is a brand
   * new input and the whole point of BR-032 is that nobody grows a field they
   * never asked for.
   */
  formFields: Record<TransactionFormField, boolean>
  /**
   * BR-046 — how fast the add-transaction form is to fill in. Presentation
   * only, like everything else here: `autofill` seeds inputs the user can still
   * change before saving, it never writes anything the form would not have
   * submitted anyway.
   */
  quickEntry: {
    fieldOrder: TransactionFieldOrder
    /**
     * Master switch for "copy the last entry in this category". Off by default:
     * the form's long-standing rule is that it never arrives pre-filled with a
     * value nobody chose, and this only bends that rule *after* a deliberate
     * category pick — but bending it at all is the user's call, not ours.
     */
    autofillFromLastInCategory: boolean
    /** Which fields that autofill may seed, when it is on. */
    autofillFields: Record<QuickEntryAutofillField, boolean>
    /** Whether filling one field opens the next empty one on its own. */
    autoAdvance: boolean
  }
  transactions: {
    defaultPeriod: TransactionPeriod
    /** Accounts the list opens filtered to. Empty means every account. */
    defaultAccountIds: string[]
    compactList: boolean
    /** BR-017 balance adjustments are shown by default. */
    showBalanceAdjustments: boolean
  }
}

export const DEFAULT_UI_PREFERENCES: UiPreferences = {
  textSize: 'default',
  formFields: {
    payee: true,
    tags: true,
    notes: true,
    repeat: true,
    status: true,
    // BR-045: opt-in. A household that never records times should not have to
    // turn a new field off.
    time: false,
  },
  quickEntry: {
    fieldOrder: 'category_first',
    // Opt-in. See the field's doc comment: an unasked-for pre-fill is the exact
    // failure this form was built to avoid.
    autofillFromLastInCategory: false,
    // What the master switch turns on when it is flipped. Narrowing this is for
    // the household that wants, say, the account back but not the tags.
    autofillFields: { account: true, payee: true, tags: true },
    autoAdvance: true,
  },
  transactions: {
    defaultPeriod: 'current_month',
    defaultAccountIds: [],
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

export function isTransactionFieldOrder(value: unknown): value is TransactionFieldOrder {
  return TRANSACTION_FIELD_ORDERS.includes(value as TransactionFieldOrder)
}

export function isTextSize(value: unknown): value is TextSize {
  return TEXT_SIZES.includes(value as TextSize)
}

export function parseUiPreferences(raw: unknown): UiPreferences {
  const root = asRecord(raw)
  const formFields = asRecord(root.formFields)
  const quickEntry = asRecord(root.quickEntry)
  const quickEntryFields = asRecord(quickEntry.autofillFields)
  const transactions = asRecord(root.transactions)

  const period = transactions.defaultPeriod
  // Tolerate the single-id shape this preference shipped with before it became
  // a list, so an already-saved value is not silently dropped.
  const rawAccountIds = Array.isArray(transactions.defaultAccountIds)
    ? transactions.defaultAccountIds
    : [transactions.defaultAccountId]

  return {
    textSize: isTextSize(root.textSize) ? root.textSize : DEFAULT_UI_PREFERENCES.textSize,
    formFields: Object.fromEntries(
      TRANSACTION_FORM_FIELDS.map((field) => [
        field,
        asBoolean(formFields[field], DEFAULT_UI_PREFERENCES.formFields[field]),
      ])
    ) as Record<TransactionFormField, boolean>,
    quickEntry: {
      fieldOrder: isTransactionFieldOrder(quickEntry.fieldOrder)
        ? quickEntry.fieldOrder
        : DEFAULT_UI_PREFERENCES.quickEntry.fieldOrder,
      autofillFromLastInCategory: asBoolean(
        quickEntry.autofillFromLastInCategory,
        DEFAULT_UI_PREFERENCES.quickEntry.autofillFromLastInCategory
      ),
      autofillFields: Object.fromEntries(
        QUICK_ENTRY_AUTOFILL_FIELDS.map((field) => [
          field,
          asBoolean(
            quickEntryFields[field],
            DEFAULT_UI_PREFERENCES.quickEntry.autofillFields[field]
          ),
        ])
      ) as Record<QuickEntryAutofillField, boolean>,
      autoAdvance: asBoolean(
        quickEntry.autoAdvance,
        DEFAULT_UI_PREFERENCES.quickEntry.autoAdvance
      ),
    },
    transactions: {
      defaultPeriod: isTransactionPeriod(period)
        ? period
        : DEFAULT_UI_PREFERENCES.transactions.defaultPeriod,
      defaultAccountIds: [
        ...new Set(
          rawAccountIds.filter(
            (id): id is string => typeof id === 'string' && id.length > 0
          )
        ),
      ],
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
    preferences.transactions.defaultAccountIds.length === 0
  )
}
