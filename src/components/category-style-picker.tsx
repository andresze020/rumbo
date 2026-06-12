'use client'

import { useState } from 'react'
import { Check } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CATEGORY_COLORS, CATEGORY_ICONS } from '@/lib/categories/style'
import { cn } from '@/lib/utils'

type CategoryStylePickerProps = {
  mode: string
  defaultColor?: string | null
  defaultIcon?: string | null
}

/**
 * Color + icon picker for categories: click a curated swatch / emoji, or use the
 * custom escape hatch (native color input / paste any emoji). Feeds hidden inputs
 * named `color` and `icon` so the existing server actions are unchanged.
 */
export function CategoryStylePicker({
  mode,
  defaultColor,
  defaultIcon,
}: CategoryStylePickerProps) {
  const [color, setColor] = useState(defaultColor ?? '')
  const [icon, setIcon] = useState(defaultIcon ?? '')

  const isCustomColor = Boolean(color) && !CATEGORY_COLORS.includes(color as never)

  return (
    <div className="space-y-4">
      {/* Hidden inputs the form action reads */}
      <input type="hidden" name="color" value={color} />
      <input type="hidden" name="icon" value={icon} />

      {/* Color */}
      <div className="space-y-2">
        <Label>Color</Label>
        <div className="flex flex-wrap items-center gap-1.5">
          {CATEGORY_COLORS.map((swatch) => (
            <button
              key={swatch}
              type="button"
              onClick={() => setColor((current) => (current === swatch ? '' : swatch))}
              className={cn(
                'flex size-7 items-center justify-center rounded-full ring-1 ring-inset ring-black/10 transition-transform hover:scale-110 dark:ring-white/15',
                color === swatch && 'ring-2 ring-offset-2 ring-foreground ring-offset-background'
              )}
              style={{ backgroundColor: swatch }}
              aria-label={`Color ${swatch}`}
              aria-pressed={color === swatch}
            >
              {color === swatch ? <Check className="size-3.5 text-white" /> : null}
            </button>
          ))}

          {/* Custom escape hatch */}
          <label
            className={cn(
              'flex size-7 cursor-pointer items-center justify-center rounded-full border border-dashed text-[10px] text-muted-foreground',
              isCustomColor && 'ring-2 ring-offset-2 ring-foreground ring-offset-background'
            )}
            style={isCustomColor ? { backgroundColor: color } : undefined}
            title="Custom color"
          >
            <input
              type="color"
              value={color || '#64748b'}
              onChange={(e) => setColor(e.target.value)}
              className="sr-only"
              aria-label="Custom color"
            />
            {isCustomColor ? null : '+'}
          </label>

          {color ? (
            <button
              type="button"
              onClick={() => setColor('')}
              className="ml-1 text-xs text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
          ) : null}
        </div>
      </div>

      {/* Icon */}
      <div className="space-y-2">
        <Label>Icon</Label>
        <div className="flex flex-wrap gap-1">
          {CATEGORY_ICONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => setIcon((current) => (current === emoji ? '' : emoji))}
              className={cn(
                'flex size-8 items-center justify-center rounded-lg text-base transition-colors hover:bg-muted',
                icon === emoji && 'bg-primary/10 ring-2 ring-inset ring-primary'
              )}
              aria-label={`Icon ${emoji}`}
              aria-pressed={icon === emoji}
            >
              {emoji}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Input
            id={`icon_custom_${mode}`}
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
            placeholder="Or paste any emoji"
            className="h-8 max-w-[12rem]"
            maxLength={8}
          />
          {icon ? (
            <button
              type="button"
              onClick={() => setIcon('')}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
