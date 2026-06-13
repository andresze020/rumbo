import { cookies } from 'next/headers'
import { LOCALES, type Locale } from './dictionaries'

export const LOCALE_COOKIE = 'af_locale'
export const DEFAULT_LOCALE: Locale = 'en'

export function isLocale(value: string): value is Locale {
  return (LOCALES as string[]).includes(value)
}

export async function getLocale(): Promise<Locale> {
  const store = await cookies()
  const value = store.get(LOCALE_COOKIE)?.value
  return value && isLocale(value) ? value : DEFAULT_LOCALE
}
