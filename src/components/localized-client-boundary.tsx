'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { useLanguage } from '@/components/language-provider'
import { translateUi } from '@/lib/i18n/ui'
import { systemCategoryTranslations } from '@/lib/i18n/system-category-names'

const attributes = ['alt', 'aria-label', 'placeholder', 'title']
const skippedTags = new Set(['CODE', 'NOSCRIPT', 'PRE', 'SCRIPT', 'STYLE', 'TEXTAREA'])

/**
 * Compatibility boundary for hydrated client widgets that still contain
 * audited English literals. It only mutates its own subtree after that client
 * boundary commits, avoiding pre-hydration document-wide translation.
 */
export function LocalizedClientBoundary({ children }: { children: ReactNode }) {
  const { locale } = useLanguage()
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = rootRef.current
    if (!root) return

    const translateValue = (value: string) => {
      const translated = translateUi(locale, value)
      return translated === value
        ? (systemCategoryTranslations[locale][value] ?? value)
        : translated
    }

    const translateNode = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const parent = node.parentElement
        if (!parent || skippedTags.has(parent.tagName)) return
        const source = node.textContent ?? ''
        const leading = source.match(/^\s*/)?.[0] ?? ''
        const trailing = source.match(/\s*$/)?.[0] ?? ''
        const translated = translateValue(source.trim())
        if (translated !== source.trim()) node.textContent = `${leading}${translated}${trailing}`
        return
      }
      if (!(node instanceof Element) || skippedTags.has(node.tagName)) return
      for (const attribute of attributes) {
        const source = node.getAttribute(attribute)
        if (!source) continue
        const translated = translateValue(source)
        if (translated !== source) node.setAttribute(attribute, translated)
      }
    }

    const translateTree = (node: Node) => {
      translateNode(node)
      const walker = document.createTreeWalker(
        node,
        NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT
      )
      let current = walker.nextNode()
      while (current) {
        translateNode(current)
        current = walker.nextNode()
      }
    }

    translateTree(root)
    const observer = new MutationObserver((mutations) => {
      observer.disconnect()
      for (const mutation of mutations) {
        if (mutation.type === 'attributes' || mutation.type === 'characterData') {
          translateNode(mutation.target)
        } else {
          mutation.addedNodes.forEach(translateTree)
        }
      }
      observer.observe(root, {
        attributes: true,
        attributeFilter: attributes,
        characterData: true,
        childList: true,
        subtree: true,
      })
    })
    observer.observe(root, {
      attributes: true,
      attributeFilter: attributes,
      characterData: true,
      childList: true,
      subtree: true,
    })
    return () => observer.disconnect()
  }, [locale])

  return (
    <div ref={rootRef} className="contents">
      {children}
    </div>
  )
}
