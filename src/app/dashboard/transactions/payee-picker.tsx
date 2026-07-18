'use client'

import { useId, useState } from 'react'
import { Autocomplete } from '@base-ui/react/autocomplete'
import { Plus, Store } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export type PayeeOption = {
  id: string
  name: string
}

type PayeePickerProps = {
  payees: PayeeOption[]
  defaultValue?: string
  label: string
  /** Helper line explaining the "search existing or create new" behavior. */
  helpText?: string
  /** Optional explicit id (defaults to a generated one). */
  inputId?: string
  /** Override the label styling (e.g. the compact inline quick-edit). */
  labelClassName?: string
}

/** Cap the rendered list so a large household doesn't paint hundreds of rows. */
const MAX_VISIBLE = 50

type ListItem =
  | { kind: 'payee'; id: string; name: string }
  | { kind: 'create'; name: string }

/**
 * Searchable combobox for the transaction form's payee field (BR-009). Built on
 * Base UI's Autocomplete (the same primitive family as the app's Dialog/Select),
 * so the dropdown renders in a properly layered floating portal: it never gets
 * clipped by the transaction dialog's scroll area, flips/repositions on scroll
 * and resize, and interacting with it doesn't dismiss the parent dialog.
 *
 * `mode="none"` disables the library's internal filtering so we compose the list
 * ourselves — substring matches plus an explicit "Create …" row for a new payee.
 * The input always submits `payee_name`; the backend resolves it into `payee_id`
 * (get-or-create) and keeps `merchant_name` in sync for existing displays.
 */
export function PayeePicker({
  payees,
  defaultValue,
  label,
  helpText,
  inputId,
  labelClassName,
}: PayeePickerProps) {
  const generatedId = useId()
  const id = inputId ?? `payee_${generatedId}`

  const [query, setQuery] = useState(defaultValue ?? '')
  const trimmed = query.trim()
  const normalized = trimmed.toLowerCase()

  const allMatches = normalized
    ? payees.filter((p) => p.name.toLowerCase().includes(normalized))
    : payees
  const visibleMatches = allMatches.slice(0, MAX_VISIBLE)
  const hiddenCount = allMatches.length - visibleMatches.length
  const hasExact = payees.some((p) => p.name.toLowerCase() === normalized)

  const items: ListItem[] = visibleMatches.map((p) => ({
    kind: 'payee',
    id: p.id,
    name: p.name,
  }))
  if (trimmed && !hasExact) {
    items.push({ kind: 'create', name: trimmed })
  }

  return (
    <Autocomplete.Root
      items={items}
      value={query}
      onValueChange={setQuery}
      mode="none"
      openOnInputClick
      itemToStringValue={(item: ListItem) => item.name}
    >
      <div className="space-y-1.5">
        <Label htmlFor={id} className={labelClassName}>{label}</Label>
        <div className="relative">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 z-10 flex size-5 -translate-y-1/2 items-center justify-center text-muted-foreground"
          >
            <Store className="size-4.5" />
          </span>
          <Autocomplete.Input
            id={id}
            name="payee_name"
            placeholder="Search or add a payee"
            render={<Input className="pl-10" />}
          />
        </div>
        {helpText ? (
          <p className="text-xs text-muted-foreground">{helpText}</p>
        ) : null}
      </div>

      <Autocomplete.Portal>
        <Autocomplete.Positioner
          side="bottom"
          sideOffset={4}
          align="start"
          className="isolate z-50"
        >
          <Autocomplete.Popup className="max-h-(--available-height) w-(--anchor-width) min-w-[12rem] overflow-y-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10">
            <Autocomplete.Empty className="px-2 py-2 text-sm text-muted-foreground">
              No payees yet — type a name to create one.
            </Autocomplete.Empty>

            <Autocomplete.List>
              {(item: ListItem) =>
                item.kind === 'payee' ? (
                  <Autocomplete.Item
                    key={`p_${item.id}`}
                    value={item}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-muted-foreground outline-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                  >
                    <Store className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">{item.name}</span>
                  </Autocomplete.Item>
                ) : (
                  <Autocomplete.Item
                    key="__create__"
                    value={item}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm outline-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                  >
                    <Plus className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">
                      Create “<span className="font-semibold">{item.name}</span>”
                    </span>
                  </Autocomplete.Item>
                )
              }
            </Autocomplete.List>

            {hiddenCount > 0 ? (
              <p className="px-2 py-1.5 text-xs text-muted-foreground">
                {hiddenCount} more — keep typing to narrow.
              </p>
            ) : null}
          </Autocomplete.Popup>
        </Autocomplete.Positioner>
      </Autocomplete.Portal>
    </Autocomplete.Root>
  )
}
