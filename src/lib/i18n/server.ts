import { cookies } from 'next/headers'
import { LOCALES, type Locale } from './dictionaries'

export const LOCALE_COOKIE = 'af_locale'
export const DEFAULT_LOCALE: Locale = 'en'

export function isLocale(value: string): value is Locale {
  return (LOCALES as string[]).includes(value)
}

export function normalizeLocale(value: string | null | undefined): Locale | null {
  if (!value) return null

  const language = value.trim().toLowerCase().split(/[-_]/)[0]
  return isLocale(language) ? language : null
}

export async function getLocale(): Promise<Locale> {
  const store = await cookies()
  return normalizeLocale(store.get(LOCALE_COOKIE)?.value) ?? DEFAULT_LOCALE
}
