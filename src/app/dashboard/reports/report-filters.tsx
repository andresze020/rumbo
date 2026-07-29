'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { SlidersHorizontal } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { MultiSelectChip, type MultiSelectOption } from '@/components/multi-select-chip'
import { cn } from '@/lib/utils'

type PresetLink = { label: string; href: string; isActive: boolean }

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
  presetLinks: PresetLink[]
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
  presetLinks,
}: ReportFiltersProps) {
  const typeRef = useRef<HTMLInputElement>(null)
  const [moreOpen, setMoreOpen] = useState(false)
  // Only one option list at a time — their panels overlap otherwise.
  const [openChip, setOpenChip] = useState<null | 'account' | 'category' | 'tag'>(null)

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
            selectedIds={selectedAccountIds}
            open={openChip === 'account'}
            onOpenChange={(next) => setOpenChip(next ? 'account' : null)}
          />
          <MultiSelectChip
            label="Category"
            name="category_id"
            options={categoryOptions}
            selectedIds={selectedCategoryIds}
            open={openChip === 'category'}
            onOpenChange={(next) => setOpenChip(next ? 'category' : null)}
          />
          {tagOptions.length > 0 || selectedTagIds.length > 0 ? (
            <MultiSelectChip
              label="Tags"
              name="tag_id"
              options={tagOptions}
              selectedIds={selectedTagIds}
              open={openChip === 'tag'}
              onOpenChange={(next) => setOpenChip(next ? 'tag' : null)}
            />
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {presetLinks.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              aria-current={link.isActive ? 'true' : undefined}
              className={buttonVariants({
                variant: link.isActive ? 'default' : 'outline',
                size: 'sm',
              })}
            >
              {link.label}
            </Link>
          ))}

          <label className={chipLabelClassName}>
            <span className="text-xs font-medium text-muted-foreground">From</span>
            <input
              key={resolvedDateFrom}
              type="date"
              name="date_from"
              defaultValue={resolvedDateFrom}
              className="bg-transparent text-sm text-foreground outline-none"
              aria-label="From date"
            />
          </label>

          <label className={chipLabelClassName}>
            <span className="text-xs font-medium text-muted-foreground">To</span>
            <input
              key={resolvedDateTo}
              type="date"
              name="date_to"
              defaultValue={resolvedDateTo}
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
