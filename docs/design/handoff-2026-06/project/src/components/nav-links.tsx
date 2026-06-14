'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

type NavLink = {
  href: string
  label: string
}

export function NavLinks({
  links,
  variant = 'desktop',
}: {
  links: NavLink[]
  variant?: 'desktop' | 'mobile'
}) {
  const pathname = usePathname()

  function isActive(href: string) {
    if (href === '/dashboard') {
      return pathname === '/dashboard'
    }
    return pathname.startsWith(href)
  }

  if (variant === 'mobile') {
    return (
      <nav className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              'rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
              isActive(link.href)
                ? 'border-primary/30 bg-primary/8 text-primary'
                : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            {link.label}
          </Link>
        ))}
      </nav>
    )
  }

  return (
    <nav className="flex gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          aria-current={isActive(link.href) ? 'page' : undefined}
          className={cn(
            'shrink-0 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors',
            isActive(link.href)
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          )}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  )
}
