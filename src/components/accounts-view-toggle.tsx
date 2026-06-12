'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { LayoutList, Rows3 } from 'lucide-react'
import { setAccountsViewAction } from '@/lib/accounts-view/actions'
import type { AccountsView } from '@/lib/accounts-view/server'
import { cn } from '@/lib/utils'

const OPTIONS: { value: AccountsView; label: string; icon: typeof Rows3 }[] = [
  { value: 'group', label: 'Group', icon: Rows3 },
  { value: 'list', label: 'List', icon: LayoutList },
]

export function AccountsViewToggle({ view }: { view: AccountsView }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function select(next: AccountsView) {
    if (next === view) return
    startTransition(async () => {
      await setAccountsViewAction(next)
      router.refresh()
    })
  }

  return (
    <div
      className="inline-flex items-center gap-1 rounded-lg border bg-card p-0.5"
      role="group"
      aria-label="Account view"
    >
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          onClick={() => select(value)}
          disabled={isPending}
          aria-pressed={view === value}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-60',
            view === value
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          )}
        >
          <Icon className="size-3.5" aria-hidden="true" />
          {label}
        </button>
      ))}
    </div>
  )
}
