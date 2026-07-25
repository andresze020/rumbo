'use client'

import {
  Children,
  cloneElement,
  createContext,
  isValidElement,
  useContext,
  useEffect,
  useMemo,
  useState,
  useTransition,
  type ReactElement,
  type ReactNode,
} from 'react'
import { useRouter } from 'next/navigation'
import { setLocaleAction } from '@/lib/i18n/actions'
import type { Locale } from '@/lib/i18n/dictionaries'
import { translate, type TranslationKey } from '@/lib/i18n/translate'
import { translateUi } from '@/lib/i18n/ui'
import { systemCategoryTranslations } from '@/lib/i18n/system-category-names'

type LanguageContextValue = {
  locale: Locale
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string
  setLocale: (locale: Locale) => void
  isPending: boolean
}

const LanguageContext = createContext<LanguageContextValue | null>(null)
const visibleProps = new Set([
  'alt',
  'aria-label',
  'description',
  'label',
  'placeholder',
  'title',
])
const skippedTags = new Set(['code', 'noscript', 'pre', 'script', 'style', 'textarea'])

function localizeText(value: string, locale: Locale) {
  const translated = translateUi(locale, value)
  return translated === value
    ? (systemCategoryTranslations[locale][value] ?? value)
    : translated
}

function localizeNode(node: ReactNode, locale: Locale): ReactNode {
  if (typeof node === 'string') return localizeText(node, locale)
  if (Array.isArray(node)) return node.map((child) => localizeNode(child, locale))
  if (!isValidElement(node)) return node

  const element = node as ReactElement<Record<string, unknown>>
  const hostTag = typeof element.type === 'string' ? element.type.toLowerCase() : null
  if (hostTag && skippedTags.has(hostTag)) return node

  const nextProps: Record<string, unknown> = {}
  for (const [name, value] of Object.entries(element.props)) {
    if (name === 'children') {
      nextProps.children = Children.map(value as ReactNode, (child) =>
        localizeNode(child, locale)
      )
    } else if (visibleProps.has(name) && typeof value === 'string') {
      nextProps[name] = localizeText(value, locale)
    }
  }
  return cloneElement(element, nextProps)
}

export function LanguageProvider({
  locale,
  children,
}: {
  locale: Locale
  children: ReactNode
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setHydrated(true))
    return () => window.cancelAnimationFrame(frame)
  }, [])

  const localizedChildren = useMemo(
    () => (hydrated ? localizeNode(children, locale) : children),
    [children, hydrated, locale]
  )

  function setLocale(next: Locale) {
    if (next === locale) return
    startTransition(async () => {
      await setLocaleAction(next)
      router.refresh()
    })
  }

  function t(key: TranslationKey, vars?: Record<string, string | number>) {
    return translate(locale, key, vars)
  }

  return (
    <LanguageContext.Provider value={{ locale, t, setLocale, isPending }}>
      {localizedChildren}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  const context = useContext(LanguageContext)
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider')
  }
  return context
}

export function useOptionalLanguage() {
  return useContext(LanguageContext)
}
