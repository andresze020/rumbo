'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { SlidersHorizontal } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { MultiSelectChip, type MultiSelectOption } from '@/components/multi-select-chip'
import { cn } from '@/lib/utils'

/** A date range the user can stage in the form; applied only on submit. */
type PresetOption = { label: string; dateFrom: string; dateTo: string }

type ReportFiltersProps = {
  view: string
  selectedType: string
  selectedAccountIds: string[]
  selectedCategoryIds: string[]
  selectedTagIds: string[]
  resolvedDateFrom: string
  resolvedDateTo: string
  hasActiveFilters: boolean
  accountOptions: MultiSelectOption[]
  categoryOptions: MultiSelectOption[]
  tagOptions: MultiSelectOption[]
  presetOptions: PresetOption[]
}

const TYPE_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
] as const

const chipLabelClassName =
  'flex h-9 shrink-0 items-center gap-1.5 rounded-lg border bg-background px-2.5'

export function ReportFilters({
  view,
  selectedType,
  selectedAccountIds,
  selectedCategoryIds,
  selectedTagIds,
  resolvedDateFrom,
  resolvedDateTo,
  hasActiveFilters,
  accountOptions,
  categoryOptions,
  tagOptions,
  presetOptions,
}: ReportFiltersProps) {
  const typeRef = useRef<HTMLInputElement>(null)
  const [moreOpen, setMoreOpen] = useState(false)
  // Only one option list at a time — their panels overlap otherwise.
  const [openChip, setOpenChip] = useState<null | 'account' | 'category' | 'tag'>(null)
  // Staged range: a preset writes here and only reaches the server on Apply.
  const [dateFrom, setDateFrom] = useState(resolvedDateFrom)
  const [dateTo, setDateTo] = useState(resolvedDateTo)
  // The chips' selections, staged here so the summary a chip shows and the
  // checkboxes it submits are the same value. This bar submits natively, so a
  // full page load re-seeds them; there is nothing to sync mid-session.
  const [accountDraft, setAccountDraft] = useState(selectedAccountIds)
  const [categoryDraft, setCategoryDraft] = useState(selectedCategoryIds)
  const [tagDraft, setTagDraft] = useState(selectedTagIds)

  function selectType(form: HTMLFormElement | null, value: string) {
    if (!form) return
    if (typeRef.current) typeRef.current.value = value
    form.requestSubmit()
  }

  const moreFiltersCount =
    selectedAccountIds.length + selectedCategoryIds.length + selectedTagIds.length

  return (
    <form method="get" action="/dashboard/reports" className="space-y-2.5">
      <input type="hidden" name="type" ref={typeRef} defaultValue={selectedType} />
      <input type="hidden" name="view" value={view} />

      {/* ── Primary bar: type toggle · mobile filters toggle ──────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex shrink-0 rounded-lg border bg-background p-0.5">
          {TYPE_OPTIONS.map((option) => {
            const isActive = selectedType === option.value
            return (
              <button
                key={option.value}
                type="button"
                onClick={(e) => selectType(e.currentTarget.form, option.value)}
                aria-pressed={isActive}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {option.label}
              </button>
            )
          })}
        </div>

        <button
          type="button"
          onClick={() => setMoreOpen((v) => !v)}
          aria-expanded={moreOpen}
          className={cn(
            buttonVariants({ variant: moreFiltersCount > 0 ? 'secondary' : 'outline', size: 'sm' }),
            'gap-1.5 sm:hidden'
          )}
        >
          <SlidersHorizontal className="size-4" aria-hidden="true" />
          Filters
          {moreFiltersCount > 0 ? (
            <span className="flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
              {moreFiltersCount}
            </span>
          ) : null}
        </button>

        {hasActiveFilters ? (
          <Link
            href="/dashboard/reports"
            className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'ml-auto')}
          >
            Clear all
          </Link>
        ) : null}
      </div>

      {/* ── Secondary bar: account/category/tag + date range ──────────────── */}
      <div className={cn('flex-col gap-2.5 sm:flex', moreOpen ? 'flex' : 'hidden')}>
        <div className="flex flex-wrap items-center gap-2">
          <MultiSelectChip
            label="Account"
            name="account_id"
            options={accountOptions}
            selected={accountDraft}
            onSelectedChange={setAccountDraft}
            open={openChip === 'account'}
            onOpenChange={(next) => setOpenChip(next ? 'account' : null)}
          />
          <MultiSelectChip
            label="Category"
            name="category_id"
            options={categoryOptions}
            selected={categoryDraft}
            onSelectedChange={setCategoryDraft}
            open={openChip === 'category'}
            onOpenChange={(next) => setOpenChip(next ? 'category' : null)}
          />
          {tagOptions.length > 0 || selectedTagIds.length > 0 ? (
            <MultiSelectChip
              label="Tags"
              name="tag_id"
              options={tagOptions}
              selected={tagDraft}
              onSelectedChange={setTagDraft}
              open={openChip === 'tag'}
              onOpenChange={(next) => setOpenChip(next ? 'tag' : null)}
            />
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {presetOptions.map((preset) => {
            const isActive = dateFrom === preset.dateFrom && dateTo === preset.dateTo
            return (
              <button
                key={preset.label}
                type="button"
                onClick={() => {
                  setDateFrom(preset.dateFrom)
                  setDateTo(preset.dateTo)
                }}
                aria-pressed={isActive}
                className={buttonVariants({
                  variant: isActive ? 'default' : 'outline',
                  size: 'sm',
                })}
              >
                {preset.label}
              </button>
            )
          })}

          {/* Controlled, so a preset click shows up here immediately and the
              pair always submits exactly what the user sees. */}
          <label className={chipLabelClassName}>
            <span className="text-xs font-medium text-muted-foreground">From</span>
            <input
              type="date"
              name="date_from"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
              className="bg-transparent text-sm text-foreground outline-none"
              aria-label="From date"
            />
          </label>

          <label className={chipLabelClassName}>
            <span className="text-xs font-medium text-muted-foreground">To</span>
            <input
              type="date"
              name="date_to"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
              className="bg-transparent text-sm text-foreground outline-none"
              aria-label="To date"
            />
          </label>

          <button type="submit" className={cn(buttonVariants({ size: 'sm' }), 'ml-auto')}>
            Apply filters
          </button>
        </div>
      </div>
    </form>
  )
}
