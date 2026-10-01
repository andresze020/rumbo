'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * The category-type tab row (MQ-016). On a phone the five tabs are wider than
 * the screen, and a row cut off at "Adjustmen…" gave no hint that it scrolls.
 *
 * - A fade on whichever edge has more tabs behind it says "there is more".
 * - The active tab is scrolled into view on arrival, so picking "Adjustment"
 *   does not land on a page whose highlighted tab is off-screen.
 *
 * The fades sit outside the scroller so they stay put while the tabs move.
 */
export function TypeTabs({ children }: { children: ReactNode }) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ start: false, end: false })

  useEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller) return

    // Horizontal only: `scrollIntoView` would also move the page scroller.
    const active = scroller.querySelector<HTMLElement>('[aria-current="page"]')
    if (active) {
      scroller.scrollLeft =
        active.offsetLeft - (scroller.clientWidth - active.offsetWidth) / 2
    }

    const update = () => {
      const max = scroller.scrollWidth - scroller.clientWidth
      setEdges({ start: scroller.scrollLeft > 1, end: scroller.scrollLeft < max - 1 })
    }
    update()
    scroller.addEventListener('scroll', update, { passive: true })
    const observer = new ResizeObserver(update)
    observer.observe(scroller)
    return () => {
      scroller.removeEventListener('scroll', update)
      observer.disconnect()
    }
  }, [])

  const fade = 'pointer-events-none absolute inset-y-0 w-8 transition-opacity duration-150'

  return (
    <div className="relative min-w-0 rounded-xl border bg-card md:rounded-lg md:bg-background">
      <div
        ref={scrollerRef}
        className="flex overflow-x-auto p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </div>
      <span
        aria-hidden="true"
        className={cn(
          fade,
          'left-0 rounded-l-[inherit] bg-gradient-to-r from-card to-transparent md:from-background',
          edges.start ? 'opacity-100' : 'opacity-0'
        )}
      />
      <span
        aria-hidden="true"
        className={cn(
          fade,
          'right-0 rounded-r-[inherit] bg-gradient-to-l from-card to-transparent md:from-background',
          edges.end ? 'opacity-100' : 'opacity-0'
        )}
      />
    </div>
  )
}
