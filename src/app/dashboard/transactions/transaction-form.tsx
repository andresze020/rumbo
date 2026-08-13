'use client'

import Link from 'next/link'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { Popover } from '@base-ui/react/popover'
import {
  ArrowDown,
  ArrowDownRight,
  ArrowLeftRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  FileText,
  ListChecks,
  Plus,
  Repeat,
  Shapes,
  Store,
  StickyNote,
  Wallet,
} from 'lucide-react'
import {
  createManualTransactionAction,
  createTransferTransactionAction,
} from './actions'
import { PayeePicker, type PayeeOption } from './payee-picker'
import { RelativeDateChips } from './relative-date-chips'
import { SelectorSheet } from './selector-sheet'
import { TagMultiSelect, type TagOption } from '@/components/tag-multi-select'
import { quickCreateAccount, quickCreateCategory } from '../quick-create-actions'
import { AdvancedFields } from '@/components/advanced-fields'
import { AmountInput } from '@/components/amount-input'
import {
  DateField,
  SegmentedField,
  SelectField,
  TimeField,
  nativeSelectCls,
} from '@/components/form-field'
import { InfoTooltip } from '@/components/info-tooltip'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { SubmitButton } from '@/components/submit-button'
import { roundToCents } from '@/lib/calc'
import { fetchFxRate } from '@/lib/fx'
import { currentTimeLocal, formatCurrency } from '@/lib/format'
import { useLanguage } from '@/components/language-provider'
import { RECURRING_FREQUENCIES } from '@/lib/recurring/shared'
import { localizeSystemCategoryName } from '@/lib/i18n/system-category-names'
import { useUiTranslation } from '@/lib/i18n/use-ui-translation'
import type { TransactionFormField } from '@/lib/preferences/shared'
import { cn } from '@/lib/utils'

type TransactionType = 'income' | 'expense' | 'transfer'

/** Which selector surface is open (mobile sheet or desktop popover). */
type PickerField = null | 'account' | 'from' | 'to' | 'category' | 'payee'

/**
 * Where the fill-fast chain goes next. `description` is not a picker — it ends
 * the chain by taking focus, since there is nothing left to choose from a list.
 */
type AdvanceTarget = PickerField | 'description'

export type TransactionFormAccount = {
  id: string
  name: string
  currency_code: string
  institution_name: string | null
  account_type?: string
  icon?: string | null
  color?: string | null
}

export type TransactionFormCategory = {
  id: string
  name: string
  category_type: string
  reporting_type: string
  parent_category_id: string | null
  icon?: string | null
  color?: string | null
  is_system?: boolean
}

type TransactionFormProps = {
  accounts: TransactionFormAccount[]
  baseCurrency: string
  cancelHref?: string
  onCancel?: () => void
  categories: TransactionFormCategory[]
  payees: PayeeOption[]
  /** Active household tags for the tag multi-select (income/expense only). */
  tags?: TagOption[]
  /** Active currency codes for the inline "create account" form. */
  currencies?: string[]
  defaultDate: string
  defaultAccountId?: string
  defaultType?: TransactionType
  defaultStatus?: string
  defaultAmount?: string
  defaultCategoryId?: string
  defaultDescription?: string
  defaultMerchantName?: string
  /** BR-034: remaining fields a "Copy" seeds. */
  defaultToAmount?: string
  defaultNotes?: string
  defaultTagIds?: string[]
  defaultFromAccountId?: string
  defaultToAccountId?: string
  /**
   * BR-032: which optional fields to render. Omitted means all of them, which
   * is both the default preference and the right answer for callers that have
   * no user preference in hand (e.g. the AI assistant's draft review).
   */
  visibleFields?: Partial<Record<TransactionFormField, boolean>>
  returnTo?: string
}

const CATEGORY_USAGE_KEY = 'af_category_usage'

// Only the account name is shown: the currency already appears above the amount,
// and users typically name accounts after their bank, so the institution and
// currency are redundant here — and long "name · bank · CUR" strings overflow
// the picker row on mobile.
function formatAccountLabel(account: TransactionFormAccount) {
  return account.icon ? `${account.icon} ${account.name}` : account.name
}

// Search still matches on the fuller text (name + institution + currency) even
// though only the name is displayed.
function accountSearchText(account: TransactionFormAccount) {
  return [account.name, account.institution_name || null, account.currency_code]
    .filter(Boolean)
    .join(' · ')
}

/**
 * The option text already carries the account's emoji, so render the generic
 * wallet glyph only when there is no emoji — otherwise it would show twice.
 */
function accountLeading(account: TransactionFormAccount | undefined) {
  return account?.icon ? null : <Wallet className="size-4.5" />
}

/**
 * True on phone-width viewports. Drives the mobile "row list" layout (each field
 * is a compact tap-to-expand row) vs the desktop two-column grid. Starts false
 * so SSR/first paint is deterministic, then resolves on mount.
 */
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)')
    const onChange = () => setIsMobile(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return isMobile
}

export function TransactionForm({
  accounts,
  baseCurrency,
  cancelHref,
  onCancel,
  categories,
  payees,
  tags = [],
  currencies,
  defaultDate,
  defaultAccountId,
  defaultType,
  defaultStatus,
  defaultAmount,
  defaultCategoryId,
  defaultDescription,
  defaultMerchantName,
  defaultToAmount,
  defaultNotes,
  defaultTagIds,
  defaultFromAccountId,
  defaultToAccountId,
  visibleFields,
  returnTo,
}: TransactionFormProps) {
  const { t, locale } = useLanguage()
  const ui = useUiTranslation()
  // BR-032: a field is shown unless the user has explicitly turned it off.
  // A hidden field is not rendered at all, so it submits nothing and the server
  // action falls back to its own default (e.g. status → posted).
  const showField = (field: TransactionFormField) => visibleFields?.[field] !== false
  const categoryName = (category: TransactionFormCategory) =>
    localizeSystemCategoryName(category.name, Boolean(category.is_system), locale)
  const [transactionType, setTransactionType] = useState<TransactionType>(defaultType ?? 'expense')
  const [transactionDate, setTransactionDate] = useState(defaultDate)
  // BR-045: optional time of day. Seeded from the *viewer's* clock — same
  // reasoning as RelativeDateChips' `useState(() => todayIsoDateLocal())`, and
  // the same precedent for reading local time in an initializer. Only submitted
  // when the field is visible (it is off by default), so a household that does
  // not record times never writes one.
  const [transactionTime, setTransactionTime] = useState(() => currentTimeLocal())
  const [accountId, setAccountId] = useState(defaultAccountId ?? '')
  const [fromAccountId, setFromAccountId] = useState(defaultFromAccountId ?? '')
  const [toAccountId, setToAccountId] = useState(defaultToAccountId ?? '')
  const [categoryId, setCategoryId] = useState(defaultCategoryId ?? '')
  const [amountInput, setAmountInput] = useState(defaultAmount ?? '')
  // BR-007: destination amount for a cross-currency transfer (to-account currency).
  const [toAmountInput, setToAmountInput] = useState(defaultToAmount ?? '')
  // Unified transfer cost (FX spread + fee), in base currency, + its category.
  const [costInput, setCostInput] = useState('')
  const [costTouched, setCostTouched] = useState(false)
  const [costCategoryId, setCostCategoryId] = useState('')
  // Each cross-currency leg's market rate to base (1 for base), for the estimate.
  const [fromRateToBase, setFromRateToBase] = useState<number | null>(null)
  const [toRateToBase, setToRateToBase] = useState<number | null>(null)
  const [status, setStatus] = useState(defaultStatus ?? 'posted')
  // Secondary fields (notes) collapse behind a "More details" toggle on the
  // desktop grid; on mobile the row layout replaces this entirely.
  const [showMoreDetails, setShowMoreDetails] = useState(false)
  const [recurringFrequency, setRecurringFrequency] = useState('')
  // Controlled copies of the free-text fields so the mobile row layout can show
  // the current value inside each collapsed row. On desktop these controls stay
  // uncontrolled (defaultValue), so this state only matters on mobile.
  const [description, setDescription] = useState(defaultDescription ?? '')
  const [payeeName, setPayeeName] = useState(defaultMerchantName ?? '')
  const [notes, setNotes] = useState(defaultNotes ?? '')
  // Which mobile row is expanded for editing (accordion; null = all collapsed).
  const [expandedField, setExpandedField] = useState<string | null>(null)
  const isMobile = useIsMobile()

  // Accounts/categories created inline from the mobile pickers, merged into the
  // prop lists so they show up and can be selected without a page reload.
  const [createdCategories, setCreatedCategories] = useState<TransactionFormCategory[]>([])
  const [createdAccounts, setCreatedAccounts] = useState<TransactionFormAccount[]>([])
  const availableAccounts = useMemo(
    () => [...accounts, ...createdAccounts],
    [accounts, createdAccounts]
  )
  const availableCategories = useMemo(
    () => [...categories, ...createdCategories],
    [categories, createdCategories]
  )
  // Which selector the mobile full-screen sheet is showing (null = closed).
  // Distinct from `expandedField` (the inline accordion used by the remaining
  // mobile rows and, on desktop, by the Popover combobox).
  const [sheetField, setSheetField] = useState<PickerField>(null)
  // Category picker: search text + which parent we've drilled into (null = show
  // the parent list; a parent id = show only that parent's subcategories).
  const [categorySearch, setCategorySearch] = useState('')
  const [categoryDrillParentId, setCategoryDrillParentId] = useState<string | null>(null)
  // Search text inside a drilled-in parent's subcategory list.
  const [subcategorySearch, setSubcategorySearch] = useState('')
  const [creatingCategory, setCreatingCategory] = useState(false)
  // Account picker: search text + whether the inline "create account" sub-view
  // is showing (reveals the extra fields only when needed, keeping it lean).
  const [accountSearch, setAccountSearch] = useState('')
  const [showAccountCreate, setShowAccountCreate] = useState(false)
  const [newAccountName, setNewAccountName] = useState('')
  const [newAccountType, setNewAccountType] = useState('cash')
  const [newAccountCurrency, setNewAccountCurrency] = useState('')
  const [creatingAccount, setCreatingAccount] = useState(false)
  const [createError, setCreateError] = useState('')

  // When a mobile row expands, focus its control so choosing a value is a single
  // tap: text fields get the keyboard, the date field opens its native picker.
  // Rows backed by an inline option list have no text input, so this is a no-op
  // for them (they already show the list on expand).
  useEffect(() => {
    if (!expandedField) return
    const panel = document.querySelector(`[data-field-panel="${expandedField}"]`)
    const el = panel?.querySelector('input:not([type="hidden"]), textarea') as
      | HTMLInputElement
      | HTMLTextAreaElement
      | null
    if (!el) return
    el.focus()
    if (el instanceof HTMLInputElement && el.type === 'date') {
      try {
        el.showPicker?.()
      } catch {
        // showPicker() can throw outside a user gesture; focus already happened.
      }
    }
  }, [expandedField])
  const [userRate, setUserRate] = useState('')
  const [fetchingRate, setFetchingRate] = useState(false)
  const [fxNote, setFxNote] = useState('')
  const [fxError, setFxError] = useState('')

  // The form deliberately does NOT restore the last account or category it was
  // submitted with. Silently pre-filling both meant a blank new transaction
  // arrived already pointing at an account and a category the user had not
  // chosen — easy to save by accident, and wrong more often than right. Account
  // and category are only pre-filled from real context the caller passes in
  // (`defaultAccountId` / `defaultCategoryId`): a copy, an add-next, or the
  // transactions list narrowed to one account. Recent categories are still
  // *offered* as one-tap chips, which suggests without deciding.

  const selectedAccount = availableAccounts.find((a) => a.id === accountId)
  const isMultiCurrency = Boolean(
    selectedAccount && selectedAccount.currency_code !== baseCurrency
  )
  const parsedRate = Number(userRate)
  const rateIsValid =
    userRate.trim() !== '' && Number.isFinite(parsedRate) && parsedRate > 0
  const exchangeRateToBase = rateIsValid ? String(1 / parsedRate) : ''
  const parsedAmount = Number(amountInput)
  const amountIsValid =
    amountInput.trim() !== '' && Number.isFinite(parsedAmount) && parsedAmount !== 0

  function conversionPreview(foreignCurrency: string | undefined) {
    if (!foreignCurrency || !rateIsValid || !amountIsValid) return null
    return `${formatCurrency(parsedAmount, foreignCurrency)} ≈ ${formatCurrency(parsedAmount / parsedRate, baseCurrency)}`
  }

  // BR-031 — on an expense or income the amount has exactly one real value: the
  // one in the account's own currency. The base-currency figure is derived from
  // the rate, never entered, so it belongs here as a line of text rather than as
  // a second input. (An editable base field shipped first and was wrong: nobody
  // records a COP purchase by typing CAD.) The two-real-amounts case is the
  // transfer, and it is handled by the transfer card further down.
  const baseEquivalent =
    isMultiCurrency && rateIsValid && amountIsValid
      ? formatCurrency(roundToCents(parsedAmount / parsedRate), baseCurrency, locale)
      : null

  const compatibleCategories = useMemo(
    () =>
      availableCategories.filter(
        (c) => transactionType !== 'transfer' && c.category_type === transactionType
      ),
    [availableCategories, transactionType]
  )

  // Most-used categories (for the current type) as one-tap chips.
  const [frequentCategories, setFrequentCategories] = useState<TransactionFormCategory[]>([])
  useEffect(() => {
    if (typeof window === 'undefined') return
    const frame = window.requestAnimationFrame(() => {
      if (compatibleCategories.length < 2) {
        setFrequentCategories([])
        return
      }
      try {
        const raw = window.localStorage.getItem(CATEGORY_USAGE_KEY)
        const usage: Record<string, number> = raw ? JSON.parse(raw) : {}
        const ranked = compatibleCategories
          .filter((c) => usage[c.id] > 0)
          .sort((a, b) => (usage[b.id] ?? 0) - (usage[a.id] ?? 0))
          .slice(0, 4)
        setFrequentCategories(ranked)
      } catch {
        setFrequentCategories([])
      }
    })

    return () => window.cancelAnimationFrame(frame)
  }, [compatibleCategories])
  const isTransfer = transactionType === 'transfer'
  const selectedFromAccount = availableAccounts.find((a) => a.id === fromAccountId)
  const selectedToAccount = availableAccounts.find((a) => a.id === toAccountId)
  const amountCurrencyCode =
    (isTransfer ? selectedFromAccount?.currency_code : selectedAccount?.currency_code) ??
    baseCurrency
  const isCrossCurrencyTransfer =
    Boolean(selectedFromAccount && selectedToAccount) &&
    selectedFromAccount?.currency_code !== selectedToAccount?.currency_code
  // A rate to base is only required when NEITHER transfer leg is the base
  // currency (incl. same-currency non-base, preserving the BF-020 fix). When one
  // leg is base, the RPC derives both legs' rates from the two amounts.
  const needsFromRate =
    isTransfer &&
    Boolean(selectedFromAccount) &&
    selectedFromAccount?.currency_code !== baseCurrency &&
    (!selectedToAccount || selectedToAccount.currency_code !== baseCurrency)
  const parsedToAmount = Number(toAmountInput)
  const toAmountValid =
    toAmountInput.trim() !== '' &&
    Number.isFinite(parsedToAmount) &&
    parsedToAmount > 0
  // Unified transfer cost (FX spread + fee) suggested from market rates: what
  // you sent minus what you received, both in base currency. 0 when it can't be
  // estimated or you came out ahead.
  const suggestedCost =
    isCrossCurrencyTransfer &&
    amountIsValid &&
    toAmountValid &&
    fromRateToBase != null &&
    toRateToBase != null
      ? Math.max(0, Math.abs(parsedAmount) * fromRateToBase - parsedToAmount * toRateToBase)
      : null
  const costValue =
    costTouched || suggestedCost == null ? costInput : suggestedCost.toFixed(2)
  const parsedCost = Number(costValue)
  const costIsPositive = Number.isFinite(parsedCost) && parsedCost > 0
  // The cost can't exceed what you sent (you can't lose more than you moved).
  const sentBaseValue =
    fromRateToBase != null && amountIsValid
      ? Math.abs(parsedAmount) * fromRateToBase
      : null
  const costExceedsSent =
    costIsPositive && sentBaseValue != null && parsedCost > sentBaseValue + 0.01
  // Soft advisory: the entered cost is far from what market rates suggest.
  const costLooksOff =
    costTouched &&
    costIsPositive &&
    !costExceedsSent &&
    suggestedCost != null &&
    Math.abs(parsedCost - suggestedCost) > Math.max(1, suggestedCost * 0.2)
  // Active expense categories (path-labelled) for the transfer-cost picker.
  const expenseCategoryOptions = availableCategories
    .filter((c) => c.category_type === 'expense')
    .map((c) => {
      const parent = c.parent_category_id
        ? availableCategories.find((p) => p.id === c.parent_category_id)
        : null
      const name = parent
        ? `${categoryName(parent)} / ${categoryName(c)}`
        : categoryName(c)
      return { id: c.id, label: c.icon ? `${c.icon} ${name}` : name }
    })
  // Default the cost category to a fee-like expense category if one exists;
  // otherwise leave it unpicked (never silently file FX cost under, say, "Rent").
  const defaultCostCategoryId =
    expenseCategoryOptions.find((c) =>
      /fee|comis|charg|bank|banc|cargo|surcharg/i.test(c.label)
    )?.id ?? ''
  const effectiveCostCategoryId = costCategoryId || defaultCostCategoryId
  const submitAction = isTransfer
    ? createTransferTransactionAction
    : createManualTransactionAction
  const canSubmit = isTransfer
    ? availableAccounts.length >= 2 &&
      Boolean(fromAccountId) &&
      Boolean(toAccountId) &&
      (!isCrossCurrencyTransfer || toAmountValid) &&
      (!needsFromRate || rateIsValid) &&
      (!isTransfer || !costIsPositive || Boolean(effectiveCostCategoryId)) &&
      (!isCrossCurrencyTransfer || !costExceedsSent)
    : compatibleCategories.length > 0 &&
      Boolean(categoryId) &&
      (!isMultiCurrency || rateIsValid)

  useEffect(() => {
    if (!isMultiCurrency || !selectedAccount || !transactionDate) return
    void autoFetch(selectedAccount.currency_code, transactionDate)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, transactionDate])

  useEffect(() => {
    if (!needsFromRate || !selectedFromAccount || !transactionDate) return
    void autoFetch(selectedFromAccount.currency_code, transactionDate)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromAccountId, transactionDate])

  // Fetch each cross-currency leg's market rate to base to suggest the cost.
  useEffect(() => {
    if (!isCrossCurrencyTransfer || !selectedFromAccount || !selectedToAccount || !transactionDate) {
      return
    }
    let cancelled = false
    const rateToBase = async (currency: string) => {
      if (currency === baseCurrency) return 1
      const r = await fetchFxRate(baseCurrency, currency, transactionDate)
      return r.rate && r.rate > 0 ? 1 / r.rate : null
    }
    void Promise.all([
      rateToBase(selectedFromAccount.currency_code),
      rateToBase(selectedToAccount.currency_code),
    ]).then(([fr, tr]) => {
      if (cancelled) return
      setFromRateToBase(fr)
      setToRateToBase(tr)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromAccountId, toAccountId, transactionDate])

  async function autoFetch(accountCurrency: string, date: string) {
    setFetchingRate(true)
    setFxNote('')
    setFxError('')
    const result = await fetchFxRate(baseCurrency, accountCurrency, date)
    setFetchingRate(false)
    if (result.rate !== null) {
      setUserRate(String(parseFloat(result.rate.toFixed(6))))
      if (result.isLatest) {
        setFxNote(
          `No rate available for future dates — using latest market rate (${result.date}).`
        )
      } else {
        setFxNote(`Rate for ${result.date}.`)
      }
    } else {
      setFxError(result.error)
    }
  }

  /**
   * Counts category use so the "Frequently used" chips can rank. Only the
   * counter is kept — the last account and last category are deliberately not
   * remembered, because restoring them pre-filled a blank form (see above).
   */
  function rememberCategoryUsage() {
    if (typeof window === 'undefined' || isTransfer || !categoryId) return
    try {
      const raw = window.localStorage.getItem(CATEGORY_USAGE_KEY)
      const usage: Record<string, number> = raw ? JSON.parse(raw) : {}
      usage[categoryId] = (usage[categoryId] ?? 0) + 1
      window.localStorage.setItem(CATEGORY_USAGE_KEY, JSON.stringify(usage))
    } catch {
      // Ignore malformed usage data; chips simply won't update this time.
    }
  }

  function handleTransactionTypeChange(value: TransactionType) {
    setTransactionType(value)
    if (value === 'transfer') {
      // Carry current account over as the transfer source
      setFromAccountId(accountId)
    }
    setToAccountId('')
    setCategoryId('')
    setUserRate('')
    setFxNote('')
    setFxError('')
  }

  const typeOptions = [
    {
      value: 'expense' as const,
      label: t('transactionForm.typeExpense'),
      Icon: ArrowDownRight,
      activeCls: 'text-rose-600 dark:text-rose-400',
    },
    {
      value: 'income' as const,
      label: t('transactionForm.typeIncome'),
      Icon: ArrowUpRight,
      activeCls: 'text-emerald-600 dark:text-emerald-400',
    },
    {
      value: 'transfer' as const,
      label: t('transactionForm.typeTransfer'),
      Icon: ArrowLeftRight,
      activeCls: 'text-sky-600 dark:text-sky-400',
    },
  ]

  // Picking a date invalidates any rate fetched for the previous one.
  function changeTransactionDate(next: string) {
    setTransactionDate(next)
    if (isMultiCurrency) {
      setUserRate('')
      setFxNote('')
      setFxError('')
    }
  }

  // BR-033: relative-date chips. Rendered above the date control on desktop and
  // above the date *row* on mobile — the mobile row auto-opens the native
  // calendar when it expands, which would cover chips placed inside the panel.
  const dateChips = (
    <RelativeDateChips value={transactionDate} onSelect={changeTransactionDate} />
  )

  // Shared date field — placed inside each essentials grid below so it pairs
  // with the account selector on the same row.
  const dateField = (
    <DateField
      id="transaction_date"
      name="transaction_date"
      label={t('transactionForm.date')}
      value={transactionDate}
      onChange={(e) => changeTransactionDate(e.target.value)}
      required
    />
  )

  // BR-045: time of day, opt-in via preferences. Clearing it is meaningful —
  // an empty value submits nothing and the transaction stays untimed.
  const timeField = showField('time') ? (
    <TimeField
      id="transaction_time"
      name="transaction_time"
      label={t('transactionForm.time')}
      value={transactionTime}
      onChange={(e) => setTransactionTime(e.target.value)}
    />
  ) : null

  // Shared status segmented control, paired with another compact field in the
  // essentials grid. When the user has hidden it (BR-032) the value still has
  // to reach the server action, which requires a status — so the control is
  // replaced by a hidden input carrying the default rather than dropped.
  const statusField = showField('status') ? (
    <SegmentedField
      label={t('transactionForm.status')}
      name="status"
      value={status}
      onChange={setStatus}
      size="sm"
      options={[
        { value: 'posted', label: t('transactionForm.statusPosted') },
        { value: 'pending', label: t('transactionForm.statusPending') },
      ]}
    />
  ) : (
    <input type="hidden" name="status" value={status} />
  )

  // Exchange-rate block, shared by the transfer and single-account paths. Stays
  // outside the "More details" collapse because the rate is required to submit a
  // non-base-currency entry, so it must always be visible.
  function fxFields(account: TransactionFormAccount | undefined, defaultOpen = true) {
    if (!account) return null
    return (
      <AdvancedFields
        defaultOpen={defaultOpen}
        summary={
          rateIsValid
            ? `Exchange rate: 1 ${baseCurrency} = ${userRate} ${account.currency_code}`
            : undefined
        }
      >
        <Label htmlFor="user_rate">
          Exchange rate: 1 {baseCurrency} = ? {account.currency_code}
          <InfoTooltip term="exchangeRate" label="Exchange rate" />
          {fetchingRate ? (
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              Fetching rate…
            </span>
          ) : null}
        </Label>
        <p className="text-xs text-muted-foreground">
          Enter how many {account.currency_code} make up 1 {baseCurrency}. This
          converts the amount into {baseCurrency} for your reports and totals.
        </p>
        <div className="flex gap-2">
          <Input
            id="user_rate"
            type="text"
            inputMode="decimal"
            placeholder={fetchingRate ? 'Fetching…' : 'e.g. 2690'}
            value={userRate}
            onChange={(e) => {
              setUserRate(e.target.value)
              setFxNote('')
              setFxError('')
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
            disabled={fetchingRate}
            onClick={() => autoFetch(account.currency_code, transactionDate)}
          >
            Refresh
          </Button>
        </div>
        {fxError ? (
          <p className="text-xs text-destructive">{fxError}</p>
        ) : fxNote ? (
          <p className="text-xs text-amber-600 dark:text-amber-400">{fxNote}</p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Auto-filled for {transactionDate}. Edit if needed.
          </p>
        )}
        {conversionPreview(account.currency_code) ? (
          <p className="text-xs font-medium text-foreground">
            {conversionPreview(account.currency_code)}{' '}
            <span className="font-normal text-muted-foreground">at this rate</span>
          </p>
        ) : null}
        <input type="hidden" name="exchange_rate_to_base" value={exchangeRateToBase} />
      </AdvancedFields>
    )
  }

  // ── Mobile row layout ──────────────────────────────────────────────────
  // Each field is a compact row (icon + label + current value); tapping expands
  // its real control inline. The controls stay mounted (hidden when collapsed),
  // so they submit exactly like the desktop grid — no separate hidden inputs.
  const selectedCategory = availableCategories.find((c) => c.id === categoryId)
  const categoryValue = selectedCategory
    ? `${selectedCategory.icon ? `${selectedCategory.icon} ` : ''}${categoryName(selectedCategory)}`
    : ''
  // Top-level categories for the mobile picker's first level.
  const mobileParentCategories = compatibleCategories.filter(
    (c) => c.parent_category_id === null
  )
  const repeatValue =
    ui(RECURRING_FREQUENCIES.find((f) => f.value === recurringFrequency)?.label ?? '') ||
    t('transactionForm.repeatNever')
  const statusValue =
    status === 'pending' ? t('transactionForm.statusPending') : t('transactionForm.statusPosted')

  // Reset every picker's transient sub-state (search text, drill level, create
  // sub-view) whenever a field opens, so it starts clean.
  const resetPickerState = () => {
    setCategorySearch('')
    setCategoryDrillParentId(null)
    setSubcategorySearch('')
    setAccountSearch('')
    setShowAccountCreate(false)
    setCreateError('')
  }

  // Close whichever picker surface is open — the desktop/inline accordion
  // (expandedField) or the mobile full-screen sheet (sheetField). Only one is
  // ever open, so clearing both is safe and lets the shared picker bodies close
  // themselves without knowing which surface hosts them.
  //
  // Fill-fast chaining: a selection handler may leave a target in
  // `advanceToRef`, and closing then re-opens straight into that field instead
  // of dropping the user back on the form. The handlers only ever set it for
  // the *next required and still empty* field, so the chain stops as soon as
  // the mandatory path is covered and never hijacks a one-field correction.
  const advanceToRef = useRef<AdvanceTarget>(null)

  const openPicker = (field: PickerField) => {
    resetPickerState()
    setExpandedField(isMobile ? null : field)
    setSheetField(isMobile ? field : null)
  }

  const closePicker = () => {
    const next = advanceToRef.current
    advanceToRef.current = null

    // Description is the end of the chain: it's a plain text field, so it gets
    // focus rather than a picker. On mobile that means expanding its row, which
    // focuses the input on its own.
    if (next === 'description') {
      setSheetField(null)
      setExpandedField(isMobile ? 'description' : null)
      if (!isMobile) {
        window.requestAnimationFrame(() =>
          document.getElementById('description')?.focus()
        )
      }
      return
    }

    if (next) {
      openPicker(next)
      return
    }
    setExpandedField(null)
    setSheetField(null)
  }

  // Shared selection handlers, used by both the mobile sheet and the desktop
  // combobox so the two surfaces can't drift apart.
  const selectAccount = (id: string) => {
    setAccountId(id)
    setUserRate('')
    setFxNote('')
    setFxError('')
    if (!categoryId) advanceToRef.current = 'category'
  }

  const selectFromAccount = (id: string) => {
    setFromAccountId(id)
    const clearsDestination = id === toAccountId
    if (clearsDestination) setToAccountId('')
    if (!toAccountId || clearsDestination) advanceToRef.current = 'to'
  }

  const selectToAccount = (id: string) => {
    setToAccountId(id)
    if (id === fromAccountId) setFromAccountId('')
  }

  const selectCategory = (id: string) => {
    setCategoryId(id)
    if (showField('payee') && !payeeName) advanceToRef.current = 'payee'
  }

  // Description is always rendered (it isn't one of BR-032's optional fields),
  // so the chain can always end there.
  const selectPayee = (name: string) => {
    setPayeeName(name)
    if (!description) advanceToRef.current = 'description'
  }

  // Open the category picker drilled straight into the currently selected
  // subcategory's parent, so the chosen child is visible without re-navigating.
  const syncCategoryDrillToSelection = () => {
    const selected = availableCategories.find((c) => c.id === categoryId)
    setCategoryDrillParentId(selected?.parent_category_id ?? null)
  }

  const editRow = ({
    id,
    icon,
    label,
    value,
    placeholder,
    children,
  }: {
    id: string
    icon: ReactNode
    label: string
    value?: string
    placeholder: string
    children: ReactNode
  }) => {
    const open = expandedField === id
    return (
      <div key={id} className="border-t first:border-t-0">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => {
            resetPickerState()
            setExpandedField(open ? null : id)
          }}
          className="flex w-full items-center gap-3 px-1 py-3 text-left"
        >
          <span className="shrink-0 text-muted-foreground">{icon}</span>
          <span className="shrink-0 text-sm font-medium">{label}</span>
          <span
            className={cn(
              'ml-auto max-w-[52%] truncate text-sm',
              value ? 'text-foreground' : 'text-muted-foreground'
            )}
          >
            {value || placeholder}
          </span>
          <ChevronDown
            className={cn(
              'size-4 shrink-0 text-muted-foreground transition-transform',
              open && 'rotate-180'
            )}
            aria-hidden="true"
          />
        </button>
        <div
          data-field-panel={id}
          className={cn('px-1 pb-3 [&_label]:sr-only', open ? 'block' : 'hidden')}
        >
          {children}
        </div>
      </div>
    )
  }

  // A mobile row that opens the full-screen SelectorSheet (Account / Category /
  // Payee) instead of expanding inline — this is what keeps the soft keyboard
  // from ever covering the option list. The chevron points right (navigation)
  // rather than down (accordion) to signal it opens a new surface.
  const pickerRow = ({
    id,
    icon,
    label,
    value,
    placeholder,
    onOpen,
  }: {
    id: 'account' | 'from' | 'to' | 'category' | 'payee'
    icon: ReactNode
    label: string
    value?: string
    placeholder: string
    onOpen?: () => void
  }) => (
    <div key={id} className="border-t first:border-t-0">
      <button
        type="button"
        onClick={() => {
          setExpandedField(null)
          resetPickerState()
          onOpen?.()
          setSheetField(id)
        }}
        className="flex w-full items-center gap-3 px-1 py-3 text-left"
      >
        <span className="shrink-0 text-muted-foreground">{icon}</span>
        <span className="shrink-0 text-sm font-medium">{label}</span>
        <span
          className={cn(
            'ml-auto max-w-[52%] truncate text-sm',
            value ? 'text-foreground' : 'text-muted-foreground'
          )}
        >
          {value || placeholder}
        </span>
        <ChevronRight
          className="size-4 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
      </button>
    </div>
  )

  // Inline single-select list: tapping a row shows these directly (one tap),
  // and tapping an option selects it — no native <select> to open first.
  const optionList = (
    options: { value: string; label: string; icon?: ReactNode; disabled?: boolean }[],
    selected: string,
    onSelect: (value: string) => void
  ) => (
    <div className="max-h-72 overflow-y-auto">
      {options.map((option) => (
        <button
          key={option.value || '__none__'}
          type="button"
          disabled={option.disabled}
          onClick={() => onSelect(option.value)}
          className={cn(
            'flex w-full items-center gap-2 rounded-lg px-2 py-2.5 text-left text-sm disabled:opacity-40',
            selected === option.value
              ? 'bg-primary/10 font-medium text-primary'
              : 'hover:bg-muted'
          )}
        >
          {option.icon ? (
            <span className="shrink-0" aria-hidden="true">
              {option.icon}
            </span>
          ) : null}
          <span className="flex-1 truncate">{option.label}</span>
          {selected === option.value ? (
            <Check className="size-4 shrink-0" aria-hidden="true" />
          ) : null}
        </button>
      ))}
    </div>
  )

  // Currencies offered by the inline "create account" form: the base currency
  // plus any already used by an existing account (a brand-new currency still
  // goes through the full accounts page).
  const currencyOptions = Array.from(
    new Set([
      baseCurrency,
      ...(currencies && currencies.length > 0
        ? currencies
        : availableAccounts.map((a) => a.currency_code)),
    ])
  )
  const ACCOUNT_TYPE_OPTIONS: { value: string; label: string }[] = [
    { value: 'cash', label: 'Cash' },
    { value: 'checking', label: 'Checking' },
    { value: 'savings', label: 'Savings' },
    { value: 'credit_card', label: 'Credit card' },
    { value: 'debt', label: 'Debt / loan' },
    { value: 'investment', label: 'Investment' },
    { value: 'other', label: 'Other' },
  ]

  async function handleCreateCategory(rawName: string, parentId?: string | null) {
    const name = rawName.trim()
    if (!name || creatingCategory || isTransfer) return
    setCreatingCategory(true)
    setCreateError('')
    const result = await quickCreateCategory(
      name,
      transactionType as 'income' | 'expense',
      parentId ?? null
    )
    setCreatingCategory(false)
    if ('error' in result) {
      setCreateError(result.error)
      return
    }
    const created = result.category as TransactionFormCategory
    setCreatedCategories((prev) => [...prev, created])
    selectCategory(created.id)
    closePicker()
  }

  async function handleCreateAccount() {
    const name = newAccountName.trim()
    const currencyCode = newAccountCurrency || baseCurrency
    if (!name || creatingAccount) return
    setCreatingAccount(true)
    setCreateError('')
    const result = await quickCreateAccount({ name, accountType: newAccountType, currencyCode })
    setCreatingAccount(false)
    if ('error' in result) {
      setCreateError(result.error)
      return
    }
    const created = result.account as TransactionFormAccount
    setCreatedAccounts((prev) => [...prev, created])
    // Select the new account into whichever slot is being edited (works whether
    // the picker is hosted by the inline accordion or the mobile sheet).
    const editingSlot = expandedField ?? sheetField
    if (isTransfer) {
      if (editingSlot === 'to') setToAccountId(created.id)
      else setFromAccountId(created.id)
    } else {
      setAccountId(created.id)
      setUserRate('')
      setFxNote('')
      setFxError('')
    }
    setNewAccountName('')
    closePicker()
  }

  const backButton = (onClick: () => void, label: string) => (
    <button
      type="button"
      onClick={onClick}
      className="mb-1 flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
    >
      <ChevronDown className="size-4 rotate-90" aria-hidden="true" />
      {label}
    </button>
  )

  // Account picker used by the account / from / to rows: a searchable list plus
  // a "Create …" row that drills into a compact create sub-view (name +
  // type + currency) so the row stays lean until you actually add an account.
  const accountPickerBody = (
    selectedId: string,
    onSelect: (id: string) => void,
    disabledId?: string
  ) => {
    const query = accountSearch.trim().toLowerCase()
    const matches = availableAccounts.filter((a) =>
      accountSearchText(a).toLowerCase().includes(query)
    )
    const hasExact = availableAccounts.some(
      (a) => a.name.toLowerCase() === query && query !== ''
    )
    return (
      <>
        {showAccountCreate ? (
          <div className="space-y-2">
            {/* On mobile the sheet header owns the back chevron; this inline
                link is the desktop popover's only way up. */}
            {isMobile ? null : backButton(() => setShowAccountCreate(false), 'Back to accounts')}
            <Input
              placeholder="Account name"
              value={newAccountName}
              onChange={(e) => setNewAccountName(e.target.value)}
            />
            <div className="flex gap-2">
              <select
                aria-label="Account type"
                className={nativeSelectCls}
                value={newAccountType}
                onChange={(e) => setNewAccountType(e.target.value)}
              >
                {ACCOUNT_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <select
                aria-label="Currency"
                className={nativeSelectCls}
                value={newAccountCurrency || baseCurrency}
                onChange={(e) => setNewAccountCurrency(e.target.value)}
              >
                {currencyOptions.map((code) => (
                  <option key={code} value={code}>{code}</option>
                ))}
              </select>
            </div>
            {createError ? <p className="text-xs text-destructive">{createError}</p> : null}
            <Button
              type="button"
              size="sm"
              disabled={creatingAccount || !newAccountName.trim()}
              onClick={handleCreateAccount}
            >
              {creatingAccount ? 'Creating…' : 'Create account'}
            </Button>
          </div>
        ) : (
          <>
            <Input
              placeholder="Search or add an account"
              value={accountSearch}
              onChange={(e) => setAccountSearch(e.target.value)}
            />
            <div className="mt-2 sm:max-h-72 sm:overflow-y-auto">
              {matches.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  disabled={a.id === disabledId}
                  onClick={() => {
                    onSelect(a.id)
                    closePicker()
                  }}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-lg px-2 py-2.5 text-left text-sm disabled:opacity-40',
                    selectedId === a.id
                      ? 'bg-primary/10 font-medium text-primary'
                      : 'hover:bg-muted'
                  )}
                >
                  <span className="flex-1 truncate">{formatAccountLabel(a)}</span>
                  {selectedId === a.id ? (
                    <Check className="size-4 shrink-0" aria-hidden="true" />
                  ) : null}
                </button>
              ))}
              {accountSearch.trim() && !hasExact ? (
                <button
                  type="button"
                  onClick={() => {
                    setNewAccountName(accountSearch.trim())
                    setCreateError('')
                    setShowAccountCreate(true)
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-2.5 text-left text-sm hover:bg-muted"
                >
                  <Plus className="size-4 shrink-0 text-primary" aria-hidden="true" />
                  <span className="flex-1 truncate">
                    Create “<span className="font-semibold">{accountSearch.trim()}</span>”
                  </span>
                </button>
              ) : null}
            </div>
          </>
        )}
      </>
    )
  }

  // Category picker: searchable parent list that drills into a parent's
  // subcategories (hiding the parent list so there's no scrolling), plus a
  // payee-style "Create …" row for a brand-new top-level category.
  const categoryPickerBody = () => {
    const query = categorySearch.trim().toLowerCase()
    const parents = mobileParentCategories
    // While searching, match across every compatible category (parents AND
    // subcategories), so a subcategory can be found and picked directly.
    const searchMatches = query
      ? compatibleCategories.filter((c) => c.name.toLowerCase().includes(query))
      : []
    const hasExact = compatibleCategories.some(
      (c) => c.name.toLowerCase() === query && query !== ''
    )
    const drillParent = categoryDrillParentId
      ? availableCategories.find((c) => c.id === categoryDrillParentId)
      : null
    const subQuery = subcategorySearch.trim().toLowerCase()
    const drillChildren = categoryDrillParentId
      ? compatibleCategories.filter(
          (c) =>
            c.parent_category_id === categoryDrillParentId &&
            (!subQuery || c.name.toLowerCase().includes(subQuery))
        )
      : []
    const subHasExact = drillParent
      ? compatibleCategories.some(
          (c) =>
            c.parent_category_id === drillParent.id &&
            c.name.toLowerCase() === subQuery &&
            subQuery !== ''
        )
      : false

    return (
      <>
        {drillParent ? (
          <div className="space-y-2">
            {/* Desktop only — the mobile sheet's header carries the chevron and
                the parent's name, so repeating both here would be noise. */}
            {isMobile ? null : (
              <>
                {backButton(() => {
                  setCategoryDrillParentId(null)
                  setSubcategorySearch('')
                }, 'All categories')}
                <div className="flex items-center gap-2 px-1 text-sm font-medium">
                  {drillParent.icon ? (
                    <span aria-hidden="true">{drillParent.icon}</span>
                  ) : null}
                  <span className="truncate">{categoryName(drillParent)}</span>
                </div>
              </>
            )}
            <Input
              placeholder="Search or add a subcategory"
              value={subcategorySearch}
              onChange={(e) => setSubcategorySearch(e.target.value)}
            />
            {optionList(
              [
                // Select the parent itself (e.g. "All Travel") — the "no
                // subcategory" case, kept selectable even when children exist.
                ...(subQuery ? [] : [{ value: drillParent.id, label: `${ui('All')} ${categoryName(drillParent)}` }]),
                ...drillChildren.map((c) => ({ value: c.id, label: categoryName(c), icon: c.icon })),
              ],
              categoryId,
              (value) => {
                setCategoryId(value)
                closePicker()
              }
            )}
            {subcategorySearch.trim() && !subHasExact ? (
              <button
                type="button"
                disabled={creatingCategory}
                onClick={() => handleCreateCategory(subcategorySearch, drillParent.id)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-2.5 text-left text-sm hover:bg-muted disabled:opacity-50"
              >
                <Plus className="size-4 shrink-0 text-primary" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">
                  {creatingCategory ? (
                    'Creating…'
                  ) : (
                    <>
                      Create “<span className="font-semibold">{subcategorySearch.trim()}</span>” in{' '}
                      {categoryName(drillParent)}
                    </>
                  )}
                </span>
              </button>
            ) : null}
            {createError ? (
              <p className="px-1 text-xs text-destructive">{createError}</p>
            ) : null}
          </div>
        ) : (
          <>
            <Input
              placeholder="Search or add a category"
              value={categorySearch}
              onChange={(e) => setCategorySearch(e.target.value)}
            />
            <div className="mt-2 sm:max-h-72 sm:overflow-y-auto">
              {query
                ? searchMatches.map((c) => {
                    const parent = c.parent_category_id
                      ? availableCategories.find((p) => p.id === c.parent_category_id)
                      : null
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          selectCategory(c.id)
                          closePicker()
                        }}
                        className={cn(
                          'flex w-full items-center gap-2 rounded-lg px-2 py-2.5 text-left text-sm',
                          categoryId === c.id
                            ? 'bg-primary/10 font-medium text-primary'
                            : 'hover:bg-muted'
                        )}
                      >
                        {c.icon ? (
                          <span className="shrink-0" aria-hidden="true">{c.icon}</span>
                        ) : null}
                        <span className="min-w-0 flex-1 truncate">
                          {parent ? (
                            <span className="text-muted-foreground">{categoryName(parent)} › </span>
                          ) : null}
                          {categoryName(c)}
                        </span>
                        {categoryId === c.id ? (
                          <Check className="size-4 shrink-0" aria-hidden="true" />
                        ) : null}
                      </button>
                    )
                  })
                : parents.map((parent) => {
                    const kids = compatibleCategories.filter(
                      (c) => c.parent_category_id === parent.id
                    )
                    const isSelected =
                      categoryId === parent.id || kids.some((k) => k.id === categoryId)
                    return (
                      <button
                        key={parent.id}
                        type="button"
                        onClick={() => {
                          if (kids.length > 0) {
                            setCategoryDrillParentId(parent.id)
                            setCategorySearch('')
                            setSubcategorySearch('')
                          } else {
                            selectCategory(parent.id)
                            closePicker()
                          }
                        }}
                        className={cn(
                          'flex w-full items-center gap-2 rounded-lg px-2 py-2.5 text-left text-sm',
                          isSelected ? 'bg-primary/10 font-medium text-primary' : 'hover:bg-muted'
                        )}
                      >
                        {parent.icon ? (
                          <span className="shrink-0" aria-hidden="true">{parent.icon}</span>
                        ) : null}
                        <span className="flex-1 truncate">{categoryName(parent)}</span>
                        {kids.length > 0 ? (
                          <ChevronDown className="size-4 shrink-0 -rotate-90 text-muted-foreground" aria-hidden="true" />
                        ) : isSelected ? (
                          <Check className="size-4 shrink-0" aria-hidden="true" />
                        ) : null}
                      </button>
                    )
                  })}
              {categorySearch.trim() && !hasExact ? (
                <button
                  type="button"
                  disabled={creatingCategory}
                  onClick={() => handleCreateCategory(categorySearch)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-2.5 text-left text-sm hover:bg-muted disabled:opacity-50"
                >
                  <Plus className="size-4 shrink-0 text-primary" aria-hidden="true" />
                  <span className="flex-1 truncate">
                    {creatingCategory ? (
                      'Creating…'
                    ) : (
                      <>Create “<span className="font-semibold">{categorySearch.trim()}</span>”</>
                    )}
                  </span>
                </button>
              ) : null}
            </div>

            {frequentCategories.length > 0 && !categorySearch.trim() ? (
              <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t pt-2">
                <span className="text-xs text-muted-foreground">{t('transactionForm.frequentlyUsed')}</span>
                {frequentCategories.map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => {
                      selectCategory(category.id)
                      closePicker()
                    }}
                    className={cn(
                      'flex h-8 items-center gap-1 rounded-full border px-3 text-xs font-medium transition-colors',
                      categoryId === category.id
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                  >
                    {category.icon ? <span aria-hidden="true">{category.icon}</span> : null}
                    {categoryName(category)}
                  </button>
                ))}
              </div>
            ) : null}
          </>
        )}
      </>
    )
  }

  // Payee picker (mobile sheet): a flat searchable list — payees have no
  // hierarchy — plus a "Create …" row. The name is resolved to a payee_id by
  // the server action on submit (get-or-create), so "creating" here is just
  // keeping the typed text and closing.
  const payeePickerBody = () => {
    const trimmed = payeeName.trim()
    const normalized = trimmed.toLowerCase()
    return (
      <>
        <Input
          placeholder="Search or add a payee"
          value={payeeName}
          onChange={(e) => setPayeeName(e.target.value)}
        />
        <div className="mt-2 sm:max-h-[60vh] sm:overflow-y-auto">
          {payees
            .filter((p) => p.name.toLowerCase().includes(normalized))
            .slice(0, 50)
            .map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  selectPayee(p.name)
                  closePicker()
                }}
                className={cn(
                  'flex w-full items-center gap-2 rounded-lg px-2 py-2.5 text-left text-sm',
                  payeeName === p.name
                    ? 'bg-primary/10 font-medium text-primary'
                    : 'hover:bg-muted'
                )}
              >
                <Store className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="flex-1 truncate">{p.name}</span>
                {payeeName === p.name ? (
                  <Check className="size-4 shrink-0" aria-hidden="true" />
                ) : null}
              </button>
            ))}
          {trimmed && !payees.some((p) => p.name.toLowerCase() === normalized) ? (
            <button
              type="button"
              onClick={() => closePicker()}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-2.5 text-left text-sm hover:bg-muted"
            >
              <Plus className="size-4 shrink-0 text-primary" aria-hidden="true" />
              <span className="flex-1 truncate">
                Create “<span className="font-semibold">{trimmed}</span>”
              </span>
            </button>
          ) : null}
        </div>
      </>
    )
  }

  // Desktop combobox: a labelled trigger (styled like a select) that expands
  // the same searchable picker body inline. Reuses expandedField as the
  // open-state and keeps the hidden input in-form so submission is unchanged.
  const desktopCombo = ({
    id,
    label,
    leading,
    valueText,
    placeholder,
    hiddenName,
    hiddenValue,
    body,
    className,
    onOpen,
  }: {
    id: string
    label: ReactNode
    leading?: ReactNode
    valueText?: string
    placeholder: string
    hiddenName: string
    hiddenValue: string
    body: ReactNode
    className?: string
    /** Runs after the picker state resets when the combobox opens. */
    onOpen?: () => void
  }) => {
    const open = expandedField === id
    return (
      <div className={cn('space-y-1.5', className)}>
        <Label>{label}</Label>
        <input type="hidden" name={hiddenName} value={hiddenValue} />
        <Popover.Root
          open={open}
          onOpenChange={(next) => {
            if (next) {
              resetPickerState()
              onOpen?.()
            }
            setExpandedField(next ? id : null)
          }}
        >
          <Popover.Trigger
            render={
              <button
                type="button"
                className={cn(
                  'flex h-11 w-full items-center gap-2 rounded-xl border bg-background px-3 text-left text-sm transition-colors',
                  open ? 'ring-2 ring-ring' : 'hover:bg-muted/50'
                )}
              />
            }
          >
            {leading ? <span className="shrink-0 text-muted-foreground">{leading}</span> : null}
            <span className={cn('flex-1 truncate', valueText ? '' : 'text-muted-foreground')}>
              {valueText || placeholder}
            </span>
            <ChevronDown
              className={cn(
                'size-4 shrink-0 text-muted-foreground transition-transform',
                open && 'rotate-180'
              )}
              aria-hidden="true"
            />
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Positioner
              sideOffset={4}
              align="start"
              className="isolate z-50 w-(--anchor-width)"
            >
              <Popover.Popup
                data-field-panel={id}
                className="max-h-(--available-height) w-(--anchor-width) overflow-y-auto rounded-xl border bg-popover p-2 text-popover-foreground shadow-md ring-1 ring-foreground/10 [&_label]:sr-only"
              >
                {body}
              </Popover.Popup>
            </Popover.Positioner>
          </Popover.Portal>
        </Popover.Root>
      </div>
    )
  }

  const mobileFields = (
    <div className="rounded-xl border px-2">
      {/* Selection lives in hidden inputs that stay mounted regardless of the
          sheet's open state — the full-screen SelectorSheet unmounts when it
          closes, so the values it sets must be submitted from here. */}
      {isTransfer ? (
        <>
          <input type="hidden" name="from_account_id" value={fromAccountId} />
          <input type="hidden" name="to_account_id" value={toAccountId} />
        </>
      ) : (
        <>
          <input type="hidden" name="account_id" value={accountId} />
          <input type="hidden" name="category_id" value={categoryId} />
          {showField('payee') ? (
            <input type="hidden" name="payee_name" value={payeeName} />
          ) : null}
        </>
      )}

      <div className="px-1 pb-2 pt-2">{dateChips}</div>

      {editRow({
        id: 'date',
        icon: <CalendarDays className="size-4.5" />,
        label: t('transactionForm.date'),
        value: transactionDate,
        placeholder: '—',
        children: dateField,
      })}

      {/* BR-045: sits directly under the date, since together they are one
          "when". Absent entirely unless the user turned the field on. */}
      {showField('time')
        ? editRow({
            id: 'time',
            icon: <Clock className="size-4.5" />,
            label: t('transactionForm.time'),
            value: transactionTime,
            placeholder: '—',
            children: timeField,
          })
        : null}

      {/* A transfer's From/To selectors live in the amounts card above, beside
          the figure each one applies to — they are deliberately absent here. */}
      {isTransfer ? null : (
        <>
          {pickerRow({
            id: 'account',
            icon: <Wallet className="size-4.5" />,
            label: t('transactionForm.account'),
            value: selectedAccount ? formatAccountLabel(selectedAccount) : '',
            placeholder: t('transactionForm.selectAccount'),
          })}
          {pickerRow({
            id: 'category',
            icon: <Shapes className="size-4.5" />,
            label: t('transactionForm.category'),
            value: categoryValue,
            placeholder: t('transactionForm.selectCategory'),
            onOpen: syncCategoryDrillToSelection,
          })}
          {showField('payee')
            ? pickerRow({
                id: 'payee',
                icon: <Store className="size-4.5" />,
                label: t(
                  transactionType === 'income'
                    ? 'transactionForm.payer'
                    : 'transactionForm.payee'
                ),
                value: payeeName,
                placeholder: '—',
              })
            : null}
          {showField('repeat')
            ? editRow({
                id: 'repeat',
                icon: <Repeat className="size-4.5" />,
                label: t('transactionForm.repeat'),
                value: repeatValue,
                placeholder: t('transactionForm.repeatNever'),
                children: (
                  <>
                    <input type="hidden" name="frequency" value={recurringFrequency} />
                    {optionList(
                      [
                        { value: '', label: t('transactionForm.repeatNever') },
                        ...RECURRING_FREQUENCIES.map((f) => ({
                          value: f.value,
                          label: ui(f.label),
                        })),
                      ],
                      recurringFrequency,
                      (value) => {
                        setRecurringFrequency(value)
                        setExpandedField(null)
                      }
                    )}
                  </>
                ),
              })
            : null}
        </>
      )}

      {editRow({
        id: 'description',
        icon: <FileText className="size-4.5" />,
        label: t('transactionForm.description'),
        value: description,
        placeholder: '—',
        children: (
          <div className="space-y-1.5">
            <Label htmlFor="description">{t('transactionForm.description')}</Label>
            <Input
              id="description"
              name="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        ),
      })}
      {showField('notes')
        ? editRow({
            id: 'note',
            icon: <StickyNote className="size-4.5" />,
            label: t('transactionForm.notes'),
            value: notes,
            placeholder: '—',
            children: (
              <div className="space-y-1.5">
                <Label htmlFor="notes">{t('transactionForm.notes')}</Label>
                <Textarea
                  id="notes"
                  name="notes"
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            ),
          })
        : null}
      {showField('status')
        ? editRow({
            id: 'status',
            icon: <ListChecks className="size-4.5" />,
            label: t('transactionForm.status'),
            value: statusValue,
            placeholder: '',
            children: statusField,
          })
        : statusField}

    </div>
  )

  // ── Transfer: the two amounts, each next to its own account ──────────────
  // A transfer's two figures are both real values the user enters — what left
  // the source and what arrived in the destination — not one converted into the
  // other. So they belong in one card, each directly above the account it
  // applies to, instead of an amount at the top and "amount received" pushed
  // below the date, description and notes.
  const AMOUNT_LABEL_CLS =
    'text-xs font-medium uppercase tracking-wider text-muted-foreground'
  const CURRENCY_CHIP_CLS =
    'rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground'

  /**
   * The account selector for the transfer card. On mobile it opens the same
   * full-screen `SelectorSheet` the row list uses (its hidden input lives in
   * `mobileFields`, which stays mounted); on desktop it is the usual popover
   * combobox, which carries its own hidden input.
   */
  const transferAccountField = ({
    id,
    label,
    account,
    placeholder,
    hiddenName,
    hiddenValue,
    body,
  }: {
    id: 'from' | 'to'
    label: string
    account: TransactionFormAccount | undefined
    placeholder: string
    hiddenName: string
    hiddenValue: string
    body: ReactNode
  }) => {
    const valueText = account ? formatAccountLabel(account) : ''
    if (!isMobile) {
      return desktopCombo({
        id,
        label,
        leading: accountLeading(account),
        valueText,
        placeholder,
        hiddenName,
        hiddenValue,
        body,
      })
    }
    return (
      <div className="space-y-1.5">
        <Label>{label}</Label>
        <button
          type="button"
          onClick={() => {
            setExpandedField(null)
            resetPickerState()
            setSheetField(id)
          }}
          className="flex h-11 w-full items-center gap-2 rounded-xl border bg-background px-3 text-left text-sm"
        >
          {accountLeading(account) ? (
            <span className="shrink-0 text-muted-foreground">{accountLeading(account)}</span>
          ) : null}
          <span className={cn('flex-1 truncate', valueText ? '' : 'text-muted-foreground')}>
            {valueText || placeholder}
          </span>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>
      </div>
    )
  }

  const transferAmountsCard = (
    <div className="space-y-2.5 rounded-2xl border bg-muted/30 p-3">
      <div>
        <div className="flex items-center justify-between">
          <Label htmlFor="amount" className={AMOUNT_LABEL_CLS}>
            {t('transactionForm.amountSent')}
          </Label>
          <span className={CURRENCY_CHIP_CLS}>{amountCurrencyCode}</span>
        </div>
        <AmountInput
          id="amount"
          name="amount"
          currencyCode={amountCurrencyCode}
          value={amountInput}
          onValueChange={(v) => {
            setAmountInput(v)
            // Changing what you sent re-enables the transfer-cost estimate.
            setCostTouched(false)
          }}
          onCommit={() => {
            if (!fromAccountId) openPicker('from')
            else if (!toAccountId) openPicker('to')
          }}
          size="lg"
          withCalculator
          required
          className="mt-1.5"
        />
        <div className="mt-2">
          {transferAccountField({
            id: 'from',
            label: t('transactionForm.fromAccount'),
            account: selectedFromAccount,
            placeholder: t('transactionForm.selectSource'),
            hiddenName: 'from_account_id',
            hiddenValue: fromAccountId,
            body: accountPickerBody(fromAccountId, selectFromAccount, toAccountId),
          })}
        </div>
      </div>

      <div className="flex items-center gap-2" aria-hidden="true">
        <span className="h-px flex-1 bg-border" />
        <ArrowDown className="size-3.5 text-muted-foreground" />
        <span className="h-px flex-1 bg-border" />
      </div>

      <div>
        {/* Only a cross-currency transfer has a second amount to enter. When both
            legs share a currency the same figure arrives, so the destination
            block is just the account. */}
        {isCrossCurrencyTransfer ? (
          <>
            <div className="flex items-center justify-between">
              <Label htmlFor="to_amount" className={AMOUNT_LABEL_CLS}>
                {t('transactionForm.amountReceived')}
              </Label>
              <span className={CURRENCY_CHIP_CLS}>{selectedToAccount?.currency_code}</span>
            </div>
            <AmountInput
              id="to_amount"
              name="to_amount"
              currencyCode={selectedToAccount?.currency_code ?? baseCurrency}
              value={toAmountInput}
              onValueChange={(v) => {
                setToAmountInput(v)
                // Changing what you received re-estimates the cost.
                setCostTouched(false)
              }}
              size="lg"
              withCalculator
              required
              className="mt-1.5"
            />
          </>
        ) : null}
        <div className={isCrossCurrencyTransfer ? 'mt-2' : undefined}>
          {transferAccountField({
            id: 'to',
            label: t('transactionForm.toAccount'),
            account: selectedToAccount,
            placeholder: t('transactionForm.selectDestination'),
            hiddenName: 'to_account_id',
            hiddenValue: toAccountId,
            body: accountPickerBody(toAccountId, selectToAccount, fromAccountId),
          })}
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          {isCrossCurrencyTransfer
            ? t('transactionForm.amountReceivedHelp')
            : t('transactionForm.amountArrivesSame')}
        </p>
      </div>

      {availableAccounts.length < 2 ? (
        <p className="text-sm text-muted-foreground">
          {t('transactionForm.needTwoAccounts')}
        </p>
      ) : null}
    </div>
  )

  // ── Mobile full-screen selector sheet ──────────────────────────────────
  // A single sheet instance drives every sheet-backed row; its title and body
  // switch on which row opened it. The picker bodies are the same ones the
  // desktop Popover uses, so behaviour stays consistent across breakpoints.
  // Drilled-in subviews retitle the sheet and light up its back chevron, so the
  // header always says where you are and how to get back out — one tap, in the
  // same place, whichever picker is open.
  const drilledCategoryParent =
    sheetField === 'category' && categoryDrillParentId
      ? availableCategories.find((c) => c.id === categoryDrillParentId)
      : null
  const drilledAccountCreate =
    showAccountCreate && (sheetField === 'account' || sheetField === 'from' || sheetField === 'to')

  const sheetBack = drilledCategoryParent
    ? () => {
        setCategoryDrillParentId(null)
        setSubcategorySearch('')
      }
    : drilledAccountCreate
      ? () => setShowAccountCreate(false)
      : undefined

  const baseSheetTitle =
    sheetField === 'category'
      ? 'Category'
      : sheetField === 'payee'
        ? t(transactionType === 'income' ? 'transactionForm.payer' : 'transactionForm.payee')
        : sheetField === 'from'
          ? t('transactionForm.fromAccount')
          : sheetField === 'to'
            ? t('transactionForm.toAccount')
            : t('transactionForm.account')

  const sheetTitle = drilledCategoryParent
    ? `${drilledCategoryParent.icon ? `${drilledCategoryParent.icon} ` : ''}${categoryName(drilledCategoryParent)}`
    : drilledAccountCreate
      ? ui('New account')
      : baseSheetTitle

  let sheetBody: ReactNode = null
  if (sheetField === 'category') {
    sheetBody = categoryPickerBody()
  } else if (sheetField === 'payee') {
    sheetBody = payeePickerBody()
  } else if (sheetField === 'account') {
    sheetBody = accountPickerBody(accountId, selectAccount)
  } else if (sheetField === 'from') {
    sheetBody = accountPickerBody(fromAccountId, selectFromAccount, toAccountId)
  } else if (sheetField === 'to') {
    sheetBody = accountPickerBody(toAccountId, selectToAccount, fromAccountId)
  }

  return (
    <form action={submitAction} onSubmit={rememberCategoryUsage} className="space-y-3">
      {returnTo ? <input type="hidden" name="return_to" value={returnTo} /> : null}

      <SelectorSheet
        open={sheetField !== null}
        onClose={closePicker}
        onBack={sheetBack}
        title={sheetTitle}
      >
        {sheetBody}
      </SelectorSheet>

      {/* ── Type: segmented control ──────────────────────────────────── */}
      <SegmentedField
        name="transaction_type"
        value={transactionType}
        onChange={(value) => handleTransactionTypeChange(value as TransactionType)}
        options={typeOptions.map(({ value, label, Icon, activeCls }) => ({
          value,
          activeCls,
          label: (
            <>
              <Icon className="size-4" aria-hidden="true" />
              <span className="truncate">{label}</span>
            </>
          ),
        }))}
      />

      {/* ── Amount: one hero for expense/income, a paired card for transfers ── */}
      {isTransfer ? (
        transferAmountsCard
      ) : (
        <div className="rounded-2xl border bg-muted/30 p-3">
          <div className="flex items-center justify-between">
            <Label htmlFor="amount" className={AMOUNT_LABEL_CLS}>
              {t('transactionForm.amount')}
            </Label>
            <span className={CURRENCY_CHIP_CLS}>{amountCurrencyCode}</span>
          </div>
          <AmountInput
            id="amount"
            name="amount"
            currencyCode={amountCurrencyCode}
            value={amountInput}
            onValueChange={setAmountInput}
            // Enter on the amount starts the fill-fast chain at the first field
            // still missing, so a whole entry can be typed without hunting.
            onCommit={() => {
              if (!accountId) openPicker('account')
              else if (!categoryId) openPicker('category')
            }}
            size="lg"
            withCalculator
            required
            className="mt-1.5"
          />

          {/* BR-031: the base-currency equivalent, as text. On an expense the
              only value the user has is the one in the account's currency —
              nobody records a COP purchase by typing CAD — so this reads out the
              conversion instead of asking for it. */}
          {isMultiCurrency ? (
            <p className="mt-2 text-xs text-muted-foreground">
              {baseEquivalent
                ? t('transactionForm.amountInBasePreview', {
                    amount: baseEquivalent,
                    currency: baseCurrency,
                  })
                : t('transactionForm.amountInBaseNeedsRate')}
            </p>
          ) : null}
        </div>
      )}

      {/* ── Fields: mobile row-list vs desktop two-column grid ─────────── */}
      {isMobile ? mobileFields : (
      <>
      {isTransfer ? (
        // The account selectors moved into the amounts card above, so what is
        // left here is the rest of the transfer's detail.
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            {dateField}
            {dateChips}
            {timeField}
          </div>
          {statusField}

          {/* Description: kept essential (visible on mobile too). */}
          <div className="space-y-1.5 col-span-2">
            <Label htmlFor="description">{t('transactionForm.description')}</Label>
            <Input id="description" name="description" defaultValue={defaultDescription} />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {desktopCombo({
            id: 'account',
            label: t('transactionForm.account'),
            leading: accountLeading(selectedAccount),
            valueText: selectedAccount ? formatAccountLabel(selectedAccount) : '',
            placeholder: t('transactionForm.selectAccount'),
            hiddenName: 'account_id',
            hiddenValue: accountId,
            body: accountPickerBody(accountId, selectAccount),
          })}

          <div className="space-y-1.5">
            {dateField}
            {dateChips}
            {timeField}
          </div>

          {desktopCombo({
            id: 'category',
            label: t('transactionForm.category'),
            valueText: categoryValue,
            placeholder: t('transactionForm.selectCategory'),
            hiddenName: 'category_id',
            hiddenValue: categoryId,
            body: categoryPickerBody(),
            className: 'col-span-2',
            onOpen: syncCategoryDrillToSelection,
          })}

          {/* Payee & Description: kept essential (visible on mobile too) and
              full-width so they're comfortable to type into. Payee sits above
              description to match the entry order the pickers chain through:
              amount → account → category → payee → description. */}
          {showField('payee') ? (
            <div className="col-span-2">
              <PayeePicker
                payees={payees}
                defaultValue={defaultMerchantName}
                // "Payer" for income (who paid you), "Payee" for an expense (whom you
                // paid) — same underlying payees table, context-appropriate wording.
                label={t(transactionType === 'income' ? 'transactionForm.payer' : 'transactionForm.payee')}
                helpText={t('transactionForm.payeeHelp')}
                inputId="payee_name"
              />
            </div>
          ) : null}

          <div className="space-y-1.5 col-span-2">
            <Label htmlFor="description">{t('transactionForm.description')}</Label>
            <Input id="description" name="description" defaultValue={defaultDescription} />
          </div>

          {/* UC-10: turn a normal entry into a recurring one. Kept essential so
              the recurring feature is discoverable. Transfers are not supported
              as recurring templates yet, so this is income/expense only. */}
          {showField('repeat') ? (
            <div className="space-y-1.5">
              <SelectField
                id="frequency"
                name="frequency"
                label={t('transactionForm.repeat')}
                leading={<Repeat className="size-4.5" />}
                value={recurringFrequency}
                onChange={(e) => setRecurringFrequency(e.target.value)}
              >
                <option value="">{t('transactionForm.repeatNever')}</option>
                {RECURRING_FREQUENCIES.map((frequency) => (
                  <option key={frequency.value} value={frequency.value}>
                    {ui(frequency.label)}
                  </option>
                ))}
              </SelectField>
            </div>
          ) : null}

          {statusField}

          {recurringFrequency ? (
            <p className="text-xs text-muted-foreground col-span-2">{t('transactionForm.repeatHelp')}</p>
          ) : null}
        </div>
      )}

      {/* ── Secondary details: collapse on mobile, grid on desktop ────── */}
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => setShowMoreDetails((value) => !value)}
          aria-expanded={showMoreDetails}
          className="flex w-full items-center justify-between rounded-xl border px-3.5 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted sm:hidden"
        >
          {showMoreDetails ? t('transactionForm.fewerDetails') : t('transactionForm.moreDetails')}
          <ChevronDown
            className={cn('size-4 transition-transform', showMoreDetails && 'rotate-180')}
            aria-hidden="true"
          />
        </button>

        {showField('notes') ? (
          <div className={cn('space-y-1.5 sm:block', showMoreDetails ? 'block' : 'hidden')}>
            <Label htmlFor="notes">{t('transactionForm.notes')}</Label>
            <Textarea id="notes" name="notes" rows={2} defaultValue={defaultNotes} />
          </div>
        ) : null}
      </div>
      </>
      )}

      {/* ── Tags (income/expense only; BR-023) ────────────────────────── */}
      {/* Rendered outside the mobile/desktop branch so the selection survives a
          breakpoint change. Shown even with no tags yet — the picker can create
          the first one inline. */}
      {!isTransfer && showField('tags') ? (
        <TagMultiSelect
          tags={tags}
          defaultValue={defaultTagIds}
          label={t('transactionForm.tags')}
          helpText={t('transactionForm.tagsHelp')}
          manageLabel={t('transactionForm.tagsManage')}
        />
      ) : null}

      {/* ── Cross-currency: unified transfer cost (fees + exchange) ────── */}
      {isTransfer && isCrossCurrencyTransfer ? (
        <div className="rounded-2xl border bg-muted/30 p-3">
          <div className="flex items-center justify-between">
            <Label
              htmlFor="cost_base"
              className="text-xs font-medium uppercase tracking-wider text-muted-foreground"
            >
              {t('transactionForm.transferCost')}
            </Label>
            <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground">
              {baseCurrency}
            </span>
          </div>
          <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
            <Input
              id="cost_base"
              name="cost_base"
              inputMode="decimal"
              value={costValue}
              onChange={(e) => {
                setCostInput(e.target.value)
                setCostTouched(true)
              }}
              placeholder="0.00"
              className="sm:flex-1"
            />
            <select
              aria-label={t('transactionForm.transferCostCategory')}
              value={effectiveCostCategoryId}
              onChange={(e) => setCostCategoryId(e.target.value)}
              className={cn(nativeSelectCls, 'sm:flex-1')}
              disabled={!costIsPositive}
            >
              <option value="" disabled>
                {t('transactionForm.transferCostCategory')}
              </option>
              {expenseCategoryOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          {costExceedsSent ? (
            <p className="mt-1.5 text-xs text-destructive">
              {t('transactionForm.transferCostTooLarge')}
            </p>
          ) : costLooksOff && suggestedCost != null ? (
            <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-400">
              {t('transactionForm.transferCostLooksOff', {
                amount: formatCurrency(suggestedCost, baseCurrency),
              })}
            </p>
          ) : (
            <p className="mt-1.5 text-xs text-muted-foreground">
              {t('transactionForm.transferCostHelp')}
            </p>
          )}
          <input
            type="hidden"
            name="cost_category_id"
            value={costIsPositive ? effectiveCostCategoryId : ''}
          />
        </div>
      ) : null}

      {/* ── Same-currency: optional explicit fee (a real cash charge) ──── */}
      {isTransfer && !isCrossCurrencyTransfer && selectedFromAccount && selectedToAccount ? (
        <div className="rounded-2xl border bg-muted/30 p-3">
          <div className="flex items-center justify-between">
            <Label
              htmlFor="fee_amount"
              className="text-xs font-medium uppercase tracking-wider text-muted-foreground"
            >
              {t('transactionForm.transferFee')}
            </Label>
            <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground">
              {selectedFromAccount.currency_code}
            </span>
          </div>
          <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
            <Input
              id="fee_amount"
              name="fee_amount"
              inputMode="decimal"
              value={costValue}
              onChange={(e) => {
                setCostInput(e.target.value)
                setCostTouched(true)
              }}
              placeholder="0.00"
              className="sm:flex-1"
            />
            <select
              aria-label={t('transactionForm.transferCostCategory')}
              value={effectiveCostCategoryId}
              onChange={(e) => setCostCategoryId(e.target.value)}
              className={cn(nativeSelectCls, 'sm:flex-1')}
              disabled={!costIsPositive}
            >
              <option value="" disabled>
                {t('transactionForm.transferCostCategory')}
              </option>
              {expenseCategoryOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {t('transactionForm.transferFeeHelp')}
          </p>
          <input
            type="hidden"
            name="fee_category_id"
            value={costIsPositive ? effectiveCostCategoryId : ''}
          />
        </div>
      ) : null}

      {/* ── Exchange rate (only when neither leg is the base currency) ── */}
      {isTransfer ? (
        needsFromRate ? (
          // Same-currency non-base transfers only need the rate for report
          // totals — keep it collapsed. Cross-currency (neither leg base) needs
          // it entered, so open it.
          fxFields(selectedFromAccount, isCrossCurrencyTransfer)
        ) : (
          <input type="hidden" name="exchange_rate_to_base" value="1" />
        )
      ) : isMultiCurrency ? (
        fxFields(selectedAccount)
      ) : (
        <input type="hidden" name="exchange_rate_to_base" value="1" />
      )}

      {/* ── Actions ──────────────────────────────────────────────────── */}
      <div className="sticky bottom-0 z-10 -mb-1 space-y-2 bg-popover pb-1 pt-2 sm:static sm:flex sm:flex-wrap sm:items-center sm:gap-2 sm:space-y-0 sm:bg-transparent sm:p-0">
        <SubmitButton
          type="submit"
          disabled={!canSubmit}
          className="h-11 w-full rounded-xl text-sm font-semibold sm:h-9 sm:w-auto sm:rounded-lg"
          pendingText={isTransfer ? t('transactionForm.creatingTransfer') : t('transactionForm.creatingTransaction')}
        >
          {isTransfer ? t('transactionForm.createTransfer') : t('transactionForm.createTransaction')}
        </SubmitButton>
        <div className="flex gap-2 sm:contents">
          {!isTransfer ? (
            <SubmitButton
              type="submit"
              name="add_next"
              value="true"
              variant="outline"
              disabled={!canSubmit}
              className="h-11 flex-1 rounded-xl sm:h-9 sm:flex-none sm:rounded-lg"
              pendingText={t('transactionForm.saving')}
            >
              {t('transactionForm.saveAndAddNext')}
            </SubmitButton>
          ) : null}
          {onCancel ? (
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              className="h-11 flex-1 rounded-xl sm:h-9 sm:flex-none sm:rounded-lg"
            >
              {t('transactionForm.cancel')}
            </Button>
          ) : cancelHref ? (
            <Link
              href={cancelHref}
              className={cn(
                buttonVariants({ variant: 'outline' }),
                'h-11 flex-1 rounded-xl sm:h-9 sm:flex-none sm:rounded-lg'
              )}
            >
              {t('transactionForm.cancel')}
            </Link>
          ) : null}
        </div>
      </div>
    </form>
  )
}
