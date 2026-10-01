'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { ArrowLeftFromLine, ChevronDown, MoreHorizontal, Pencil, Tag } from 'lucide-react'
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
  /** Ends the tree rail at this row, so a branch visibly stops. */
  isLastChild?: boolean
  /** Phone only: this parent's subcategories are folded away (MQ-016). */
  childrenCollapsed?: boolean
  /** Phone only: folds or unfolds this parent's subcategories. */
  onToggleChildren?: () => void
  /** Phone only: hides the row because its parent is folded. */
  mobileHidden?: boolean
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
  isLastChild = false,
  childrenCollapsed = false,
  onToggleChildren,
  mobileHidden = false,
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

  const isChild = level > 0

  /**
   * The tree rail. Drawn per row rather than around the child group, because
   * the list is flat (BR-048 needs one sortable context over every row) — so
   * each child paints a full-height line at the same x, and consecutive
   * children join into one continuous rail. The last child stops its line at
   * the elbow so the branch visibly ends.
   */
  const rail = (
    <>
      <span
        className={cn(
          'absolute left-0 top-0 w-px bg-border',
          isLastChild ? 'h-1/2' : 'h-full'
        )}
        aria-hidden="true"
      />
      <span
        className="absolute left-0 top-1/2 h-px w-3.5 bg-border"
        aria-hidden="true"
      />
    </>
  )

  /**
   * BR-047 + BR-048 — the one-click way out of a parent. On desktop it sits on
   * every subcategory row, icon-only with a tooltip; dragging left does the
   * same thing, but only once you know dragging works at all.
   *
   * A phone has no tooltip, so an unlabelled "←|" on the row read as nothing
   * (MQ-016). There it lives in the row's actions panel, next to Edit and
   * Archive, with its name spelled out.
   */
  const outdentButton = (compact: boolean) =>
    isChild ? (
      <ConfirmActionButton
        action={promoteCategoryAction}
        triggerVariant="outline"
        triggerSize={compact ? 'icon-sm' : 'sm'}
        triggerTitle={compact ? t('categoriesUi.promoteAction') : undefined}
        hiddenFields={{
          category_id: category.id,
          show_archived: showArchived ? 'true' : 'false',
        }}
        triggerLabel={
          compact ? (
            <ArrowLeftFromLine className="size-3.5" aria-hidden="true" />
          ) : (
            <>
              <ArrowLeftFromLine className="size-3.5" aria-hidden="true" />
              {t('categoriesUi.promoteAction')}
            </>
          )
        }
        pendingLabel={t('categoriesUi.promotePending')}
        title={t('categoriesUi.promoteTitle')}
        description={t('categoriesUi.promoteDescription', { name: displayName })}
        cancelLabel={t('common.cancel')}
        confirmLabel={t('categoriesUi.promoteConfirm')}
      />
    ) : null

  const detailsLabel = t(open ? 'categoriesUi.hideDetails' : 'categoriesUi.showDetails', {
    name: displayName,
  })

  /** "⋯" — details and actions. The chevron only ever folds children. */
  const detailsButton = (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      className={buttonVariants({ variant: 'ghost', size: 'icon-sm' })}
      aria-expanded={open}
      aria-label={detailsLabel}
    >
      <MoreHorizontal className="size-4 text-muted-foreground" aria-hidden="true" />
    </button>
  )

  return (
    <div
      className={cn(
        mobileHidden && 'max-md:hidden',
        category.is_archived && 'bg-muted/20',
        // Subcategories sit on a recessed band with a left accent, so a glance
        // separates "a category" from "inside a category".
        isChild && 'border-l-2 border-l-border/70 bg-muted/30 dark:bg-muted/15'
      )}
    >
      {/* ── Mobile ──────────────────────────────────────────────────────── */}
      {isChild ? (
        <div className="relative flex items-center gap-1 pl-9 pr-2 md:hidden">
          <span className="absolute bottom-0 left-4 top-0" aria-hidden="true">
            <span className="relative block h-full">{rail}</span>
          </span>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex min-w-0 flex-1 items-center gap-2 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-expanded={open}
          >
            <CategoryIcon category={category} compact />
            <span className={cn('min-w-0 flex-1 truncate text-xs', muted)}>
              {displayName}
            </span>
          </button>
          {detailsButton}
        </div>
      ) : (
        <div className="flex items-center gap-1 py-1.5 pl-3 pr-2 md:hidden">
          {/* Tapping the row opens details and actions, like "⋯" does. */}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg py-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-expanded={open}
          >
            <CategoryIcon category={category} />
            <span className="min-w-0 flex-1">
              <span className={cn('block truncate text-sm font-semibold', muted)}>
                {displayName}
              </span>
              {childCount > 0 ? (
                <span className="mt-0.5 block text-[10.5px] text-muted-foreground">
                  {t(
                    childCount === 1
                      ? 'categoriesUi.subcategoryOne'
                      : 'categoriesUi.subcategoryOther',
                    { count: childCount }
                  )}
                </span>
              ) : null}
            </span>
          </button>
          {detailsButton}
          {childCount > 0 && onToggleChildren ? (
            <button
              type="button"
              onClick={onToggleChildren}
              // Unfolded is this button's resting state, so it does not take
              // the ghost variant's "open" fill.
              className={cn(
                buttonVariants({ variant: 'ghost', size: 'icon-sm' }),
                'aria-expanded:bg-transparent'
              )}
              aria-expanded={!childrenCollapsed}
              aria-label={t(
                childrenCollapsed
                  ? 'categoriesUi.showSubcategories'
                  : 'categoriesUi.hideSubcategories',
                { name: displayName }
              )}
            >
              <ChevronDown
                className={cn(
                  'size-4 text-muted-foreground transition-transform duration-200',
                  childrenCollapsed && '-rotate-90'
                )}
                aria-hidden="true"
              />
            </button>
          ) : null}
        </div>
      )}

      {/* ── Desktop ─────────────────────────────────────────────────────── */}
      <div
        className={cn(
          'hidden gap-3 px-4 transition-colors hover:bg-muted/30 md:grid md:grid-cols-[minmax(0,1fr)_auto] md:items-center',
          // A shorter row reinforces that a subcategory is subordinate.
          isChild ? 'py-2' : 'py-3'
        )}
      >
        <div className="flex min-w-0 items-center gap-2">
          {dragHandle}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className={cn(
              'relative flex min-w-0 flex-1 items-center rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              isChild ? 'gap-2.5 pl-7' : 'gap-3'
            )}
            aria-expanded={open}
          >
            {isChild ? rail : null}
            <CategoryIcon category={category} compact={isChild} />

            <span className="min-w-0 flex-1">
              <span
                className={cn(
                  'block truncate',
                  isChild ? 'text-[13px] font-normal' : 'text-sm font-semibold',
                  muted
                )}
              >
                {displayName}
              </span>
              {!isChild && childCount > 0 ? (
                <span className="mt-0.5 block text-[10.5px] text-muted-foreground">
                  {t(
                    childCount === 1
                      ? 'categoriesUi.subcategoryOne'
                      : 'categoriesUi.subcategoryOther',
                    { count: childCount }
                  )}
                </span>
              ) : null}
            </span>
          </button>
        </div>

        <div className="flex items-center justify-end gap-1">
          {outdentButton(true)}
          <Link
            href={editHref}
            className={buttonVariants({ variant: 'outline', size: 'icon-sm' })}
            aria-label={t('categoriesUi.editNamed', { name: displayName })}
          >
            <Pencil className="size-3.5" aria-hidden="true" />
          </Link>
          {detailsButton}
        </div>
      </div>

      {/* Mounted only while open (MQ-016). The collapsed-grid version kept
          its Edit and Archive buttons in the tab order while invisible, and a
          tap mid-collapse could leave the row half-closed. */}
      {open ? (
        <div className="mx-3 mb-3 space-y-3 rounded-lg bg-muted/40 p-3 animate-in fade-in-0 slide-in-from-top-1 duration-150">
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
            {/* BR-047's promote action: on desktop it sits on the row itself;
                on a phone this panel is its home, labelled. */}
            {isChild ? <span className="md:hidden">{outdentButton(false)}</span> : null}
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
      ) : null}
    </div>
  )
}
