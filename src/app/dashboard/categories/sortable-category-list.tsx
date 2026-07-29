'use client'

import { useState } from 'react'
import { GripVertical } from 'lucide-react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { SectionHeading } from '@/components/section-heading'
import { Callout } from '@/components/callout'
import { useLanguage } from '@/components/language-provider'
import { cn } from '@/lib/utils'
import { moveCategoryAction } from './actions'
import { CategoryRow } from './category-row'

export type CategoryVM = {
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
  editHref: string
}

type CategoryGroup = {
  value: string
  label: string
  categories: CategoryVM[]
}

type SortableCategoryListProps = {
  groups: CategoryGroup[]
  showArchived: boolean
}

type Hierarchy = {
  roots: CategoryVM[]
  childrenByParentId: Map<string, CategoryVM[]>
  unparented: CategoryVM[]
}

function buildHierarchy(categories: CategoryVM[]): Hierarchy {
  const ids = new Set(categories.map((c) => c.id))
  const childrenByParentId = new Map<string, CategoryVM[]>()
  const roots: CategoryVM[] = []
  const unparented: CategoryVM[] = []

  for (const category of categories) {
    if (!category.parent_category_id) {
      roots.push(category)
      continue
    }
    if (!ids.has(category.parent_category_id)) {
      unparented.push(category)
      continue
    }
    const siblings = childrenByParentId.get(category.parent_category_id)
    if (siblings) siblings.push(category)
    else childrenByParentId.set(category.parent_category_id, [category])
  }

  return { roots, childrenByParentId, unparented }
}

/**
 * BR-048 — the tree as one ordered list, each row carrying its depth. A single
 * flat SortableContext is what lets a drag cross levels; the previous
 * one-context-per-level layout could only ever reorder siblings.
 */
type FlatCategory = {
  category: CategoryVM
  depth: number
  childCount: number
  /** Last child of its parent — ends the tree rail so the branch visibly stops. */
  isLastChild: boolean
}

function flattenHierarchy({ roots, childrenByParentId }: Hierarchy): FlatCategory[] {
  return roots.flatMap((root) => {
    const children = childrenByParentId.get(root.id) ?? []
    return [
      { category: root, depth: 0, childCount: children.length, isLastChild: false },
      ...children.map((child, index) => ({
        category: child,
        depth: 1,
        childCount: 0,
        isLastChild: index === children.length - 1,
      })),
    ]
  })
}

/** One indent step, in pixels — also the horizontal drag distance to nest. */
const INDENT_WIDTH = 28

/**
 * Where a drag would drop, given how far right it was dragged.
 *
 * The hierarchy is only two levels deep (`validateParentCategory` forbids a
 * child from being a parent), so the projection is a clamp between 0 and 1
 * rather than a general tree walk:
 *   - a category that has children can never be dragged below depth 0;
 *   - depth 1 is only offered when something sits above to be a parent of;
 *   - the parent is the nearest preceding root.
 */
function projectDrop(
  items: FlatCategory[],
  activeId: string,
  overId: string,
  offsetLeft: number
): { depth: number; parentId: string | null } | null {
  const activeIndex = items.findIndex((item) => item.category.id === activeId)
  const overIndex = items.findIndex((item) => item.category.id === overId)
  if (activeIndex === -1 || overIndex === -1) return null

  const moved = arrayMove(items, activeIndex, overIndex)
  const newIndex = moved.findIndex((item) => item.category.id === activeId)
  const active = moved[newIndex]
  const previous = moved[newIndex - 1]

  // A parent keeps its children, so it has to stay at the root level.
  if (active.childCount > 0) return { depth: 0, parentId: null }

  const maxDepth = previous ? 1 : 0
  const dragDepth = Math.round(offsetLeft / INDENT_WIDTH)
  const depth = Math.min(Math.max(active.depth + dragDepth, 0), maxDepth)

  if (depth === 0) return { depth: 0, parentId: null }

  // Nearest preceding root becomes the parent.
  for (let index = newIndex - 1; index >= 0; index--) {
    const candidate = moved[index]
    if (candidate.depth === 0) {
      return { depth: 1, parentId: candidate.category.id }
    }
  }
  return { depth: 0, parentId: null }
}

function DragHandle({ name, ...handleProps }: { name: string } & Record<string, unknown>) {
  return (
    <button
      type="button"
      className="flex shrink-0 cursor-grab touch-none items-center px-1.5 text-muted-foreground hover:text-foreground active:cursor-grabbing"
      aria-label={`Reorder ${name}`}
      {...handleProps}
    >
      <GripVertical className="size-4" aria-hidden="true" />
    </button>
  )
}

function SortableCategoryRow({
  category,
  parentName,
  childCount,
  showArchived,
  level = 0,
  isLastChild = false,
}: {
  category: CategoryVM
  parentName: string | null
  childCount: number
  showArchived: boolean
  level?: number
  isLastChild?: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: category.id })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('bg-card', isDragging && 'relative z-10 opacity-80 shadow-lg')}
    >
      <CategoryRow
        category={category}
        parentName={parentName}
        childCount={childCount}
        editHref={category.editHref}
        showArchived={showArchived}
        level={level}
        isLastChild={isLastChild}
        dragHandle={<DragHandle name={category.name} {...attributes} {...listeners} />}
      />
    </div>
  )
}

export function SortableCategoryList({
  groups,
  showArchived,
}: SortableCategoryListProps) {
  const { t } = useLanguage()
  const [state, setState] = useState(groups)
  const [error, setError] = useState<string | null>(null)
  // Live drag position, so the row previews the depth it would land at.
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOffsetLeft, setDragOffsetLeft] = useState(0)

  // Adopt a fresh server list when it changes, without an effect (avoids the
  // set-state-in-effect lint and never clobbers optimistic drags).
  //
  // The signature has to cover the whole rendered shape, not just the id order:
  // this component renders the rows from its own copy, so a re-parent, rename
  // or restyle that leaves the id sequence intact would otherwise keep showing
  // stale data until a hard refresh. Category lists are small, so stringifying
  // them per render is cheaper than getting the comparison subtly wrong.
  const serverSignature = JSON.stringify(groups)
  const [syncedSignature, setSyncedSignature] = useState(serverSignature)
  if (serverSignature !== syncedSignature) {
    setState(groups)
    setSyncedSignature(serverSignature)
  }

  const sortable = !showArchived

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  /**
   * BR-048 — commits a drag that may have changed nesting, order, or both.
   *
   * The optimistic update is applied first so the row lands where it was
   * dropped, then the server has the last word: on rejection the local copy is
   * restored and the reason is shown, so an illegal drop springs back instead
   * of appearing to have worked.
   */
  function persistMove(
    groupValue: string,
    activeId: string,
    overId: string,
    offsetLeft: number
  ) {
    const group = state.find((g) => g.value === groupValue)
    if (!group) return

    const items = flattenHierarchy(buildHierarchy(group.categories))
    const drop = projectDrop(items, activeId, overId, offsetLeft)
    if (!drop) return

    const activeIndex = items.findIndex((item) => item.category.id === activeId)
    const overIndex = items.findIndex((item) => item.category.id === overId)
    const moved = arrayMove(items, activeIndex, overIndex).map((item) =>
      item.category.id === activeId
        ? {
            ...item,
            depth: drop.depth,
            category: { ...item.category, parent_category_id: drop.parentId },
          }
        : item
    )

    const previous = state
    const nextCategories = moved.map((item) => item.category)
    setState((prev) =>
      prev.map((g) => (g.value === groupValue ? { ...g, categories: nextCategories } : g))
    )
    setError(null)

    // Everything sharing the destination parent, in its new order — the action
    // renumbers exactly this set.
    const orderedSiblingIds = nextCategories
      .filter((category) => (category.parent_category_id ?? null) === drop.parentId)
      .map((category) => category.id)

    void moveCategoryAction({
      categoryId: activeId,
      parentCategoryId: drop.parentId,
      orderedSiblingIds,
    }).then((result) => {
      if (result?.error) {
        setState(previous)
        setError(result.error)
      }
    })
  }

  return (
    <div className="space-y-3 md:space-y-6">
      {error ? <Callout variant="error">{error}</Callout> : null}

      {/* BR-048 is invisible until you try it, so say it once. Desktop only:
          dragging is the fast path there, while the outdent button on each
          subcategory row is what phones actually use. */}
      {sortable ? (
        <p className="hidden px-1 text-xs text-muted-foreground md:block">
          {t('categoriesUi.dragHint')}
        </p>
      ) : null}

      {state.map((group) => {
        const hierarchy = buildHierarchy(group.categories)
        const { unparented } = hierarchy
        const items = flattenHierarchy(hierarchy)
        const itemIds = items.map((item) => item.category.id)
        const parentNameById = new Map(
          hierarchy.roots.map((root) => [root.id, root.name])
        )

        return (
          <section key={group.value} className="space-y-2 md:space-y-3">
            {state.length > 1 ? (
              <SectionHeading title={group.label} className="px-1 md:px-0" />
            ) : null}

            <div className="md:overflow-hidden md:rounded-xl md:border md:bg-card md:shadow-sm md:shadow-black/[0.03]">
              <div className="hidden grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b bg-muted/20 px-4 py-2 text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground md:grid">
                <span>Category</span>
                <span className="sr-only">Actions</span>
              </div>
              {/* BR-048: one context over the whole flattened tree, so a drag
                  can change nesting and not just sibling order. */}
              <DndContext
                id={`categories-${group.value}`}
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={({ active }) => setDraggingId(String(active.id))}
                onDragMove={({ delta }) => setDragOffsetLeft(delta.x)}
                onDragCancel={() => {
                  setDraggingId(null)
                  setDragOffsetLeft(0)
                }}
                onDragEnd={({ active, over, delta }) => {
                  const offset = delta.x
                  setDraggingId(null)
                  setDragOffsetLeft(0)
                  if (!sortable || !over) return
                  persistMove(group.value, String(active.id), String(over.id), offset)
                }}
              >
                <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
                  <div className="divide-y">
                    {items.map((item) => {
                      const { category, depth, childCount, isLastChild } = item
                      const parentName = category.parent_category_id
                        ? parentNameById.get(category.parent_category_id) ?? null
                        : null
                      // While dragging, show the depth the drop would produce
                      // so the indent previews the outcome.
                      const projected =
                        draggingId === category.id
                          ? projectDrop(items, draggingId, draggingId, dragOffsetLeft)
                          : null
                      const level = projected?.depth ?? depth

                      return sortable ? (
                        <SortableCategoryRow
                          key={category.id}
                          category={category}
                          parentName={parentName}
                          childCount={childCount}
                          showArchived={showArchived}
                          level={level}
                          isLastChild={isLastChild}
                        />
                      ) : (
                        <CategoryRow
                          key={category.id}
                          category={category}
                          parentName={parentName}
                          childCount={childCount}
                          editHref={category.editHref}
                          showArchived={showArchived}
                          level={level}
                          isLastChild={isLastChild}
                        />
                      )
                    })}
                  </div>
                </SortableContext>
              </DndContext>

              {unparented.length ? (
                <div className="space-y-1 bg-muted/10 p-3">
                  <p className="text-xs font-medium text-muted-foreground">
                    Unparented
                  </p>
                  <div className="divide-y rounded-lg border bg-background">
                    {unparented.map((category) => (
                      <CategoryRow
                        key={category.id}
                        category={category}
                        parentName={null}
                        parentUnavailable
                        childCount={0}
                        editHref={category.editHref}
                        showArchived={showArchived}
                        level={0}
                      />
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </section>
        )
      })}
    </div>
  )
}
