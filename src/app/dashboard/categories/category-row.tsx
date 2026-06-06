'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { SubmitButton } from '@/components/submit-button'
import { archiveCategoryAction } from './actions'

type Category = {
  id: string
  name: string
  category_type: string
  reporting_type: string
  parent_category_id: string | null
  is_system: boolean
  is_archived: boolean
  exclude_from_budget: boolean
  exclude_from_reports: boolean
  color: string | null
  icon: string | null
  sort_order: number | null
}

function formatValue(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase())
}

type CategoryRowProps = {
  category: Category
  parentName: string | null
  parentUnavailable?: boolean
  childCount: number
  editHref: string
  showArchived: boolean
}

export function CategoryRow({
  category,
  parentName,
  parentUnavailable,
  childCount,
  editHref,
  showArchived,
}: CategoryRowProps) {
  const [open, setOpen] = useState(false)

  const hasDetail =
    Boolean(parentName) ||
    parentUnavailable ||
    childCount > 0 ||
    category.is_system ||
    category.exclude_from_budget ||
    category.exclude_from_reports ||
    category.sort_order != null

  return (
    <div className={category.is_archived ? 'bg-muted/20' : ''}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-muted/50 -mx-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-expanded={open}
      >
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {category.color ? (
            <span
              className="size-2.5 shrink-0 rounded-full border"
              style={{ backgroundColor: category.color }}
              aria-hidden="true"
            />
          ) : null}
          {category.icon ? (
            <span className="shrink-0 text-sm leading-none" aria-hidden="true">
              {category.icon}
            </span>
          ) : null}
          <span
            className={`text-sm font-medium ${category.is_archived ? 'text-muted-foreground' : ''}`}
          >
            {category.name}
          </span>
          {category.reporting_type !== category.category_type ? (
            <Badge variant="outline" className="text-xs">
              {formatValue(category.reporting_type)}
            </Badge>
          ) : null}
          {category.is_archived ? (
            <Badge variant="outline" className="text-xs text-muted-foreground">
              Archived
            </Badge>
          ) : null}
          {parentUnavailable ? (
            <Badge
              variant="outline"
              className="text-xs text-amber-600 dark:text-amber-400"
            >
              Parent unavailable
            </Badge>
          ) : null}
        </div>

        <ChevronDown
          className={`size-4 shrink-0 text-muted-foreground transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      <div
        className={`grid transition-all duration-200 ease-in-out ${
          open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className="overflow-hidden">
          <div className="mx-3 mb-3 space-y-3 rounded-lg bg-muted/40 p-3">
            {hasDetail ? (
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {parentName ? (
                  <span>
                    Parent: <span className="text-foreground">{parentName}</span>
                  </span>
                ) : null}
                {parentUnavailable ? (
                  <span className="text-amber-600 dark:text-amber-400">
                    ⚠ Parent category unavailable
                  </span>
                ) : null}
                {childCount > 0 ? (
                  <span>
                    {childCount}{' '}
                    {childCount === 1 ? 'subcategory' : 'subcategories'}
                  </span>
                ) : null}
                {category.is_system ? (
                  <span>System category</span>
                ) : null}
                {category.exclude_from_budget ? (
                  <span>Excluded from budget</span>
                ) : null}
                {category.exclude_from_reports ? (
                  <span>Excluded from reports</span>
                ) : null}
                {category.sort_order != null ? (
                  <span>Sort order: {category.sort_order}</span>
                ) : null}
              </div>
            ) : null}

            <div className="flex flex-wrap gap-1.5">
              <Link
                href={editHref}
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
              >
                Edit
              </Link>
              <form action={archiveCategoryAction}>
                <input type="hidden" name="category_id" value={category.id} />
                <input
                  type="hidden"
                  name="is_archived"
                  value={category.is_archived ? 'false' : 'true'}
                />
                <input
                  type="hidden"
                  name="show_archived"
                  value={showArchived ? 'true' : 'false'}
                />
                <SubmitButton
                  type="submit"
                  size="sm"
                  variant={category.is_archived ? 'outline' : 'secondary'}
                  pendingText={category.is_archived ? 'Restoring…' : 'Archiving…'}
                >
                  {category.is_archived ? 'Restore' : 'Archive'}
                </SubmitButton>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
