'use client'

import { useEffect, useMemo, useState } from 'react'
import { LOCALES, type Locale } from './dictionaries'
import { createUiTranslator } from './ui'

export function useUiTranslation() {
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setHydrated(true))
    return () => window.cancelAnimationFrame(frame)
  }, [])

  const documentLocale =
    hydrated && typeof document !== 'undefined'
      ? document.documentElement.lang
      : 'en'
  const locale: Locale = LOCALES.includes(documentLocale as Locale)
    ? (documentLocale as Locale)
    : 'en'
  return useMemo(() => createUiTranslator(locale), [locale])
}
