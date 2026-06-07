'use client'

import { useState } from 'react'
import Link from 'next/link'
import { SlidersHorizontal } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type AccountOption = {
  id: string
  label: string
  isArchived: boolean
}

type CategoryOption = {
  id: string
  label: string
  isArchived: boolean
}

type PresetLink = {
  label: string
  href: string
  isActive: boolean
}

type TransactionFiltersProps = {
  searchText: string
  selectedType: string
  selectedStatus: string
  selectedAccountIds: string[]
  selectedCategoryIds: string[]
  resolvedDateFrom: string
  resolvedDateTo: string
  hasActiveFilters: boolean
  accountOptions: AccountOption[]
  categoryOptions: CategoryOption[]
  presetLinks: PresetLink[]
}

const selectClassName =
  'h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'

export function TransactionFilters({
  searchText,
  selectedType,
  selectedStatus,
  selectedAccountIds,
  selectedCategoryIds,
  resolvedDateFrom,
  resolvedDateTo,
  hasActiveFilters,
  accountOptions,
  categoryOptions,
  presetLinks,
}: TransactionFiltersProps) {
  const advancedActiveCount = [
    selectedType !== 'all',
    selectedStatus !== 'all',
    selectedAccountIds.length > 0,
    selectedCategoryIds.length > 0,
  ].filter(Boolean).length

  const [expanded, setExpanded] = useState(false)

  return (
    <div className="space-y-2.5">
      <form method="get" action="/dashboard/transactions">

        {/* ── Always-visible row: search + toggle ───────────────────── */}
        <div className="flex gap-2">
          <Input
            name="search"
            defaultValue={searchText}
            placeholder="Search transactions…"
            className="flex-1"
          />
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors hover:bg-muted/50 ${
              expanded || advancedActiveCount > 0 ? 'bg-muted/50' : ''
            }`}
            aria-label="Toggle advanced filters"
            aria-expanded={expanded}
          >
            <SlidersHorizontal className="size-4" aria-hidden="true" />
            {advancedActiveCount > 0 ? (
              <Badge variant="secondary" className="h-4 px-1 text-xs">
                {advancedActiveCount}
              </Badge>
            ) : null}
          </button>
        </div>

        {/* ── Date presets — always visible ─────────────────────────── */}
        <div className="flex flex-wrap gap-1.5 pt-2">
          {presetLinks.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className={buttonVariants({
                variant: link.isActive ? 'secondary' : 'outline',
                size: 'sm',
              })}
            >
              {link.label}
            </Link>
          ))}
        </div>

        {/* ── Advanced filters — collapsible ────────────────────────── */}
        {expanded ? (
          <div className="space-y-3 pt-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="date_from" className="text-xs text-muted-foreground">
                  From
                </Label>
                <Input
                  id="date_from"
                  name="date_from"
                  type="date"
                  defaultValue={resolvedDateFrom}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="date_to" className="text-xs text-muted-foreground">
                  To
                </Label>
                <Input
                  id="date_to"
                  name="date_to"
                  type="date"
                  defaultValue={resolvedDateTo}
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="type" className="text-xs text-muted-foreground">
                  Type
                </Label>
                <select
                  id="type"
                  name="type"
                  defaultValue={selectedType}
                  className={selectClassName}
                >
                  <option value="all">All types</option>
                  <option value="income">Income</option>
                  <option value="expense">Expense</option>
                  <option value="transfer">Transfer</option>
                  <option value="opening_balance">Opening balance</option>
                  <option value="debt_payment">Debt payment</option>
                  <option value="adjustment">Adjustment</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="status" className="text-xs text-muted-foreground">
                  Status
                </Label>
                <select
                  id="status"
                  name="status"
                  defaultValue={selectedStatus}
                  className={selectClassName}
                >
                  <option value="all">All statuses</option>
                  <option value="posted">Posted</option>
                  <option value="pending">Pending</option>
                  <option value="voided">Voided</option>
                </select>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  Account{' '}
                  <span className="font-normal">(Ctrl/⌘ for multiple)</span>
                </Label>
                <select
                  name="account_id"
                  multiple
                  size={3}
                  defaultValue={selectedAccountIds}
                  className="w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {accountOptions.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  Category{' '}
                  <span className="font-normal">(Ctrl/⌘ for multiple)</span>
                </Label>
                <select
                  name="category_id"
                  multiple
                  size={3}
                  defaultValue={selectedCategoryIds}
                  className="w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {categoryOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                      {c.isArchived ? ' (archived)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="submit" size="sm">
                Apply
              </Button>
              {hasActiveFilters ? (
                <Link
                  href="/dashboard/transactions"
                  className={buttonVariants({ variant: 'ghost', size: 'sm' })}
                >
                  Clear all
                </Link>
              ) : null}
            </div>
          </div>
        ) : (
          /* Hidden inputs preserve active filters when submitting via search */
          <>
            <input type="hidden" name="date_from" value={resolvedDateFrom} />
            <input type="hidden" name="date_to" value={resolvedDateTo} />
            {selectedType !== 'all' && (
              <input type="hidden" name="type" value={selectedType} />
            )}
            {selectedStatus !== 'all' && (
              <input type="hidden" name="status" value={selectedStatus} />
            )}
            {selectedAccountIds.map((id) => (
              <input key={id} type="hidden" name="account_id" value={id} />
            ))}
            {selectedCategoryIds.map((id) => (
              <input key={id} type="hidden" name="category_id" value={id} />
            ))}
          </>
        )}
      </form>
    </div>
  )
}
