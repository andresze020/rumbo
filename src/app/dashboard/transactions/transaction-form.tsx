'use client'

import Link from 'next/link'
import { type ReactNode, useEffect, useMemo, useState } from 'react'
import {
  ArrowDownRight,
  ArrowLeftRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronDown,
  FileText,
  ListChecks,
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
import { CategoryPicker } from './category-picker'
import { PayeePicker, type PayeeOption } from './payee-picker'
import { AdvancedFields } from '@/components/advanced-fields'
import { AmountInput } from '@/components/amount-input'
import { DateField, SegmentedField, SelectField } from '@/components/form-field'
import { InfoTooltip } from '@/components/info-tooltip'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { SubmitButton } from '@/components/submit-button'
import { fetchFxRate } from '@/lib/fx'
import { formatCurrency } from '@/lib/format'
import { useLanguage } from '@/components/language-provider'
import { RECURRING_FREQUENCIES } from '@/lib/recurring/shared'
import { cn } from '@/lib/utils'

type TransactionType = 'income' | 'expense' | 'transfer'

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
}

type TransactionFormProps = {
  accounts: TransactionFormAccount[]
  baseCurrency: string
  cancelHref?: string
  onCancel?: () => void
  categories: TransactionFormCategory[]
  payees: PayeeOption[]
  defaultDate: string
  defaultAccountId?: string
  defaultType?: TransactionType
  defaultStatus?: string
  defaultAmount?: string
  defaultCategoryId?: string
  defaultDescription?: string
  defaultMerchantName?: string
  returnTo?: string
}

const LAST_ACCOUNT_KEY = 'af_last_account_id'
const CATEGORY_USAGE_KEY = 'af_category_usage'

function lastCategoryKey(transactionType: TransactionType) {
  return `af_last_category_id_${transactionType}`
}

function formatAccountLabel(account: TransactionFormAccount) {
  const label = [account.name, account.institution_name || null, account.currency_code]
    .filter(Boolean)
    .join(' · ')
  return account.icon ? `${account.icon} ${label}` : label
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
  defaultDate,
  defaultAccountId,
  defaultType,
  defaultStatus,
  defaultAmount,
  defaultCategoryId,
  defaultDescription,
  defaultMerchantName,
  returnTo,
}: TransactionFormProps) {
  const { t } = useLanguage()
  const [transactionType, setTransactionType] = useState<TransactionType>(defaultType ?? 'expense')
  const [transactionDate, setTransactionDate] = useState(defaultDate)
  const [accountId, setAccountId] = useState(defaultAccountId ?? '')
  const [fromAccountId, setFromAccountId] = useState('')
  const [toAccountId, setToAccountId] = useState('')
  const [categoryId, setCategoryId] = useState(defaultCategoryId ?? '')
  const [amountInput, setAmountInput] = useState(defaultAmount ?? '')
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
  const [notes, setNotes] = useState('')
  // Which mobile row is expanded for editing (accordion; null = all collapsed).
  const [expandedField, setExpandedField] = useState<string | null>(null)
  const isMobile = useIsMobile()

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

  // Apply remembered account/category defaults from previous submissions, once,
  // only when the caller hasn't supplied explicit defaults of their own.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const frame = window.requestAnimationFrame(() => {
      if (!defaultAccountId) {
        const lastAccountId = window.localStorage.getItem(LAST_ACCOUNT_KEY)
        if (lastAccountId && accounts.some((a) => a.id === lastAccountId)) {
          setAccountId((current) => current || lastAccountId)
        }
      }
      if (!defaultCategoryId) {
        const lastCategoryId = window.localStorage.getItem(lastCategoryKey(transactionType))
        if (lastCategoryId && categories.some((c) => c.id === lastCategoryId)) {
          setCategoryId((current) => current || lastCategoryId)
        }
      }
    })

    return () => window.cancelAnimationFrame(frame)
    // Only run on initial mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const selectedAccount = accounts.find((a) => a.id === accountId)
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

  const compatibleCategories = useMemo(
    () =>
      categories.filter(
        (c) => transactionType !== 'transfer' && c.category_type === transactionType
      ),
    [categories, transactionType]
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
  const selectedFromAccount = accounts.find((a) => a.id === fromAccountId)
  const selectedToAccount = accounts.find((a) => a.id === toAccountId)
  const amountCurrencyCode =
    (isTransfer ? selectedFromAccount?.currency_code : selectedAccount?.currency_code) ??
    baseCurrency
  const isCrossCurrencyTransfer =
    Boolean(selectedFromAccount && selectedToAccount) &&
    selectedFromAccount?.currency_code !== selectedToAccount?.currency_code
  const isTransferNonBaseCurrency =
    isTransfer &&
    !isCrossCurrencyTransfer &&
    Boolean(selectedFromAccount) &&
    selectedFromAccount?.currency_code !== baseCurrency
  const submitAction = isTransfer
    ? createTransferTransactionAction
    : createManualTransactionAction
  const canSubmit = isTransfer
    ? accounts.length >= 2 &&
      Boolean(fromAccountId) &&
      Boolean(toAccountId) &&
      !isCrossCurrencyTransfer &&
      (!isTransferNonBaseCurrency || rateIsValid)
    : compatibleCategories.length > 0 &&
      Boolean(categoryId) &&
      (!isMultiCurrency || rateIsValid)

  useEffect(() => {
    if (!isMultiCurrency || !selectedAccount || !transactionDate) return
    void autoFetch(selectedAccount.currency_code, transactionDate)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, transactionDate])

  useEffect(() => {
    if (!isTransferNonBaseCurrency || !selectedFromAccount || !transactionDate) return
    void autoFetch(selectedFromAccount.currency_code, transactionDate)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromAccountId, transactionDate])

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

  function rememberDefaults() {
    if (typeof window === 'undefined' || isTransfer) return
    if (accountId) window.localStorage.setItem(LAST_ACCOUNT_KEY, accountId)
    if (!categoryId) return
    window.localStorage.setItem(lastCategoryKey(transactionType), categoryId)
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

  // Shared date field — placed inside each essentials grid below so it pairs
  // with the account selector on the same row.
  const dateField = (
    <DateField
      id="transaction_date"
      name="transaction_date"
      label={t('transactionForm.date')}
      value={transactionDate}
      onChange={(e) => {
        setTransactionDate(e.target.value)
        if (isMultiCurrency) {
          setUserRate('')
          setFxNote('')
          setFxError('')
        }
      }}
      required
    />
  )

  // Shared status segmented control, paired with another compact field in the
  // essentials grid.
  const statusField = (
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
  )

  // Exchange-rate block, shared by the transfer and single-account paths. Stays
  // outside the "More details" collapse because the rate is required to submit a
  // non-base-currency entry, so it must always be visible.
  function fxFields(account: TransactionFormAccount | undefined) {
    if (!account) return null
    return (
      <AdvancedFields
        defaultOpen
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
  const selectedCategory = categories.find((c) => c.id === categoryId)
  const categoryValue = selectedCategory
    ? `${selectedCategory.icon ? `${selectedCategory.icon} ` : ''}${selectedCategory.name}`
    : ''
  // Two-level category selection for the mobile inline list.
  const mobileParentCategories = compatibleCategories.filter(
    (c) => c.parent_category_id === null
  )
  const mobileCurrentParentId =
    selectedCategory?.parent_category_id ?? selectedCategory?.id ?? ''
  const mobileChildCategories = compatibleCategories.filter(
    (c) => c.parent_category_id === mobileCurrentParentId
  )
  const repeatValue =
    RECURRING_FREQUENCIES.find((f) => f.value === recurringFrequency)?.label ??
    t('transactionForm.repeatNever')
  const statusValue =
    status === 'pending' ? t('transactionForm.statusPending') : t('transactionForm.statusPosted')

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
          onClick={() => setExpandedField(open ? null : id)}
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

  const mobileFields = (
    <div className="rounded-xl border px-2">
      {editRow({
        id: 'date',
        icon: <CalendarDays className="size-4.5" />,
        label: t('transactionForm.date'),
        value: transactionDate,
        placeholder: '—',
        children: dateField,
      })}

      {isTransfer ? (
        <>
          {editRow({
            id: 'from',
            icon: <Wallet className="size-4.5" />,
            label: t('transactionForm.fromAccount'),
            value: selectedFromAccount ? formatAccountLabel(selectedFromAccount) : '',
            placeholder: t('transactionForm.selectSource'),
            children: (
              <>
                <input type="hidden" name="from_account_id" value={fromAccountId} />
                {optionList(
                  accounts.map((a) => ({
                    value: a.id,
                    label: formatAccountLabel(a),
                    disabled: a.id === toAccountId,
                  })),
                  fromAccountId,
                  (value) => {
                    setFromAccountId(value)
                    if (value === toAccountId) setToAccountId('')
                    setExpandedField(null)
                  }
                )}
              </>
            ),
          })}
          {editRow({
            id: 'to',
            icon: <Wallet className="size-4.5" />,
            label: t('transactionForm.toAccount'),
            value: selectedToAccount ? formatAccountLabel(selectedToAccount) : '',
            placeholder: t('transactionForm.selectDestination'),
            children: (
              <>
                <input type="hidden" name="to_account_id" value={toAccountId} />
                {optionList(
                  accounts.map((a) => ({
                    value: a.id,
                    label: formatAccountLabel(a),
                    disabled: a.id === fromAccountId,
                  })),
                  toAccountId,
                  (value) => {
                    setToAccountId(value)
                    if (value === fromAccountId) setFromAccountId('')
                    setExpandedField(null)
                  }
                )}
              </>
            ),
          })}
        </>
      ) : (
        <>
          {editRow({
            id: 'account',
            icon: <Wallet className="size-4.5" />,
            label: t('transactionForm.account'),
            value: selectedAccount ? formatAccountLabel(selectedAccount) : '',
            placeholder: t('transactionForm.selectAccount'),
            children: (
              <>
                <input type="hidden" name="account_id" value={accountId} />
                {optionList(
                  accounts.map((a) => ({ value: a.id, label: formatAccountLabel(a) })),
                  accountId,
                  (value) => {
                    setAccountId(value)
                    setUserRate('')
                    setFxNote('')
                    setFxError('')
                    setExpandedField(null)
                  }
                )}
              </>
            ),
          })}
          {editRow({
            id: 'category',
            icon: <Shapes className="size-4.5" />,
            label: 'Category',
            value: categoryValue,
            placeholder: 'Select category',
            children: (
              <>
                <input type="hidden" name="category_id" value={categoryId} />
                {optionList(
                  mobileParentCategories.map((c) => ({
                    value: c.id,
                    label: c.name,
                    icon: c.icon,
                  })),
                  mobileCurrentParentId,
                  (parentId) => {
                    const kids = compatibleCategories.filter(
                      (c) => c.parent_category_id === parentId
                    )
                    setCategoryId(parentId)
                    // A parent with no subcategories is a complete choice; one
                    // with children keeps the row open to pick the subcategory.
                    if (kids.length === 0) setExpandedField(null)
                  }
                )}

                {mobileChildCategories.length > 0 ? (
                  <>
                    <p className="px-2 pt-3 pb-1 text-xs font-medium text-muted-foreground">
                      Subcategory
                    </p>
                    {optionList(
                      [
                        { value: mobileCurrentParentId, label: 'General' },
                        ...mobileChildCategories.map((c) => ({
                          value: c.id,
                          label: c.name,
                          icon: c.icon,
                        })),
                      ],
                      categoryId,
                      (value) => {
                        setCategoryId(value)
                        setExpandedField(null)
                      }
                    )}
                  </>
                ) : null}

                {frequentCategories.length > 0 ? (
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">{t('transactionForm.frequentlyUsed')}</span>
                    {frequentCategories.map((category) => (
                      <button
                        key={category.id}
                        type="button"
                        onClick={() => {
                          setCategoryId(category.id)
                          setExpandedField(null)
                        }}
                        className={cn(
                          'flex h-8 items-center gap-1 rounded-full border px-3 text-xs font-medium transition-colors',
                          categoryId === category.id
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'
                        )}
                      >
                        {category.icon ? <span aria-hidden="true">{category.icon}</span> : null}
                        {category.name}
                      </button>
                    ))}
                  </div>
                ) : null}
              </>
            ),
          })}
          {editRow({
            id: 'payee',
            icon: <Store className="size-4.5" />,
            label: t(transactionType === 'income' ? 'transactionForm.payer' : 'transactionForm.payee'),
            value: payeeName,
            placeholder: '—',
            children: (
              <PayeePicker
                payees={payees}
                value={payeeName}
                onValueChange={setPayeeName}
                label={t(transactionType === 'income' ? 'transactionForm.payer' : 'transactionForm.payee')}
                helpText={t('transactionForm.payeeHelp')}
                inputId="payee_name"
              />
            ),
          })}
          {editRow({
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
                    ...RECURRING_FREQUENCIES.map((f) => ({ value: f.value, label: f.label })),
                  ],
                  recurringFrequency,
                  (value) => {
                    setRecurringFrequency(value)
                    setExpandedField(null)
                  }
                )}
              </>
            ),
          })}
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
      {editRow({
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
      })}
      {editRow({
        id: 'status',
        icon: <ListChecks className="size-4.5" />,
        label: t('transactionForm.status'),
        value: statusValue,
        placeholder: '',
        children: statusField,
      })}

      {isTransfer && accounts.length < 2 ? (
        <p className="border-t px-1 py-3 text-sm text-muted-foreground">
          {t('transactionForm.needTwoAccounts')}
        </p>
      ) : null}
      {isCrossCurrencyTransfer ? (
        <p className="border-t px-1 py-3 text-sm text-destructive">
          {t('transactionForm.crossCurrencyNotSupported')}
        </p>
      ) : null}
    </div>
  )

  return (
    <form action={submitAction} onSubmit={rememberDefaults} className="space-y-3">
      {returnTo ? <input type="hidden" name="return_to" value={returnTo} /> : null}

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

      {/* ── Amount hero ──────────────────────────────────────────────── */}
      <div className="rounded-2xl border bg-muted/30 p-3">
        <div className="flex items-center justify-between">
          <Label
            htmlFor="amount"
            className="text-xs font-medium uppercase tracking-wider text-muted-foreground"
          >
            {t('transactionForm.amount')}
          </Label>
          <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground">
            {amountCurrencyCode}
          </span>
        </div>
        <AmountInput
          id="amount"
          name="amount"
          currencyCode={amountCurrencyCode}
          value={amountInput}
          onValueChange={setAmountInput}
          size="lg"
          withCalculator
          required
          className="mt-1.5"
        />
      </div>

      {/* ── Fields: mobile row-list vs desktop two-column grid ─────────── */}
      {isMobile ? mobileFields : (
      <>
      {isTransfer ? (
        <div className="grid grid-cols-2 gap-3">
          <SelectField
            id="from_account_id"
            name="from_account_id"
            label={t('transactionForm.fromAccount')}
            leading={accountLeading(selectedFromAccount)}
            required
            value={fromAccountId}
            onChange={(e) => {
              const next = e.target.value
              setFromAccountId(next)
              if (next === toAccountId) setToAccountId('')
            }}
          >
            <option value="" disabled>{t('transactionForm.selectSource')}</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id} disabled={a.id === toAccountId}>
                {formatAccountLabel(a)}
              </option>
            ))}
          </SelectField>

          <SelectField
            id="to_account_id"
            name="to_account_id"
            label={t('transactionForm.toAccount')}
            leading={accountLeading(selectedToAccount)}
            required
            value={toAccountId}
            onChange={(e) => {
              const next = e.target.value
              setToAccountId(next)
              if (next === fromAccountId) setFromAccountId('')
            }}
          >
            <option value="" disabled>{t('transactionForm.selectDestination')}</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id} disabled={a.id === fromAccountId}>
                {formatAccountLabel(a)}
              </option>
            ))}
          </SelectField>

          {dateField}
          {statusField}

          {/* Description: kept essential (visible on mobile too). */}
          <div className="space-y-1.5 col-span-2">
            <Label htmlFor="description">{t('transactionForm.description')}</Label>
            <Input id="description" name="description" defaultValue={defaultDescription} />
          </div>

          {accounts.length < 2 ? (
            <p className="text-sm text-muted-foreground col-span-2">
              {t('transactionForm.needTwoAccounts')}
            </p>
          ) : null}

          {isCrossCurrencyTransfer ? (
            <p className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive col-span-2">
              {t('transactionForm.crossCurrencyNotSupported')}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <SelectField
            id="account_id"
            name="account_id"
            label={t('transactionForm.account')}
            leading={accountLeading(selectedAccount)}
            required
            value={accountId}
            onChange={(e) => {
              setAccountId(e.target.value)
              setUserRate('')
              setFxNote('')
              setFxError('')
            }}
          >
            <option value="" disabled>{t('transactionForm.selectAccount')}</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {formatAccountLabel(a)}
              </option>
            ))}
          </SelectField>

          {dateField}

          <div className="space-y-1.5 col-span-2">
            <CategoryPicker
              key={transactionType}
              categories={compatibleCategories}
              transactionType={transactionType}
              onCategoryChange={setCategoryId}
              selectedCategoryId={categoryId}
            />

            {frequentCategories.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-muted-foreground">{t('transactionForm.frequentlyUsed')}</span>
                {frequentCategories.map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => setCategoryId(category.id)}
                    className={cn(
                      'flex h-8 items-center gap-1 rounded-full border px-3 text-xs font-medium transition-colors',
                      categoryId === category.id
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                  >
                    {category.icon ? <span aria-hidden="true">{category.icon}</span> : null}
                    {category.name}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {/* Description & Payee: kept essential (visible on mobile too) and
              full-width so they're comfortable to type into. */}
          <div className="space-y-1.5 col-span-2">
            <Label htmlFor="description">{t('transactionForm.description')}</Label>
            <Input id="description" name="description" defaultValue={defaultDescription} />
          </div>

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

          {/* UC-10: turn a normal entry into a recurring one. Kept essential so
              the recurring feature is discoverable. Transfers are not supported
              as recurring templates yet, so this is income/expense only. */}
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
                  {frequency.label}
                </option>
              ))}
            </SelectField>
          </div>

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

        <div className={cn('space-y-1.5 sm:block', showMoreDetails ? 'block' : 'hidden')}>
          <Label htmlFor="notes">{t('transactionForm.notes')}</Label>
          <Textarea id="notes" name="notes" rows={2} />
        </div>
      </div>
      </>
      )}

      {/* ── Exchange rate (only for non-base-currency entries) ────────── */}
      {isTransfer ? (
        isCrossCurrencyTransfer ? null : isTransferNonBaseCurrency ? (
          fxFields(selectedFromAccount)
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
