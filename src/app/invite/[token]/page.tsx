import type { ReactNode } from 'react'
import type { Metadata } from 'next'
import { MailCheck, Users, Wallet } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Callout } from '@/components/callout'
import { SubmitButton } from '@/components/submit-button'
import { ConfirmActionButton } from '@/components/confirm-action-button'
import { createClient } from '@/lib/supabase/server'
import { getRequestUser } from '@/lib/supabase/request'
import { getLocale } from '@/lib/i18n/server'
import { translate, type TranslationKey } from '@/lib/i18n/translate'
import { localeToBcp47 } from '@/lib/format'
import { isHouseholdSharingEnabled } from '@/lib/households/sharing-flag'
import {
  isInvitationRefusal,
  isInvitationToken,
  parseInvitationPreview,
  type InvitationPreview,
} from '@/lib/households/invitations'
import {
  acceptInvitationAction,
  continueToSignInAction,
  declineInvitationAction,
  leaveInvitationAction,
  switchAccountForInviteAction,
} from './actions'

// S15: the link never travels on as a referrer, and the page stays out of
// search engines. (next.config.ts sends the same Referrer-Policy as a header.)
export const metadata: Metadata = {
  title: 'Rumbo',
  referrer: 'no-referrer',
  robots: { index: false, follow: false },
}

type InvitePageProps = {
  params: Promise<{ token: string }>
  searchParams: Promise<{ error?: string | string[]; declined?: string | string[] }>
}

/**
 * HH-4 — `/invite/<token>`, outside /dashboard so a signed-out invitee can
 * open it. Rendering never writes (S11): the preview is a STABLE read, and
 * every change is a button posting a Server Action. Nothing here logs the
 * token, and no third-party asset loads (S15). A household's name, inviter
 * and role show only to the invited, verified address (INV-6, INV-7, S12).
 */
export default async function InvitePage({ params, searchParams }: InvitePageProps) {
  const [{ token }, query, locale] = await Promise.all([params, searchParams, getLocale()])
  const t = (key: TranslationKey, vars?: Record<string, string | number>) => translate(locale, key, vars)

  // Flag off, or not even token-shaped: the same neutral dead end (INV-8).
  if (!isHouseholdSharingEnabled() || !isInvitationToken(token)) {
    return (
      <InviteShell tagline={t('invitations.tagline')}>
        <DeadEnd t={t} />
      </InviteShell>
    )
  }

  if (query.declined === '1') {
    return (
      <InviteShell tagline={t('invitations.tagline')}>
        <Message title={t('invitations.declined.title')} body={t('invitations.declined.body')} />
        <GoToRumbo label={t('invitations.goToRumbo')} />
      </InviteShell>
    )
  }

  const user = await getRequestUser()

  // INV-5: signed out. Nothing about the household is shown; the buttons set
  // the return cookie (S14) and go to sign in / sign up.
  if (!user) {
    return (
      <InviteShell tagline={t('invitations.tagline')}>
        <Message
          icon={<Users className="size-5" aria-hidden="true" />}
          title={t('invitations.signedOut.title')}
          body={t('invitations.signedOut.body')}
        />
        <div className="grid gap-2 sm:grid-cols-2">
          <form action={continueToSignInAction}>
            <input type="hidden" name="token" value={token} />
            <input type="hidden" name="mode" value="signin" />
            <SubmitButton type="submit" className="w-full">
              {t('invitations.signedOut.signIn')}
            </SubmitButton>
          </form>
          <form action={continueToSignInAction}>
            <input type="hidden" name="token" value={token} />
            <input type="hidden" name="mode" value="signup" />
            <SubmitButton type="submit" variant="outline" className="w-full">
              {t('invitations.signedOut.signUp')}
            </SubmitButton>
          </form>
        </div>
        <p className="text-xs text-muted-foreground">{t('invitations.signedOut.confirmHint')}</p>
      </InviteShell>
    )
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('get_household_invitation_preview', { p_token: token })
  const preview: InvitationPreview = error ? { status: 'unavailable' } : parseInvitationPreview(data)
  const errorCode = typeof query.error === 'string' && isInvitationRefusal(query.error) ? query.error : null
  // A refused Accept / Decline comes back here; say why while the link still works.
  const shownError = preview.status === 'ok' ? errorCode : null

  return (
    <InviteShell tagline={t('invitations.tagline')}>
      {shownError ? <Callout variant="error">{t(`invitations.errors.${shownError}`)}</Callout> : null}
      <PreviewBody preview={preview} token={token} locale={locale} t={t} />
    </InviteShell>
  )
}

function PreviewBody({
  preview,
  token,
  locale,
  t,
}: {
  preview: InvitationPreview
  token: string
  locale: Awaited<ReturnType<typeof getLocale>>
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string
}) {
  switch (preview.status) {
    case 'wrong_email':
      // INV-7: no household, inviter or role — only how to fix it.
      return (
        <>
          <Message title={t('invitations.wrongEmail.title')} body={t('invitations.wrongEmail.body')} />
          <form action={switchAccountForInviteAction}>
            <input type="hidden" name="token" value={token} />
            <SubmitButton type="submit" variant="outline" className="w-full">
              {t('invitations.wrongEmail.switchAccount')}
            </SubmitButton>
          </form>
        </>
      )
    case 'unverified':
      return (
        <>
          <Message
            icon={<MailCheck className="size-5" aria-hidden="true" />}
            title={t('invitations.unverified.title')}
            body={t('invitations.unverified.body')}
          />
          <GoToRumbo label={t('invitations.goToRumbo')} />
        </>
      )
    case 'already_member':
      // The household selector in the app bar switches to it.
      return (
        <>
          <Message
            title={t('invitations.alreadyMember.title', { household: preview.householdName })}
            body={t('invitations.alreadyMember.body')}
          />
          <GoToRumbo label={t('invitations.goToRumbo')} />
        </>
      )
    case 'ok': {
      const inviter = preview.inviterName
        ? preview.inviterEmail
          ? `${preview.inviterName} (${preview.inviterEmail})`
          : preview.inviterName
        : (preview.inviterEmail ?? '')
      const expires = new Intl.DateTimeFormat(localeToBcp47(locale), { dateStyle: 'long' }).format(
        new Date(preview.expiresAt)
      )
      return (
        <>
          <Message
            icon={<Users className="size-5" aria-hidden="true" />}
            title={t('invitations.ok.title', { household: preview.householdName })}
          />
          <dl className="space-y-3 rounded-xl border bg-muted/30 p-4 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">{t('invitations.ok.invitedByLabel')}</dt>
              <dd className="font-medium [overflow-wrap:anywhere]">{inviter}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t('invitations.ok.roleLabel')}</dt>
              <dd className="font-medium">{t(`invitations.roleLabels.${preview.role}`)}</dd>
              <dd className="text-xs text-muted-foreground">{t(`invitations.roleDescriptions.${preview.role}`)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t('invitations.ok.sharedLabel')}</dt>
              <dd>{t('invitations.ok.sharedAccounts', { count: preview.sharedAccounts })}</dd>
            </div>
          </dl>
          <p className="text-xs text-muted-foreground">{t('invitations.ok.expires', { date: expires })}</p>
          <div className="flex flex-col gap-2 sm:flex-row-reverse sm:justify-start">
            <form action={acceptInvitationAction} className="sm:flex-1">
              <input type="hidden" name="token" value={token} />
              <SubmitButton type="submit" className="w-full" pendingText={t('invitations.ok.accepting')}>
                {t('invitations.ok.accept')}
              </SubmitButton>
            </form>
            <ConfirmActionButton
              action={declineInvitationAction}
              hiddenFields={{ token }}
              triggerVariant="outline"
              triggerLabel={t('invitations.ok.decline')}
              pendingLabel={t('invitations.ok.declining')}
              title={t('invitations.ok.declineTitle')}
              description={t('invitations.ok.declineDescription')}
              cancelLabel={t('common.cancel')}
              confirmLabel={t('invitations.ok.decline')}
            />
          </div>
        </>
      )
    }
    default:
      return <DeadEnd t={t} />
  }
}

function DeadEnd({ t }: { t: (key: TranslationKey) => string }) {
  return (
    <>
      <Message title={t('invitations.unavailable.title')} body={t('invitations.unavailable.body')} />
      <GoToRumbo label={t('invitations.goToRumbo')} />
    </>
  )
}

function GoToRumbo({ label }: { label: string }) {
  return (
    <form action={leaveInvitationAction}>
      <SubmitButton type="submit" variant="outline" className="w-full">
        {label}
      </SubmitButton>
    </form>
  )
}

function Message({ icon, title, body }: { icon?: ReactNode; title: string; body?: string }) {
  return (
    <div className="space-y-2">
      {icon ? (
        <span className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">{icon}</span>
      ) : null}
      <h2 className="text-lg font-semibold leading-snug [overflow-wrap:anywhere]">{title}</h2>
      {body ? <p className="text-sm text-muted-foreground">{body}</p> : null}
    </div>
  )
}

/** The login page's frame: brand mark, one card. Phone first. */
function InviteShell({ tagline, children }: { tagline: string; children: ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-gradient-to-b from-primary/6 via-background to-background p-4 sm:p-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/30">
          <Wallet className="size-7" aria-hidden="true" />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Rumbo</h1>
          <p className="mt-1 text-sm text-muted-foreground">{tagline}</p>
        </div>
      </div>
      <Card className="w-full max-w-md">
        <CardContent className="space-y-5 pt-6">{children}</CardContent>
      </Card>
    </main>
  )
}
