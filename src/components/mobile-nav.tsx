'use client'

import Link from 'next/link'
import { Wallet } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ThemeToggle } from '@/components/theme-toggle'
import { useLanguage } from '@/components/language-provider'

/**
 * Slim mobile top bar (brand + theme). Navigation lives in the bottom-nav
 * (`MobileBottomNav`) and the "More" page; this no longer hosts a slide-out
 * Sheet menu.
 */
export function MobileNav({ className }: { className?: string }) {
  const { t } = useLanguage()

  return (
    <header
      className={cn(
        // A plain flex row in the app shell, not `fixed` over the page. The
        // shell does not scroll, so this cannot be scrolled away from, and
        // there is no viewport geometry to track to keep it in place — see the
        // comment on the shell in `app/dashboard/layout.tsx`.
        'z-10 flex h-[calc(3.5rem+env(safe-area-inset-top))] shrink-0 items-center gap-3 border-b bg-background px-4 pt-[env(safe-area-inset-top)]',
        className
      )}
    >
      <Link href="/dashboard" className="flex items-center gap-2">
        <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Wallet className="size-4" aria-hidden="true" />
        </span>
        <span className="text-sm font-semibold">{t('nav.appName')}</span>
      </Link>

      <div className="ml-auto">
        <ThemeToggle />
      </div>
    </header>
  )
}
