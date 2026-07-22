'use client'

import type { ComponentProps, ReactNode } from 'react'
import { CalendarDays, ChevronDown } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { nativeSelectCls, selectFieldCls } from '@/lib/form-styles'
import { cn } from '@/lib/utils'

/**
 * Shared building blocks for the app's native-style forms: tall rounded
 * fields, icon-led selects with a custom chevron, and segmented controls.
 * Keep every entry form on these primitives so the whole app feels like one
 * product (see the transaction form for the reference layout).
 * Class-only consumers (server components) import from '@/lib/form-styles'.
 */

export { nativeSelectCls, selectFieldCls }

/**
 * Native select dressed as an app-style field: label, optional leading icon,
 * trailing chevron. Pass `leading={null}` when the selected option's text
 * already starts with an emoji, so the icon doesn't show twice.
 */
export function SelectField({
  id,
  label,
  leading,
  children,
  className,
  ...selectProps
}: ComponentProps<'select'> & {
  id: string
  label: ReactNode
  leading?: ReactNode | null
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        {leading ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center text-muted-foreground"
          >
            {leading}
          </span>
        ) : null}
        <select
          id={id}
          className={cn(selectFieldCls, !leading && 'pl-3.5', className)}
          {...selectProps}
        >
          {children}
        </select>
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
      </div>
    </div>
  )
}

/** Labelled date input with the calendar glyph, matching SelectField's look. */
export function DateField({
  id,
  label,
  className,
  ...inputProps
}: ComponentProps<'input'> & {
  id: string
  label: ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <CalendarDays
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 size-4.5 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          id={id}
          type="date"
          className={cn('pl-10', className)}
          // Open the native calendar on any click/focus of the field, so the
          // user doesn't have to hit the small picker glyph.
          onClick={(e) => {
            try {
              ;(e.currentTarget as HTMLInputElement).showPicker?.()
            } catch {
              // showPicker() throws if the picker is already open; ignore.
            }
          }}
          {...inputProps}
        />
      </div>
    </div>
  )
}

export type SegmentedOption = {
  value: string
  label: ReactNode
  /** Extra classes applied to the active pill (e.g. a per-type accent color). */
  activeCls?: string
}

/**
 * iOS-style segmented control backed by a hidden input (when `name` is given)
 * so plain server-action forms keep working.
 */
export function SegmentedField({
  label,
  name,
  value,
  onChange,
  options,
  size = 'default',
}: {
  label?: ReactNode
  name?: string
  value: string
  onChange: (value: string) => void
  options: SegmentedOption[]
  size?: 'default' | 'sm'
}) {
  return (
    <div className={label ? 'space-y-1.5' : undefined}>
      {label ? <Label>{label}</Label> : null}
      {name ? <input type="hidden" name={name} value={value} /> : null}
      <div
        role="group"
        className="grid gap-1 rounded-xl bg-muted p-1"
        style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      >
        {options.map((option) => {
          const isActive = value === option.value
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={isActive}
              onClick={() => onChange(option.value)}
              className={cn(
                'flex items-center justify-center gap-1.5 rounded-lg text-sm font-medium transition-all',
                size === 'sm' ? 'h-8' : 'h-9',
                isActive
                  ? cn('bg-background text-foreground shadow-sm', option.activeCls)
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {option.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
