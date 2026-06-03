import Link from 'next/link'
import { Inbox } from 'lucide-react'
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
    <div className="rounded-xl border border-dashed px-6 py-12">
      <div className="mx-auto flex max-w-xs flex-col items-center gap-4 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-muted">
          <Inbox className="size-5 text-muted-foreground" aria-hidden="true" />
        </div>
        <div className="space-y-1.5">
          <p className="font-semibold text-foreground">{title}</p>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        {actionHref && actionLabel ? (
          <Link
            href={actionHref}
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            {actionLabel}
          </Link>
        ) : null}
      </div>
    </div>
  )
}
