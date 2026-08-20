'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUiTranslation } from '@/lib/i18n/use-ui-translation'

export type MultiSelectOption = { id: string; label: string; isArchived?: boolean }

/** Above this many options the panel grows a type-to-filter box. */
const FILTER_THRESHOLD = 8

/**
 * A compact `<details>` chip holding a checkbox list, used in the Transactions
 * and Reports filter bars.
 *
 * The selection is **controlled**: the parent owns the draft and builds the
 * query from it. This component used to keep its own draft while the parent
 * read the checkboxes back out of the form on submit, which gave one selection
 * two sources of truth — a tick could show in the summary here and never reach
 * the query, silently dropping the filter. The checkboxes still carry `name`,
 * so the plain GET form stays a working no-JS fallback.
 */
export function MultiSelectChip({
  label,
  name,
  options,
  selected,
  onSelectedChange,
  open,
  onOpenChange,
}: {
  label: string
  name: string
  options: MultiSelectOption[]
  /** The draft selection, owned by the parent. */
  selected: string[]
  onSelectedChange: (selected: string[]) => void
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
  const rootRef = useRef<HTMLDetailsElement>(null)
  const [query, setQuery] = useState('')

  // A panel that only closes by clicking its own chip again is a trap: it hangs
  // over the results the moment attention moves elsewhere. Listening for click
  // rather than pointerdown leaves the element under the finger its own click
  // first — on phones this panel sits in the layout flow, and collapsing it
  // early would shift whatever was being tapped out from under the tap.
  useEffect(() => {
    // Closes in either mode: the native property when uncontrolled, the
    // parent's state when controlled.
    const close = () => {
      const element = rootRef.current
      if (!element?.open) return
      if (isControlled) onOpenChange(false)
      else element.open = false
    }
    const onClick = (event: MouseEvent) => {
      const element = rootRef.current
      if (!element?.open) return
      const target = event.target instanceof Element ? event.target : null
      if (!target) return
      // The chip's own summary toggles itself; anything inside the panel is the
      // user still working in it.
      if (element.contains(target)) return
      // A click on a *sibling* chip is a swap, and the parent handles it by
      // moving its single open-chip state. Closing from here too would race
      // that update and leave both panels shut.
      if (target.closest('details')) return
      close()
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !rootRef.current?.open) return
      close()
      // Leave focus where the panel can be re-opened, not adrift at the top of
      // the document.
      rootRef.current.querySelector('summary')?.focus()
    }
    document.addEventListener('click', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('click', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [isControlled, onOpenChange])

  // A leftover query would hide most of the list the next time this opens.
  // Cleared during render rather than in an effect, per
  // https://react.dev/learn/you-might-not-need-an-effect.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (!open) setQuery('')
  }

  function toggle(id: string, isChecked: boolean) {
    onSelectedChange(
      isChecked ? [...selected, id] : selected.filter((entry) => entry !== id)
    )
  }

  const summary =
    selected.length === 0
      ? ui('All')
      : selected.length === 1
        ? options.find((o) => o.id === selected[0])?.label ?? ui('{1} selected', [1])
        : ui('{1} selected', [selected.length])

  const search = query.trim().toLowerCase()
  const isMatch = (option: MultiSelectOption) =>
    !search || option.label.toLowerCase().includes(search)
  const matchCount = options.filter(isMatch).length

  return (
    // Full-width disclosure row on phones, compact chip from `sm` up: a row of
    // truncated chips is unusable on a narrow screen, and a floating panel has
    // nowhere to float inside a bottom sheet.
    <details
      ref={rootRef}
      className="group relative w-full shrink-0 sm:w-auto"
      open={isControlled ? open : undefined}
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
      {/* Header and list are separate boxes so only the list scrolls — a filter
          field that scrolls out of reach helps nobody. */}
      <div className="static mt-1.5 w-full rounded-xl border bg-popover p-1 sm:absolute sm:z-20 sm:mt-1 sm:w-56 sm:rounded-lg sm:shadow-md">
        {options.length > FILTER_THRESHOLD ? (
          <div className="relative p-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={ui('Search options')}
              aria-label={ui('Search options')}
              className="h-9 w-full rounded-lg border bg-background pl-7 pr-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:h-8"
            />
          </div>
        ) : null}

        {selected.length > 0 ? (
          <div className="flex items-center justify-between gap-2 px-2 py-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {ui('{1} selected', [selected.length])}
            </span>
            <button
              type="button"
              onClick={() => onSelectedChange([])}
              className="rounded-md px-1.5 py-0.5 text-xs font-medium text-primary transition-colors hover:bg-accent"
            >
              {ui('Clear')}
            </button>
          </div>
        ) : null}

        <div className="max-h-60 overflow-auto">
          {options.length === 0 ? (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">{ui('No options')}</p>
          ) : (
            <>
              {matchCount === 0 ? (
                <p className="px-2 py-1.5 text-sm text-muted-foreground">
                  {ui('No matches')}
                </p>
              ) : null}
              {options.map((option) => (
                <label
                  key={option.id}
                  // Filtered-out rows are hidden, not unmounted, so the no-JS
                  // fallback still submits a tick that a query scrolled past.
                  className={cn(
                    'flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2.5 text-sm hover:bg-accent sm:py-1.5',
                    !isMatch(option) && 'hidden'
                  )}
                >
                  <input
                    type="checkbox"
                    name={name}
                    value={option.id}
                    checked={selected.includes(option.id)}
                    onChange={(e) => toggle(option.id, e.currentTarget.checked)}
                    className="size-4 shrink-0 accent-primary sm:size-3.5"
                  />
                  <span className="truncate">
                    {option.label}
                    {option.isArchived ? ' (archived)' : ''}
                  </span>
                </label>
              ))}
            </>
          )}
        </div>
      </div>
    </details>
  )
}
