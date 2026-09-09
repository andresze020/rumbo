'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Check, Plus, Tags, X } from 'lucide-react'
import { quickCreateTag } from '@/app/dashboard/quick-create-actions'
import { SelectorSheet } from '@/components/selector-sheet'
import { TagChip } from '@/components/tag-chip'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useIsMobile } from '@/lib/use-is-mobile'
import { cn } from '@/lib/utils'

export type TagOption = {
  id: string
  name: string
  color: string | null
}

type TagMultiSelectProps = {
  tags: TagOption[]
  /** Tag ids selected on mount (edit form). Ignored when `value` is given. */
  defaultValue?: string[]
  /**
   * Controlled selection. Pass both this and `onValueChange` when the parent
   * needs to read or seed the tags (the transaction form's category autofill
   * does); leave both off and the component owns its own state as before.
   */
  value?: string[]
  onValueChange?: (tagIds: string[]) => void
  /** Controlled disclosure, so the picker can be opened from outside. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  label: string
  helpText?: string
  emptyHint?: string
  manageLabel: string
}

/**
 * Self-contained multi-select for transaction tags. Renders the selected tags
 * as removable chips plus a searchable picker that can also **create a new tag
 * on the fly** (no need to leave a half-filled form), and emits the selection as
 * hidden inputs so a plain `<form action=…>` submits it: one `tag_id` per
 * selected tag, and a `tags_present` sentinel so the server action can tell
 * "cleared all tags" (present, empty) from "form didn't manage tags" (absent).
 *
 * Two surfaces for the picker itself, for one reason: the soft keyboard.
 * - **Desktop** gets the inline panel below the field, search at the top.
 * - **Mobile** gets the same full-screen `SelectorSheet` the account, category
 *   and payee pickers use, with the search **pinned under the sheet's header**
 *   so it cannot scroll away while you type. The old inline panel opened *in
 *   place*, wherever the field happened to sit in a scrolling form, and
 *   auto-focused its search — so the keyboard rose and buried both the list and
 *   the chips you were editing, and the only way back out was the button you
 *   came in through. The sheet repeats the selected chips above the list and
 *   closes from its header, Escape and Android Back.
 *
 * Neither surface autofocuses. The keyboard appears when the user taps the
 * search field on purpose, and not before.
 */
export function TagMultiSelect({
  tags,
  defaultValue = [],
  value,
  onValueChange,
  open: openProp,
  onOpenChange,
  label,
  helpText,
  manageLabel,
}: TagMultiSelectProps) {
  const isMobile = useIsMobile()
  // Tags created inline this session, merged into the offered list so they show
  // up and can be selected without a page reload.
  const [createdTags, setCreatedTags] = useState<TagOption[]>([])
  const allTags = useMemo(() => [...tags, ...createdTags], [tags, createdTags])
  const tagsById = useMemo(() => new Map(allTags.map((tag) => [tag.id, tag])), [allTags])
  const [uncontrolled, setUncontrolled] = useState<string[]>(() =>
    defaultValue.filter((id) => tags.some((tag) => tag.id === id))
  )
  const selected = value ?? uncontrolled
  const setSelected = (next: string[]) => {
    if (value === undefined) setUncontrolled(next)
    onValueChange?.(next)
  }

  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const open = openProp ?? uncontrolledOpen
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  /**
   * Search and error are cleared on the way *out*, not on the way in: every
   * open then starts blank whoever opened it — the chip below, or the
   * transaction form's entry chain — and no effect has to reset state after
   * the fact.
   */
  const setOpen = (next: boolean) => {
    if (!next) {
      setSearch('')
      setCreateError('')
    }
    if (openProp === undefined) setUncontrolledOpen(next)
    onOpenChange?.(next)
  }

  const selectedSet = useMemo(() => new Set(selected), [selected])
  const query = search.trim()
  const normalizedQuery = query.toLowerCase()
  const matches = useMemo(
    () =>
      allTags.filter(
        (tag) => !normalizedQuery || tag.name.toLowerCase().includes(normalizedQuery)
      ),
    [allTags, normalizedQuery]
  )
  const hasExact = allTags.some((tag) => tag.name.toLowerCase() === normalizedQuery)
  const canCreate = Boolean(query) && !hasExact

  function toggle(id: string) {
    setSelected(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id])
  }

  async function handleCreate() {
    if (!canCreate || creating) return
    setCreating(true)
    setCreateError('')
    const result = await quickCreateTag(query)
    setCreating(false)
    if ('error' in result) {
      setCreateError(result.error)
      return
    }
    const tag = result.tag
    setCreatedTags((prev) => (prev.some((t) => t.id === tag.id) ? prev : [...prev, tag]))
    if (!selected.includes(tag.id)) setSelected([...selected, tag.id])
    setSearch('')
  }

  const selectedTags = selected
    .map((id) => tagsById.get(id))
    .filter((tag): tag is TagOption => Boolean(tag))

  const removableChips = (
    <>
      {selectedTags.map((tag) => (
        <span key={tag.id} className="inline-flex items-center">
          <TagChip name={tag.name} color={tag.color} />
          <button
            type="button"
            onClick={() => toggle(tag.id)}
            aria-label={`Remove ${tag.name}`}
            className="-ml-1 flex size-5 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
          >
            <X className="size-3" aria-hidden="true" />
          </button>
        </span>
      ))}
    </>
  )

  // `type="search"` + `autoComplete="off"`: this filters the household's own
  // tags, and without the hint Android's autofill offers to fill it from the
  // saved-passwords / cards / addresses profile.
  const searchField = (
    <Input
      placeholder="Search or create a tag…"
      value={search}
      type="search"
      autoComplete="off"
      onChange={(e) => {
        setSearch(e.target.value)
        setCreateError('')
      }}
      onKeyDown={(e) => {
        // Enter creates the typed tag when it doesn't already exist.
        if (e.key === 'Enter' && canCreate) {
          e.preventDefault()
          void handleCreate()
        }
      }}
      className="h-9"
    />
  )

  // The matching tags plus the "Create …" row. The search box is a sibling of
  // this, not part of it, so the sheet can pin it above the scrolling list.
  const optionList = (
    <>
      {matches.map((tag) => {
        const isSelected = selectedSet.has(tag.id)
        return (
          <button
            key={tag.id}
            type="button"
            onClick={() => toggle(tag.id)}
            className={cn(
              'flex w-full items-center gap-2 rounded-lg px-2 py-2.5 text-left text-sm',
              isSelected ? 'bg-primary/10' : 'hover:bg-muted'
            )}
          >
            <span
              aria-hidden="true"
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: tag.color ?? 'var(--muted-foreground)' }}
            />
            <span className="min-w-0 flex-1 truncate">{tag.name}</span>
            {isSelected ? (
              <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />
            ) : null}
          </button>
        )
      })}

      {canCreate ? (
        <button
          type="button"
          disabled={creating}
          onClick={handleCreate}
          className="flex w-full items-center gap-2 rounded-lg px-2 py-2.5 text-left text-sm hover:bg-muted disabled:opacity-50"
        >
          <Plus className="size-4 shrink-0 text-primary" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">
            {creating ? (
              'Creating…'
            ) : (
              <>
                Create “<span className="font-semibold">{query}</span>”
              </>
            )}
          </span>
        </button>
      ) : null}

      {matches.length === 0 && !query ? (
        <p className="px-2 py-2 text-xs text-muted-foreground">
          Type to create your first tag.
        </p>
      ) : null}

      {createError ? (
        <p className="px-1 pt-1 text-xs text-destructive">{createError}</p>
      ) : null}
    </>
  )

  return (
    <div className="space-y-1.5">
      <input type="hidden" name="tags_present" value="1" />
      {selected.map((id) => (
        <input key={id} type="hidden" name="tag_id" value={id} />
      ))}

      {/* Hidden on phones: the picker button below already reads "Tags" when
          nothing is selected, so this row is a second label for the same
          control — and vertical space in the transaction sheet is the scarcest
          thing there is. The "Manage" link goes with it; the tags screen is a
          tap away in the nav. */}
      <div className="flex items-center justify-between gap-2 max-sm:hidden">
        <Label>{label}</Label>
        <Link
          href="/dashboard/tags"
          className="text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          {manageLabel}
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 rounded-xl border bg-background p-2">
        {removableChips}
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className={cn(
            'inline-flex items-center gap-1 rounded-full border border-dashed px-2 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
            selectedTags.length === 0 && 'border-solid'
          )}
        >
          <Plus className="size-3" aria-hidden="true" />
          {selectedTags.length === 0 ? label : 'Add'}
        </button>
      </div>

      {isMobile ? (
        <SelectorSheet
          open={open}
          onClose={() => setOpen(false)}
          title={label}
          search={searchField}
        >
          {/* The current selection, repeated inside the sheet. This is the whole
              point of the sheet: with the keyboard up, the field back in the
              form is off-screen, so what you have already tagged has to be
              visible here or you are picking blind. */}
          {selectedTags.length > 0 ? (
            <div className="mb-2 flex flex-wrap items-center gap-1.5 rounded-xl bg-muted/50 p-2">
              {removableChips}
            </div>
          ) : null}
          {optionList}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mt-3 h-11 w-full rounded-xl bg-primary text-sm font-medium text-primary-foreground"
          >
            Done
          </button>
        </SelectorSheet>
      ) : open ? (
        <div className="rounded-xl border bg-popover p-2 shadow-sm">
          {searchField}
          <div className="mt-2 max-h-48 overflow-y-auto">{optionList}</div>
        </div>
      ) : null}

      {helpText ? (
        <p className="flex items-center gap-1 text-xs text-muted-foreground max-sm:hidden">
          <Tags className="size-3" aria-hidden="true" />
          {helpText}
        </p>
      ) : null}
    </div>
  )
}
