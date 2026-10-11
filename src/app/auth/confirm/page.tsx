import type { Metadata } from 'next'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { SubmitButton } from '@/components/submit-button'
import { getLocale } from '@/lib/i18n/server'
import { translate } from '@/lib/i18n/translate'
import { confirmEmailAction } from './actions'

// The URL carries a one-time token hash (and maybe an invitation path): it
// never travels on as a referrer, and the page stays out of search engines.
export const metadata: Metadata = {
  title: 'Rumbo',
  referrer: 'no-referrer',
  robots: { index: false, follow: false },
}

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

/**
 * HH-7: where the "Confirm signup" and "Magic Link" emails land:
 *
 *   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next={{ .RedirectTo }}
 *
 * Opening it does nothing: mail scanners and link previews fetch every link,
 * and a GET that verified would use the one-time token up before the person
 * clicked (Supabase "email prefetching"). The Continue button posts
 * confirmEmailAction, which verifies the token hash (no browser state needed,
 * so it works on any device) and forwards.
 */
export default async function ConfirmEmailPage({ searchParams }: Props) {
  const sp = await searchParams
  const locale = await getLocale()
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key)
  const value = (key: string) => (typeof sp[key] === 'string' ? (sp[key] as string) : '')
  const tokenHash = value('token_hash')
  const valid = /^[A-Za-z0-9_-]{8,256}$/.test(tokenHash) && value('type') !== ''

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary/8 via-background to-background p-4 sm:p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <p className="text-2xl font-bold tracking-tight">Rumbo</p>
          <CardTitle>{valid ? t('authConfirm.title') : t('authConfirm.invalidTitle')}</CardTitle>
          <CardDescription>{valid ? t('authConfirm.body') : t('authConfirm.invalidBody')}</CardDescription>
        </CardHeader>
        <CardContent>
          {valid ? (
            <form action={confirmEmailAction}>
              <input type="hidden" name="token_hash" value={tokenHash} />
              <input type="hidden" name="type" value={value('type')} />
              <input type="hidden" name="next" value={value('next')} />
              <SubmitButton type="submit" className="w-full" pendingText={t('authConfirm.continuing')}>
                {t('authConfirm.continue')}
              </SubmitButton>
            </form>
          ) : (
            <Link href="/login" className={buttonVariants({ className: 'w-full' })}>
              {t('authConfirm.goToLogin')}
            </Link>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
