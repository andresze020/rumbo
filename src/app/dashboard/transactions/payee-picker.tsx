'use client'

import { useId, useRef, useState } from 'react'
import { Plus, Store } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

export type PayeeOption = {
  id: string
  name: string
}

type PayeePickerProps = {
  payees: PayeeOption[]
  defaultValue?: string
  label: string
  /** Helper line explaining the "search existing or create new" behavior. */
  helpText?: string
  /** Optional explicit id (defaults to a generated one). */
  inputId?: string
}

/** Cap the rendered list so a large household doesn't paint hundreds of rows. */
const MAX_VISIBLE = 50

/** Splits `name` around the first case-insensitive `query` hit, bolding it. */
function highlightMatch(name: string, query: string) {
  if (!query) return name
  const index = name.toLowerCase().indexOf(query.toLowerCase())
  if (index === -1) return name
  return (
    <>
      {name.slice(0, index)}
      <span className="font-semibold text-foreground">
        {name.slice(index, index + query.length)}
      </span>
      {name.slice(index + query.length)}
    </>
  )
}

/**
 * Searchable combobox for the transaction form's payee field (BR-009). A text
 * input backed by a custom filtered dropdown (not a native <datalist>, whose
 * filtering is inconsistent across browsers and can't be styled or keyboard-
 * driven reliably). Typing filters existing household payees by substring; an
 * unmatched value surfaces an explicit "Create …" row and is created as a new
 * payee on submit (the server RPC normalizes and get-or-creates it). It always
 * submits `payee_name`; the backend resolves that into `payee_id` and keeps
 * `merchant_name` in sync for the existing merchant-based displays.
 */
export function PayeePicker({
  payees,
  defaultValue,
  label,
  helpText,
  inputId,
}: PayeePickerProps) {
  const generatedId = useId()
  const id = inputId ?? `payee_${generatedId}`
  const listboxId = `${id}_listbox`

  const [value, setValue] = useState(defaultValue ?? '')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const blurTimer = useRef<number | undefined>(undefined)

  const query = value.trim()
  const normalizedQuery = query.toLowerCase()

  // Filtering a household's payee names per keystroke is cheap; the React
  // Compiler memoizes the render, so no manual useMemo is needed here.
  const allMatches = normalizedQuery
    ? payees.filter((p) => p.name.toLowerCase().includes(normalizedQuery))
    : payees

  const visibleMatches = allMatches.slice(0, MAX_VISIBLE)
  const hiddenCount = allMatches.length - visibleMatches.length
  const exactMatch = payees.some((p) => p.name.toLowerCase() === normalizedQuery)
  const showCreate = query.length > 0 && !exactMatch
  // The "Create" row, when shown, sits at index === visibleMatches.length.
  const optionCount = visibleMatches.length + (showCreate ? 1 : 0)

  function commit(nextValue: string) {
    setValue(nextValue)
    setOpen(false)
    setActiveIndex(-1)
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (!open) {
        setOpen(true)
        setActiveIndex(0)
        return
      }
      setActiveIndex((i) => (optionCount ? (i + 1) % optionCount : -1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) return
      setActiveIndex((i) => (optionCount ? (i - 1 + optionCount) % optionCount : -1))
    } else if (event.key === 'Enter') {
      if (open && activeIndex >= 0) {
        event.preventDefault()
        if (activeIndex < visibleMatches.length) {
          commit(visibleMatches[activeIndex].name)
        } else if (showCreate) {
          // "Create" keeps the typed text — the backend get-or-creates it.
          setOpen(false)
          setActiveIndex(-1)
        }
      }
      // Otherwise let Enter submit the form as usual.
    } else if (event.key === 'Escape') {
      if (open) {
        event.preventDefault()
        setOpen(false)
        setActiveIndex(-1)
      }
    }
  }

  const activeOptionId =
    open && activeIndex >= 0 ? `${id}_opt_${activeIndex}` : undefined

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 z-10 flex size-5 -translate-y-1/2 items-center justify-center text-muted-foreground"
        >
          <Store className="size-4.5" />
        </span>
        <Input
          id={id}
          name="payee_name"
          value={value}
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={activeOptionId}
          autoComplete="off"
          placeholder="Search or add a payee"
          className="pl-10"
          onChange={(e) => {
            setValue(e.target.value)
            setOpen(true)
            setActiveIndex(-1)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            // Delay so an option's onMouseDown/onClick can land before close.
            blurTimer.current = window.setTimeout(() => setOpen(false), 120)
          }}
        />

        {open && optionCount > 0 ? (
          <ul
            id={listboxId}
            role="listbox"
            className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-lg border bg-popover p-1 shadow-md"
            onMouseDown={(e) => {
              // Keep input focus (prevents the blur-close from firing first).
              e.preventDefault()
              window.clearTimeout(blurTimer.current)
            }}
          >
            {visibleMatches.map((payee, index) => (
              <li
                key={payee.id}
                id={`${id}_opt_${index}`}
                role="option"
                aria-selected={index === activeIndex}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm',
                  index === activeIndex ? 'bg-accent' : 'hover:bg-accent/60'
                )}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => commit(payee.name)}
              >
                <Store className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-muted-foreground">
                  {highlightMatch(payee.name, query)}
                </span>
              </li>
            ))}

            {hiddenCount > 0 ? (
              <li className="px-2 py-1.5 text-xs text-muted-foreground">
                {hiddenCount} more — keep typing to narrow.
              </li>
            ) : null}

            {showCreate ? (
              <li
                id={`${id}_opt_${visibleMatches.length}`}
                role="option"
                aria-selected={activeIndex === visibleMatches.length}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm',
                  activeIndex === visibleMatches.length ? 'bg-accent' : 'hover:bg-accent/60'
                )}
                onMouseEnter={() => setActiveIndex(visibleMatches.length)}
                onClick={() => {
                  setOpen(false)
                  setActiveIndex(-1)
                }}
              >
                <Plus className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">
                  Create “<span className="font-semibold">{query}</span>”
                </span>
              </li>
            ) : null}
          </ul>
        ) : null}
      </div>
      {helpText ? (
        <p className="text-xs text-muted-foreground">{helpText}</p>
      ) : null}
    </div>
  )
}
