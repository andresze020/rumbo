'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Check, Plus, Tags, X } from 'lucide-react'
import { TagChip } from '@/components/tag-chip'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

export type TagOption = {
  id: string
  name: string
  color: string | null
}

type TagMultiSelectProps = {
  tags: TagOption[]
  /** Tag ids selected on mount (edit form). */
  defaultValue?: string[]
  label: string
  helpText?: string
  emptyHint: string
  manageLabel: string
}

/**
 * Self-contained multi-select for transaction tags. Renders the selected tags
 * as removable chips plus an inline searchable picker, and emits the selection
 * as hidden inputs so a plain `<form action=…>` submits it: one `tag_id` per
 * selected tag, and a `tags_present` sentinel so the server action can tell
 * "cleared all tags" (present, empty) from "form didn't manage tags" (absent).
 * Inline (no portal) — it lives inside a scrollable dialog, so there's nothing
 * to overflow.
 */
export function TagMultiSelect({
  tags,
  defaultValue = [],
  label,
  helpText,
  emptyHint,
  manageLabel,
}: TagMultiSelectProps) {
  const tagsById = useMemo(() => new Map(tags.map((tag) => [tag.id, tag])), [tags])
  // Keep only ids that still exist among the offered tags.
  const [selected, setSelected] = useState<string[]>(() =>
    defaultValue.filter((id) => tagsById.has(id))
  )
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const selectedSet = useMemo(() => new Set(selected), [selected])
  const query = search.trim().toLowerCase()
  const matches = useMemo(
    () => tags.filter((tag) => !query || tag.name.toLowerCase().includes(query)),
    [tags, query]
  )

  function toggle(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  const selectedTags = selected
    .map((id) => tagsById.get(id))
    .filter((tag): tag is TagOption => Boolean(tag))

  return (
    <div className="space-y-1.5">
      <input type="hidden" name="tags_present" value="1" />
      {selected.map((id) => (
        <input key={id} type="hidden" name="tag_id" value={id} />
      ))}

      <div className="flex items-center justify-between gap-2">
        <Label>{label}</Label>
        <Link
          href="/dashboard/tags"
          className="text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          {manageLabel}
        </Link>
      </div>

      {tags.length === 0 ? (
        <p className="rounded-xl border border-dashed px-3 py-2.5 text-xs text-muted-foreground">
          {emptyHint}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-1.5 rounded-xl border bg-background p-2">
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
            <button
              type="button"
              onClick={() => setOpen((value) => !value)}
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

          {open ? (
            <div className="rounded-xl border bg-popover p-2 shadow-sm">
              <Input
                autoFocus
                placeholder="Search tags…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8"
              />
              <div className="mt-2 max-h-48 overflow-y-auto">
                {matches.length === 0 ? (
                  <p className="px-2 py-2 text-xs text-muted-foreground">No tags match.</p>
                ) : (
                  matches.map((tag) => {
                    const isSelected = selectedSet.has(tag.id)
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() => toggle(tag.id)}
                        className={cn(
                          'flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm',
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
                  })
                )}
              </div>
            </div>
          ) : null}
        </>
      )}

      {helpText ? (
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <Tags className="size-3" aria-hidden="true" />
          {helpText}
        </p>
      ) : null}
    </div>
  )
}
