'use client'

import { useState } from 'react'
import { ChevronDown, Search } from 'lucide-react'
import { useUiTranslation } from '@/lib/i18n/use-ui-translation'

export type MultiSelectOption = { id: string; label: string; isArchived?: boolean }

/**
 * Below this many options the list is faster to read than to filter, and a
 * search box would just be one more thing between the user and a two-item
 * choice (Status has three). Above it, scanning is the slow part.
 */
const SEARCH_THRESHOLD = 8

/**
 * Accent- and case-insensitive, so "alimentacion" finds "Alimentación" and
 * "cafe" finds "Café". Typing accents on a phone keyboard is exactly the kind
 * of friction that makes a search box not worth using.
 */
function normalize(text: string) {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase()
}

/**
 * A compact `<details>` chip holding a checkbox list, used in the Transactions
 * and Reports filter bars. Draft selections are tracked locally so several
 * options can be ticked before the parent form is submitted ("Apply filters").
 * Emits a checkbox per option under `name`, so it round-trips as repeated query
 * params in a plain GET form.
 */
export function MultiSelectChip({
  label,
  name,
  options,
  selectedIds,
  open,
  onOpenChange,
}: {
  label: string
  name: string
  options: MultiSelectOption[]
  selectedIds: string[]
  /**
   * Controlled open state. Pass it (with `onOpenChange`) when several chips
   * share a row: their panels are absolutely positioned, so two open at once
   * overlap each other and the content underneath. Omit both to let the native
   * `<details>` manage itself.
   */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const ui = useUiTranslation()
  const isControlled = open !== undefined && onOpenChange !== undefined
  const [checked, setChecked] = useState<Set<string>>(() => new Set(selectedIds))
  const [query, setQuery] = useState('')

  // Uncontrolled chips manage their own `open`, so the panel state has to be
  // observed rather than read off a prop — it is what clears a stale query.
  const [detailsOpen, setDetailsOpen] = useState(false)
  const isOpen = isControlled ? open : detailsOpen

  // A query left over from last time would hide most of the list the next time
  // the chip is opened, with nothing on screen explaining why. Adjusted during
  // render rather than in an effect, like the draft selection below.
  const [wasOpen, setWasOpen] = useState(isOpen)
  if (wasOpen !== isOpen) {
    setWasOpen(isOpen)
    if (!isOpen) setQuery('')
  }

  // Re-seed the draft whenever the applied selection changes under us. The
  // transactions bar applies filters with a client-side navigation, so this
  // component is no longer remounted on every apply, and a stale draft would
  // silently re-add a filter the user had just removed. Adjusted during render
  // rather than in an effect, per
  // https://react.dev/learn/you-might-not-need-an-effect.
  const appliedKey = selectedIds.join(',')
  const [syncedKey, setSyncedKey] = useState(appliedKey)
  if (appliedKey !== syncedKey) {
    setSyncedKey(appliedKey)
    setChecked(new Set(selectedIds))
  }

  function toggle(id: string, isChecked: boolean) {
    setChecked((prev) => {
      const next = new Set(prev)
      if (isChecked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const summary =
    checked.size === 0
      ? 'All'
      : checked.size === 1
        ? options.find((o) => o.id === [...checked][0])?.label ?? '1 selected'
        : `${checked.size} selected`

  const showSearch = options.length > SEARCH_THRESHOLD
  const trimmedQuery = query.trim()
  const visibleOptions =
    showSearch && trimmedQuery
      ? options.filter((option) => normalize(option.label).includes(normalize(trimmedQuery)))
      : options

  /**
   * A ticked option the query has filtered out still has to reach the server.
   * Its checkbox is unmounted, so without these the selection would silently
   * vanish on Apply — the user searches for a second category and loses the
   * first one they picked.
   */
  const hiddenChecked = options.filter(
    (option) => checked.has(option.id) && !visibleOptions.includes(option)
  )

  return (
    // Full-width disclosure row on phones, compact chip from `sm` up: a row of
    // truncated chips is unusable on a narrow screen, and a floating panel has
    // nowhere to float inside a bottom sheet.
    <details
      className="group relative w-full shrink-0 sm:w-auto"
      open={isControlled ? open : undefined}
      onToggle={(event) => setDetailsOpen(event.currentTarget.open)}
    >
      <summary
        // With a controlled `open`, the browser's own toggle would fight the
        // prop — take over the click and report the intent instead.
        onClick={
          isControlled
            ? (event) => {
                event.preventDefault()
                onOpenChange(!open)
              }
            : undefined
        }
        className="flex h-11 cursor-pointer list-none items-center gap-1.5 rounded-xl border bg-background px-3 transition-colors hover:bg-muted/50 sm:h-9 sm:rounded-lg sm:px-2.5 [&::-webkit-details-marker]:hidden"
      >
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground sm:max-w-[120px] sm:flex-none">
          {summary}
        </span>
        <ChevronDown
          className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <div className="static mt-1.5 w-full rounded-xl border bg-popover sm:absolute sm:z-20 sm:mt-1 sm:w-56 sm:rounded-lg sm:shadow-md">
        {/* Outside the scrolling list, so it stays put while the results move
            under it. Deliberately not autofocused: on a phone that raises the
            keyboard and buries the very list the user came to read. */}
        {showSearch ? (
          <div className="relative border-b p-1.5">
            <Search
              className="pointer-events-none absolute left-4 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              type="text"
              // No `name` — this box filters the list in place and must never
              // become a query param of the filter form it is nested in.
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              // Enter in a text input submits the surrounding form, which would
              // apply the filters mid-search, before anything has been ticked.
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.preventDefault()
              }}
              placeholder={ui('Search {1}', [label.toLocaleLowerCase()])}
              aria-label={ui('Search {1}', [label.toLocaleLowerCase()])}
              className="h-9 w-full rounded-lg bg-transparent pl-7 pr-2 text-sm text-foreground outline-none placeholder:text-muted-foreground sm:h-8"
            />
          </div>
        ) : null}

        <div className="max-h-60 overflow-auto overscroll-contain p-1">
          {options.length === 0 ? (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">No options</p>
          ) : visibleOptions.length === 0 ? (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">{ui('No matches')}</p>
          ) : (
            visibleOptions.map((option) => (
              <label
                key={option.id}
                className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2.5 text-sm hover:bg-accent sm:py-1.5"
              >
                <input
                  type="checkbox"
                  name={name}
                  value={option.id}
                  checked={checked.has(option.id)}
                  onChange={(e) => toggle(option.id, e.currentTarget.checked)}
                  className="size-4 shrink-0 accent-primary sm:size-3.5"
                />
                <span className="truncate">
                  {option.label}
                  {option.isArchived ? ' (archived)' : ''}
                </span>
              </label>
            ))
          )}
        </div>

        {hiddenChecked.map((option) => (
          <input key={option.id} type="hidden" name={name} value={option.id} />
        ))}
      </div>
    </details>
  )
}
