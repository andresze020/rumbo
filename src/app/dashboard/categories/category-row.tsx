'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { ChevronDown, Pencil, Tag } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { SubmitButton } from '@/components/submit-button'
import { ConfirmActionButton } from '@/components/confirm-action-button'
import { formatLabel } from '@/lib/format'
import { cn } from '@/lib/utils'
import { archiveCategoryAction, promoteCategoryAction } from './actions'
import { useLanguage } from '@/components/language-provider'
import { localizeSystemCategoryName } from '@/lib/i18n/system-category-names'

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
  childCount: number
}

type CategoryRowProps = {
  category: Category
  parentName: string | null
  parentUnavailable?: boolean
  childCount: number
  editHref: string
  showArchived: boolean
  dragHandle?: ReactNode
  level?: number
}

function categoryFlags(category: Category) {
  return [
    category.is_system ? 'System' : null,
    category.exclude_from_budget ? 'Planning excluded' : null,
    category.exclude_from_reports ? 'No reports' : null,
    category.is_archived ? 'Archived' : null,
  ].filter((flag): flag is string => Boolean(flag))
}

function CategoryIcon({
  category,
  compact = false,
}: {
  category: Category
  compact?: boolean
}) {
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-semibold',
        compact ? 'size-6 rounded-md' : 'size-8'
      )}
      style={category.color ? { color: category.color } : undefined}
      aria-hidden="true"
    >
      {category.icon ? (
        <span className="leading-none">{category.icon}</span>
      ) : compact ? (
        <span
          className="size-1.5 rounded-sm"
          style={{ backgroundColor: category.color ?? 'currentColor' }}
        />
      ) : (
        <Tag className="size-4" />
      )}
    </span>
  )
}

export function CategoryRow({
  category,
  parentName,
  parentUnavailable,
  childCount,
  editHref,
  showArchived,
  dragHandle,
  level = 0,
}: CategoryRowProps) {
  const { locale, t } = useLanguage()
  const displayName = localizeSystemCategoryName(
    category.name,
    category.is_system,
    locale
  )
  const [open, setOpen] = useState(false)
  const muted = category.is_archived ? 'text-muted-foreground' : ''
  const flags = categoryFlags(category)
  const reportsDifferently = category.reporting_type !== category.category_type
  const configurationBadges = [
    reportsDifferently ? `Reports as ${formatLabel(category.reporting_type)}` : null,
    ...flags,
  ].filter((flag): flag is string => Boolean(flag))

  return (
    <div className={cn(category.is_archived && 'bg-muted/20')}>
      {level > 0 ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="relative flex w-full items-center gap-2 bg-muted/25 px-4 py-2.5 pl-12 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
          aria-expanded={open}
        >
          <span
            className="absolute left-6 top-0 h-full w-px bg-border"
            aria-hidden="true"
          />
          <span
            className="absolute left-6 top-1/2 h-px w-3 bg-border"
            aria-hidden="true"
          />
          <CategoryIcon category={category} compact />
          <span className={cn('min-w-0 flex-1 truncate text-[11.5px]', muted)}>
            {displayName}
          </span>
          <ChevronDown
            className={cn(
              'size-3.5 shrink-0 text-muted-foreground transition-transform duration-200',
              open && 'rotate-180'
            )}
            aria-hidden="true"
          />
        </button>
      ) : (
        <div className="p-3 md:hidden">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="w-full rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-expanded={open}
          >
            <div className="mb-2 flex items-center gap-2.5">
              <CategoryIcon category={category} />
              <span className="min-w-0 flex-1">
                <span className={cn('block truncate text-[13px] font-semibold', muted)}>
                  {displayName}
                </span>
                <span className="mt-0.5 block text-[10.5px] text-muted-foreground">
                  {t(
                    childCount === 1
                      ? 'categoriesUi.subcategoryOne'
                      : 'categoriesUi.subcategoryOther',
                    { count: childCount }
                  )}
                </span>
              </span>
              <ChevronDown
                className={cn(
                  'size-4 shrink-0 text-muted-foreground transition-transform duration-200',
                  open && 'rotate-180'
                )}
                aria-hidden="true"
              />
            </div>
          </button>
        </div>
      )}

      <div
        className={cn(
          'hidden gap-3 px-4 py-3 transition-colors hover:bg-muted/30 md:grid md:grid-cols-[minmax(0,1fr)_auto] md:items-center',
          level > 0 && 'md:bg-muted/10'
        )}
      >
        <div className="flex min-w-0 items-center gap-2">
          {dragHandle}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className={cn(
              'relative flex min-w-0 flex-1 items-center gap-3 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              level > 0 && 'pl-8'
            )}
            aria-expanded={open}
          >
            {level > 0 ? (
              <>
                <span
                  className="absolute left-2 top-1/2 h-px w-4 bg-border"
                  aria-hidden="true"
                />
                <span
                  className="absolute bottom-1/2 left-2 h-7 w-px bg-border"
                  aria-hidden="true"
                />
              </>
            ) : null}
            <CategoryIcon category={category} compact={level > 0} />

            <span className="min-w-0 flex-1">
              <span className={cn('block truncate text-sm font-semibold', muted)}>
                {displayName}
              </span>
              <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10.5px] text-muted-foreground">
                {level === 0 ? (
                  <span>
                    {t(
                      childCount === 1
                        ? 'categoriesUi.subcategoryOne'
                        : 'categoriesUi.subcategoryOther',
                      { count: childCount }
                    )}
                  </span>
                ) : null}
              </span>
            </span>
          </button>
        </div>

        <div className="flex items-center justify-end gap-1">
          <Link
            href={editHref}
            className={buttonVariants({ variant: 'outline', size: 'icon-sm' })}
            aria-label={t('categoriesUi.editNamed', { name: displayName })}
          >
            <Pencil className="size-3.5" aria-hidden="true" />
          </Link>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className={buttonVariants({ variant: 'ghost', size: 'icon-sm' })}
            aria-expanded={open}
            aria-label={t(
              open ? 'categoriesUi.hideDetails' : 'categoriesUi.showDetails',
              { name: displayName }
            )}
          >
            <ChevronDown
              className={cn(
                'size-4 text-muted-foreground transition-transform duration-200',
                open && 'rotate-180'
              )}
              aria-hidden="true"
            />
          </button>
        </div>
      </div>

      <div
        className={`grid transition-all duration-200 ease-in-out ${
          open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className="overflow-hidden">
          <div className="mx-3 mb-3 space-y-3 rounded-lg bg-muted/40 p-3">
            <div className="flex flex-wrap gap-1.5">
              {configurationBadges.length ? (
                configurationBadges.map((flag) => (
                  <span
                    key={flag}
                    className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground"
                  >
                    {flag}
                  </span>
                ))
              ) : (
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                  Active
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {parentName ? (
                <span>
                  Parent: <span className="text-foreground">{parentName}</span>
                </span>
              ) : null}
              {parentUnavailable ? (
                <span className="text-amber-600 dark:text-amber-400">
                  Parent category unavailable
                </span>
              ) : null}
              {childCount > 0 ? (
                <span>
                  {t(
                    childCount === 1
                      ? 'categoriesUi.subcategoryOne'
                      : 'categoriesUi.subcategoryOther',
                    { count: childCount }
                  )}
                </span>
              ) : null}
              {category.sort_order != null ? (
                <span>Sort order: {category.sort_order}</span>
              ) : null}
              <span>Type: {formatLabel(category.category_type)}</span>
              <span>Reports as: {formatLabel(category.reporting_type)}</span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              <Link
                href={editHref}
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
              >
                Edit
              </Link>
              {/* BR-047: a subcategory can be lifted back to the main level.
                  The category keeps its id, so history and budgets still
                  resolve — only its parent link is cleared. */}
              {category.parent_category_id ? (
                <ConfirmActionButton
                  action={promoteCategoryAction}
                  triggerVariant="outline"
                  hiddenFields={{
                    category_id: category.id,
                    show_archived: showArchived ? 'true' : 'false',
                  }}
                  triggerLabel={t('categoriesUi.promoteAction')}
                  pendingLabel={t('categoriesUi.promotePending')}
                  title={t('categoriesUi.promoteTitle')}
                  description={t('categoriesUi.promoteDescription', {
                    name: displayName,
                  })}
                  cancelLabel={t('common.cancel')}
                  confirmLabel={t('categoriesUi.promoteConfirm')}
                />
              ) : null}
              {category.is_archived ? (
                <form action={archiveCategoryAction}>
                  <input type="hidden" name="category_id" value={category.id} />
                  <input type="hidden" name="is_archived" value="false" />
                  <input
                    type="hidden"
                    name="show_archived"
                    value={showArchived ? 'true' : 'false'}
                  />
                  <SubmitButton type="submit" size="sm" variant="outline" pendingText="Restoring…">
                    Restore
                  </SubmitButton>
                </form>
              ) : (
                <ConfirmActionButton
                  action={archiveCategoryAction}
                  hiddenFields={{
                    category_id: category.id,
                    is_archived: 'true',
                    show_archived: showArchived ? 'true' : 'false',
                  }}
                  triggerLabel="Archive"
                  pendingLabel="Archiving…"
                  title="Archive this category?"
                  description="Archived categories are hidden from category lists and pickers, but history stays intact. You can restore it anytime."
                  cancelLabel="Cancel"
                  confirmLabel="Archive"
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
