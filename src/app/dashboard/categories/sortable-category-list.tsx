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
import { cn } from '@/lib/utils'
import { reorderCategoriesAction } from './actions'
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
}: {
  category: CategoryVM
  parentName: string | null
  childCount: number
  showArchived: boolean
  level?: number
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
        dragHandle={<DragHandle name={category.name} {...attributes} {...listeners} />}
      />
    </div>
  )
}

export function SortableCategoryList({
  groups,
  showArchived,
}: SortableCategoryListProps) {
  const [state, setState] = useState(groups)
  const [error, setError] = useState<string | null>(null)

  // Adopt a fresh server list when its set/order changes, without an effect
  // (avoids the set-state-in-effect lint and never clobbers optimistic drags).
  const serverSignature = groups
    .flatMap((g) => g.categories.map((c) => c.id))
    .join('|')
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

  function persistSiblingOrder(
    groupValue: string,
    subsetIds: string[],
    activeId: string,
    overId: string
  ) {
    const group = state.find((g) => g.value === groupValue)
    if (!group) return

    const subset = subsetIds
      .map((id) => group.categories.find((c) => c.id === id))
      .filter((c): c is CategoryVM => Boolean(c))
    const oldIndex = subset.findIndex((c) => c.id === activeId)
    const newIndex = subset.findIndex((c) => c.id === overId)
    if (oldIndex === -1 || newIndex === -1) return

    const reordered = arrayMove(subset, oldIndex, newIndex)
    const positions = group.categories
      .map((c, index) => ({ c, index }))
      .filter(({ c }) => subsetIds.includes(c.id))
      .map(({ index }) => index)

    const nextCategories = [...group.categories]
    positions.forEach((position, i) => {
      nextCategories[position] = reordered[i]
    })

    setState((prev) =>
      prev.map((g) =>
        g.value === groupValue ? { ...g, categories: nextCategories } : g
      )
    )
    void reorderCategoriesAction(reordered.map((c) => c.id)).then((result) =>
      setError(result?.error ?? null)
    )
  }

  return (
    <div className="space-y-3 md:space-y-6">
      {error ? <Callout variant="error">{error}</Callout> : null}

      {state.map((group) => {
        const { roots, childrenByParentId, unparented } = buildHierarchy(
          group.categories
        )
        const rootIds = roots.map((r) => r.id)

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
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={({ active, over }) => {
                  if (!sortable || !over || active.id === over.id) return
                  persistSiblingOrder(
                    group.value,
                    rootIds,
                    String(active.id),
                    String(over.id)
                  )
                }}
              >
                <SortableContext
                  items={rootIds}
                  strategy={verticalListSortingStrategy}
                >
                  {roots.map((category) => {
                    const children = childrenByParentId.get(category.id) ?? []
                    const childIds = children.map((c) => c.id)

                    return (
                      <div
                        key={category.id}
                        className="mb-2 divide-y overflow-hidden rounded-xl border bg-card shadow-sm shadow-black/[0.03] last:mb-0 md:mb-0 md:rounded-none md:border-0 md:shadow-none"
                      >
                        {sortable ? (
                          <SortableCategoryRow
                            category={category}
                            parentName={null}
                            childCount={children.length}
                            showArchived={showArchived}
                          />
                        ) : (
                          <CategoryRow
                            category={category}
                            parentName={null}
                            childCount={children.length}
                            editHref={category.editHref}
                            showArchived={showArchived}
                            level={0}
                          />
                        )}

                        {children.length ? (
                          <div className="divide-y bg-muted/20 md:bg-muted/[0.08]">
                            <DndContext
                              sensors={sensors}
                              collisionDetection={closestCenter}
                              onDragEnd={({ active, over }) => {
                                if (!sortable || !over || active.id === over.id) return
                                persistSiblingOrder(
                                  group.value,
                                  childIds,
                                  String(active.id),
                                  String(over.id)
                                )
                              }}
                            >
                              <SortableContext
                                items={childIds}
                                strategy={verticalListSortingStrategy}
                              >
                                {children.map((child) =>
                                  sortable ? (
                                    <SortableCategoryRow
                                      key={child.id}
                                      category={child}
                                      parentName={category.name}
                                      childCount={0}
                                      showArchived={showArchived}
                                      level={1}
                                    />
                                  ) : (
                                    <CategoryRow
                                      key={child.id}
                                      category={child}
                                      parentName={category.name}
                                      childCount={0}
                                      editHref={child.editHref}
                                      showArchived={showArchived}
                                      level={1}
                                    />
                                  )
                                )}
                              </SortableContext>
                            </DndContext>
                          </div>
                        ) : null}
                      </div>
                    )
                  })}
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
