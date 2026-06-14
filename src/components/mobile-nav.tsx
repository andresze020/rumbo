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
        'sticky top-0 z-40 flex h-14 shrink-0 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/70',
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
