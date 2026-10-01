'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { Check, ChevronRight } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { SelectorSheet } from '@/components/selector-sheet'
import { getAccountVisual } from '@/lib/account-display'
import { nativeSelectCls } from '@/lib/form-styles'
import { useUiTranslation } from '@/lib/i18n/use-ui-translation'
import { cn } from '@/lib/utils'

export type PickerOption = {
  value: string
  label: string
  /** Extra text the search matches (e.g. a subcategory's parent name). */
  searchText?: string
  /** Shown before the label, e.g. a category emoji. */
  icon?: string | null
  /** One level in, under the option above it (a subcategory under its parent). */
  indent?: boolean
}

export type PickerGroup = {
  /** Section header; omit for an ungrouped list. */
  label?: string
  options: PickerOption[]
}

/** Case- and accent-insensitive, so "credito" finds "Crédito". */
function normalize(text: string) {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/**
 * A form field for a long list (MQ-008): a budget line's category out of
 * ~60, a goal's or debt's account out of ~20.
 *
 * On a phone a native `<select>` opened Android's full-screen picker — a flat
 * list with no search, subcategories spelled "Parent / Child" and accounts in
 * no order, so choosing meant scrolling up and down a long column. Here the
 * phone gets the `SelectorSheet` the transaction form's Account / Category /
 * Payee rows already use: full screen, a search field pinned under the header,
 * grouped and indented options. From `sm` up the platform `<select>` is kept,
 * with `<optgroup>`s — on a desktop it already types-to-find and opens in place.
 *
 * Both write the same state; the value is posted through one hidden input, so
 * a server action reads `name` exactly as it did from the `<select>`.
 */
export function SearchablePicker({
  id,
  name,
  value,
  onChange,
  groups,
  placeholder,
  title,
  searchPlaceholder,
  noneLabel,
  disabled,
}: {
  id: string
  /** Form field name for the hidden input; omit when the caller posts it itself. */
  name?: string
  value: string
  onChange: (value: string) => void
  groups: PickerGroup[]
  placeholder: string
  /** Header of the phone sheet; usually the field's label. */
  title: string
  searchPlaceholder: string
  /**
   * An explicit empty choice ("No linked account"); omit when one is required.
   * There is no `required` prop on purpose: below `sm` the `<select>` is
   * `display: none`, and a required control the browser cannot focus blocks
   * the submit without showing why. The server action validates instead.
   */
  noneLabel?: string
  disabled?: boolean
}) {
  const ui = useUiTranslation()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const selected = useMemo(() => {
    for (const group of groups) {
      const option = group.options.find((o) => o.value === value)
      if (option) return option
    }
    return null
  }, [groups, value])

  const visibleGroups = useMemo(() => {
    const needle = normalize(query.trim())
    if (!needle) return groups
    return groups
      .map((group) => ({
        ...group,
        options: group.options.filter((option) =>
          normalize(
            `${option.label} ${option.searchText ?? ''} ${group.label ? ui(group.label) : ''}`
          ).includes(needle)
        ),
      }))
      .filter((group) => group.options.length > 0)
  }, [groups, query, ui])

  function close() {
    setOpen(false)
    setQuery('')
  }

  function choose(next: string) {
    onChange(next)
    close()
  }

  const optionLabel = (option: PickerOption) =>
    option.icon ? `${option.icon} ${option.label}` : option.label

  return (
    <>
      {name ? <input type="hidden" name={name} value={value} /> : null}

      {/* sm and up: the platform select, grouped. */}
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className={cn(nativeSelectCls, 'hidden sm:block')}
      >
        {noneLabel !== undefined ? (
          <option value="">{ui(noneLabel)}</option>
        ) : (
          <option value="" disabled>
            {ui(placeholder)}
          </option>
        )}
        {groups.map((group, index) =>
          group.label ? (
            <optgroup key={group.label} label={ui(group.label)}>
              {group.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.indent ? '   ' : ''}
                  {optionLabel(option)}
                </option>
              ))}
            </optgroup>
          ) : (
            group.options.map((option) => (
              <option key={`${index}-${option.value}`} value={option.value}>
                {option.indent ? '   ' : ''}
                {optionLabel(option)}
              </option>
            ))
          )
        )}
      </select>

      {/* Phone: a row that opens the full-screen sheet. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-label={`${ui(title)}: ${selected ? optionLabel(selected) : ui(noneLabel ?? placeholder)}`}
        className={cn(nativeSelectCls, 'flex items-center gap-2 text-left sm:hidden')}
      >
        <span className={cn('min-w-0 flex-1 truncate', !selected && 'text-muted-foreground')}>
          {selected ? optionLabel(selected) : ui(noneLabel ?? placeholder)}
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>

      <SelectorSheet
        open={open}
        onClose={close}
        title={ui(title)}
        search={
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
          />
        }
      >
        <div className="space-y-3">
          {noneLabel !== undefined && !query.trim() ? (
            <PickerRow label={ui(noneLabel)} selected={value === ''} onSelect={() => choose('')} />
          ) : null}
          {visibleGroups.map((group, index) => (
            <div key={group.label ?? index}>
              {group.label ? (
                <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {ui(group.label)}
                </p>
              ) : null}
              {group.options.map((option) => (
                <PickerRow
                  key={option.value}
                  label={optionLabel(option)}
                  indent={option.indent && !query.trim()}
                  selected={value === option.value}
                  onSelect={() => choose(option.value)}
                />
              ))}
            </div>
          ))}
          {visibleGroups.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">{ui('No matches')}</p>
          ) : null}
        </div>
      </SelectorSheet>
    </>
  )
}

function PickerRow({
  label,
  selected,
  indent,
  onSelect,
}: {
  label: ReactNode
  selected: boolean
  indent?: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'flex w-full items-center gap-2 rounded-lg px-2 py-2.5 text-left text-sm',
        indent && 'pl-7',
        selected ? 'bg-primary/10 font-medium text-primary' : 'active:bg-muted'
      )}
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {selected ? <Check className="size-4 shrink-0" aria-hidden="true" /> : null}
    </button>
  )
}

const ACCOUNT_TYPE_ORDER = ['cash', 'checking', 'savings', 'credit_card', 'debt', 'investment', 'other']

/**
 * Accounts grouped by type (Checking, Savings, Credit card…) in the order the
 * Accounts screen uses, each labelled "Name · Institution · Currency". The
 * group labels are the English type names; the picker translates them.
 */
export function accountPickerGroups(
  accounts: {
    id: string
    name: string
    account_type: string
    currency_code: string
    institution_name?: string | null
  }[]
): PickerGroup[] {
  const byType = new Map<string, PickerOption[]>()
  for (const account of accounts) {
    const options = byType.get(account.account_type) ?? []
    options.push({
      value: account.id,
      label: [account.name, account.institution_name, account.currency_code].filter(Boolean).join(' · '),
    })
    byType.set(account.account_type, options)
  }
  const rank = (type: string) => {
    const index = ACCOUNT_TYPE_ORDER.indexOf(type)
    return index === -1 ? ACCOUNT_TYPE_ORDER.length : index
  }
  return [...byType.entries()]
    .sort(([a], [b]) => rank(a) - rank(b))
    .map(([type, options]) => ({ label: getAccountVisual(type).label, options }))
}

