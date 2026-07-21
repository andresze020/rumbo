'use client'

import { useOptimistic, useState, useTransition } from 'react'
import Link from 'next/link'
import { ChevronDown, Eye, EyeOff, Plus } from 'lucide-react'
import {
  archiveCategoryAction,
  createCategoryAction,
} from '@/app/dashboard/categories/actions'
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsiblePanel,
} from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { buttonVariants } from '@/components/ui/button'
import { SubmitButton } from '@/components/submit-button'
import { cn } from '@/lib/utils'

export type OnboardingCategory = {
  id: string
  name: string
  category_type: string
  icon: string | null
  is_archived: boolean
}

const groups = [
  { value: 'income', label: 'Income', reportingType: 'income' },
  { value: 'expense', label: 'Expense', reportingType: 'expense' },
  { value: 'financial', label: 'Financial', reportingType: 'transfer' },
] as const

function CategoryRow({ category }: { category: OnboardingCategory }) {
  const [isPending, startTransition] = useTransition()
  const [archived, setArchivedOptimistic] = useOptimistic(category.is_archived)

  function toggleArchived() {
    startTransition(async () => {
      const next = !archived
      setArchivedOptimistic(next)
      const formData = new FormData()
      formData.set('category_id', category.id)
      formData.set('is_archived', String(next))
      formData.set('return_to', 'onboarding')
      await archiveCategoryAction(formData)
    })
  }

  return (
    <li className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/50">
      <span
        className={cn(
          'flex min-w-0 items-center gap-2 text-sm',
          archived && 'text-muted-foreground line-through'
        )}
      >
        <span className="shrink-0" aria-hidden="true">
          {category.icon ?? '🏷️'}
        </span>
        <span className="truncate">{category.name}</span>
      </span>
      <button
        type="button"
        onClick={toggleArchived}
        disabled={isPending}
        aria-label={
          archived ? `Restore ${category.name}` : `Archive ${category.name}`
        }
        title={archived ? 'Restore' : 'Archive'}
        className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
      >
        {archived ? (
          <Eye className="size-4" aria-hidden="true" />
        ) : (
          <EyeOff className="size-4" aria-hidden="true" />
        )}
      </button>
    </li>
  )
}

function AddCategoryForm({
  categoryType,
  reportingType,
}: {
  categoryType: string
  reportingType: string
}) {
  const [open, setOpen] = useState(false)

  async function submit(formData: FormData) {
    setOpen(false)
    await createCategoryAction(formData)
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="px-2 py-1.5">
        <Plus className="size-3.5" aria-hidden="true" />
        Add category
      </CollapsibleTrigger>
      <CollapsiblePanel>
        <form action={submit} className="flex items-end gap-2 px-2 pb-1 pt-2">
          <input type="hidden" name="return_to" value="onboarding" />
          <input type="hidden" name="category_type" value={categoryType} />
          <input type="hidden" name="reporting_type" value={reportingType} />

          <div className="min-w-0 flex-1 space-y-1">
            <Label htmlFor={`new_${categoryType}_name`} className="text-xs">
              Name
            </Label>
            <Input
              id={`new_${categoryType}_name`}
              name="name"
              placeholder="e.g. Pets"
              required
              className="h-9"
            />
          </div>

          <div className="w-16 space-y-1">
            <Label htmlFor={`new_${categoryType}_icon`} className="text-xs">
              Icon
            </Label>
            <Input
              id={`new_${categoryType}_icon`}
              name="icon"
              maxLength={2}
              placeholder="🐶"
              className="h-9 text-center"
            />
          </div>

          <SubmitButton type="submit" size="sm" className="h-9" pendingText="Adding">
            Add
          </SubmitButton>
        </form>
      </CollapsiblePanel>
    </Collapsible>
  )
}

export function CategoriesStep({
  categories,
}: {
  categories: OnboardingCategory[]
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {groups.map((group) => {
          const groupCategories = categories.filter(
            (category) => category.category_type === group.value
          )

          return (
            <Collapsible
              key={group.value}
              defaultOpen
              className="rounded-xl border"
            >
              <CollapsibleTrigger className="group w-full justify-between px-3 py-2.5 text-foreground">
                <span className="flex items-center gap-2">
                  <span className="text-sm font-bold">{group.label}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                    {groupCategories.length}{' '}
                    {groupCategories.length === 1 ? 'category' : 'categories'}
                  </span>
                </span>
                <ChevronDown
                  className="size-4 transition-transform group-aria-expanded:rotate-180"
                  aria-hidden="true"
                />
              </CollapsibleTrigger>
              <CollapsiblePanel>
                <div className="border-t px-1 py-1">
                  <ul>
                    {groupCategories.map((category) => (
                      <CategoryRow key={category.id} category={category} />
                    ))}
                  </ul>
                  <AddCategoryForm
                    categoryType={group.value}
                    reportingType={group.reportingType}
                  />
                </div>
              </CollapsiblePanel>
            </Collapsible>
          )
        })}
      </div>

      <div className="flex flex-col gap-2 pt-1">
        <Link
          href="/onboarding/done"
          className={cn(buttonVariants(), 'h-11 w-full rounded-xl')}
        >
          Continue →
        </Link>
        <Link
          href="/onboarding/done"
          className={cn(
            buttonVariants({ variant: 'ghost' }),
            'h-11 w-full rounded-xl'
          )}
        >
          Skip, I&apos;ll customize later
        </Link>
      </div>
    </div>
  )
}
