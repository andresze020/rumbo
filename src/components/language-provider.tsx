'use client'

import { createContext, useContext, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { setLocaleAction } from '@/lib/i18n/actions'
import type { Locale } from '@/lib/i18n/dictionaries'
import { translate, type TranslationKey } from '@/lib/i18n/translate'

type LanguageContextValue = {
  locale: Locale
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string
  setLocale: (locale: Locale) => void
  isPending: boolean
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

export function LanguageProvider({
  locale,
  children,
}: {
  locale: Locale
  children: ReactNode
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

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
      {children}
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
