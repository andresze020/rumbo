import type { Locale } from './dictionaries'
import { legacyUiTranslations } from './legacy-ui-translations'

type UiValues = Record<string, string | number> | Array<string | number>
type TranslationMap = Record<string, string>

const templateCache = new Map<Locale, Array<{
  regex: RegExp
  translation: string
}>>()

function interpolate(template: string, values?: UiValues) {
  if (!values) return template
  let text = template
  if (Array.isArray(values)) {
    values.forEach((value, index) => {
      text = text.replaceAll(`{${index + 1}}`, String(value))
    })
    return text
  }
  Object.entries(values).forEach(([name, value]) => {
    text = text.replaceAll(`{${name}}`, String(value))
  })
  return text
}

/**
 * Translates an English UI literal from the audited legacy catalog.
 *
 * New feature code should prefer typed keys from dictionaries.ts. This helper
 * exists to migrate the large pre-i18n surface without relying on DOM mutation.
 */
export function translateUi(
  locale: Locale,
  source: string,
  values?: UiValues
) {
  if (locale === 'en') return interpolate(source, values)
  const dictionary = legacyUiTranslations[locale] as TranslationMap
  const exact = dictionary[source]
  if (exact) return interpolate(exact, values)

  let templates = templateCache.get(locale)
  if (!templates) {
    templates = Object.entries(dictionary)
      .filter(([candidate]) => /\{\d+\}/.test(candidate))
      .map(([candidate, translation]) => ({
        regex: new RegExp(
          `^${candidate
            .split(/(\{\d+\})/)
            .map((part) =>
              /^\{\d+\}$/.test(part)
                ? '(.+?)'
                : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            )
            .join('')}$`
        ),
        translation,
      }))
      .sort((a, b) => b.regex.source.length - a.regex.source.length)
    templateCache.set(locale, templates)
  }

  for (const template of templates) {
    const match = source.match(template.regex)
    if (!match) continue
    return match
      .slice(1)
      .reduce(
        (text, value, index) =>
          text.replaceAll(`{${index + 1}}`, value),
        template.translation
      )
  }
  return interpolate(source, values)
}

export function createUiTranslator(locale: Locale) {
  return (source: string, values?: UiValues) =>
    translateUi(locale, source, values)
}
