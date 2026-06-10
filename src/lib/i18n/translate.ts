import { dictionaries, type Locale } from './dictionaries'

type Dictionary = typeof dictionaries.en

type DotPaths<T> = T extends Record<string, unknown>
  ? {
      [K in keyof T & string]: T[K] extends Record<string, unknown>
        ? `${K}.${DotPaths<T[K]>}`
        : K
    }[keyof T & string]
  : never

export type TranslationKey = DotPaths<Dictionary>

function lookup(dictionary: Record<string, unknown>, key: string): string {
  const value = key
    .split('.')
    .reduce<unknown>((acc, part) => {
      if (acc && typeof acc === 'object' && part in acc) {
        return (acc as Record<string, unknown>)[part]
      }
      return undefined
    }, dictionary)

  return typeof value === 'string' ? value : key
}

export function translate(
  locale: Locale,
  key: TranslationKey,
  vars?: Record<string, string | number>
): string {
  const template = lookup(dictionaries[locale], key)
  if (!vars) return template

  return Object.entries(vars).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
    template
  )
}
