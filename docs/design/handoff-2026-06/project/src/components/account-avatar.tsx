import { getAccountVisual } from '@/lib/account-display'
import { cn } from '@/lib/utils'

type AccountAvatarProps = {
  accountType: string
  /** User-chosen emoji from account metadata — overrides the default icon. */
  emoji?: string | null
  /** User-chosen CSS color from account metadata — tints the glyph. */
  color?: string | null
  size?: 'sm' | 'md'
  className?: string
}

/**
 * Rounded, softly-tinted tile representing an account. Replaces the old
 * tiny color dot + emoji with a single scannable, accessible avatar.
 */
export function AccountAvatar({
  accountType,
  emoji,
  color,
  size = 'md',
  className,
}: AccountAvatarProps) {
  const visual = getAccountVisual(accountType)
  const Icon = visual.Icon
  const dimensions = size === 'sm' ? 'size-8' : 'size-10'
  const glyph = size === 'sm' ? 'text-sm' : 'text-base'

  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ring-black/[0.04] dark:ring-white/[0.06]',
        dimensions,
        visual.surface,
        className
      )}
    >
      {emoji ? (
        <span className={cn('leading-none', glyph)} style={color ? { color } : undefined}>
          {emoji}
        </span>
      ) : (
        <Icon
          className={cn(size === 'sm' ? 'size-4' : 'size-5', visual.icon)}
          style={color ? { color } : undefined}
        />
      )}
    </span>
  )
}
