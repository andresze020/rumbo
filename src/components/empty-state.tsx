import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'

type EmptyStateProps = {
  title: string
  description: string
  actionHref?: string
  actionLabel?: string
}

export function EmptyState({
  title,
  description,
  actionHref,
  actionLabel,
}: EmptyStateProps) {
  return (
    <div className="rounded-lg border border-dashed p-6 text-sm">
      <div className="max-w-xl space-y-2">
        <p className="font-medium text-foreground">{title}</p>
        <p className="text-muted-foreground">{description}</p>
        {actionHref && actionLabel ? (
          <Link
            href={actionHref}
            className={buttonVariants({
              variant: 'outline',
              size: 'sm',
              className: 'mt-2',
            })}
          >
            {actionLabel}
          </Link>
        ) : null}
      </div>
    </div>
  )
}
