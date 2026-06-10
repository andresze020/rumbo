'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/components/language-provider'
import type { Locale } from '@/lib/i18n/dictionaries'

const LANGUAGES: { value: Locale; labelKey: 'settings.language.english' | 'settings.language.spanish' }[] = [
  { value: 'en', labelKey: 'settings.language.english' },
  { value: 'es', labelKey: 'settings.language.spanish' },
]

export function LanguageSection() {
  const { locale, setLocale, t, isPending } = useLanguage()

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings.language.title')}</CardTitle>
        <CardDescription>{t('settings.language.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2">
          {LANGUAGES.map(({ value, labelKey }) => (
            <button
              key={value}
              type="button"
              disabled={isPending}
              onClick={() => setLocale(value)}
              className={cn(
                'flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                locale === value
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
                isPending && 'opacity-60'
              )}
            >
              {t(labelKey)}
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
