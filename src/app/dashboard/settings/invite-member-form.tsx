'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { Check, Copy, Lock, Share2, Users } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Callout } from '@/components/callout'
import { SubmitButton } from '@/components/submit-button'
import { useLanguage } from '@/components/language-provider'
import { formActionsCls, formBtnCls, nativeSelectCls } from '@/lib/form-styles'
import { invitePath, type InvitationRole } from '@/lib/households/invitations'
import { cn } from '@/lib/utils'
import { createInvitationAction, type CreateInvitationState } from './invitation-actions'

export type InviteReviewAccount = { id: string; name: string; isPrivate: boolean }

/**
 * HH-4 invite dialog, three steps:
 * 1. INV-3 review — only while the household has a single member and nothing
 *    pending: every account with Shared / Only me, and how many the invited
 *    person will see with their full history.
 * 2. Email and role (INV-1: the roles this caller may give).
 * 3. The link, shown once (INV-2), with Copy and Web Share. It exists only in
 *    this component's state; closing the dialog drops it.
 */
export function InviteMemberForm({
  householdId,
  roles,
  review,
  closeHref,
}: {
  /** The household this dialog was rendered for; the invitation targets it. */
  householdId: string
  roles: InvitationRole[]
  /** null when no review is needed. */
  review: InviteReviewAccount[] | null
  closeHref: string
}) {
  const { t } = useLanguage()
  const [reviewed, setReviewed] = useState(review === null)
  const [copied, setCopied] = useState(false)
  const [state, formAction] = useActionState<CreateInvitationState, FormData>(createInvitationAction, {
    status: 'idle',
  })

  if (!reviewed && review) {
    const shared = review.filter((account) => !account.isPrivate).length
    return (
      <div className="space-y-4">
        <div className="space-y-1">
          <p className="text-sm font-medium">{t('invitations.settings.reviewTitle')}</p>
          <p className="text-sm text-muted-foreground">
            {t('invitations.settings.reviewDescription', { count: shared })}
          </p>
        </div>
        <ul className="divide-y rounded-xl border">
          {review.map((account) => (
            <li key={account.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span className="min-w-0 truncate">{account.name}</span>
              <span
                className={cn(
                  'inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs',
                  account.isPrivate ? 'text-muted-foreground' : 'border-primary/30 bg-primary/5 text-primary'
                )}
              >
                {account.isPrivate ? (
                  <Lock className="size-3" aria-hidden="true" />
                ) : (
                  <Users className="size-3" aria-hidden="true" />
                )}
                {account.isPrivate ? t('invitations.settings.onlyMe') : t('invitations.settings.shared')}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">{t('invitations.settings.reviewHint')}</p>
        <div className={formActionsCls}>
          <Button type="button" className={formBtnCls} onClick={() => setReviewed(true)}>
            {t('invitations.settings.continue')}
          </Button>
          <Link href="/dashboard/accounts" className={cn(buttonVariants({ variant: 'outline' }), formBtnCls)}>
            {t('invitations.settings.reviewAccounts')}
          </Link>
        </div>
      </div>
    )
  }

  if (state.status === 'created') {
    // Built here, from where the inviter is, so a preview deploy shares a
    // preview link.
    const link = `${window.location.origin}${invitePath(state.token)}`
    const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
    return (
      <div className="space-y-4">
        <div className="space-y-1">
          <p className="text-sm font-medium">{t('invitations.settings.linkTitle')}</p>
          <p className="text-sm text-muted-foreground">
            {t('invitations.settings.linkDescription', { email: state.email })}
          </p>
        </div>
        <Input readOnly value={link} onFocus={(event) => event.currentTarget.select()} className="font-mono text-xs" />
        <div className="grid gap-2 sm:flex">
          <Button
            type="button"
            className={formBtnCls}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(link)
                setCopied(true)
              } catch {
                setCopied(false)
              }
            }}
          >
            {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
            {copied ? t('invitations.settings.copied') : t('invitations.settings.copy')}
          </Button>
          {canShare ? (
            <Button
              type="button"
              variant="outline"
              className={formBtnCls}
              onClick={() => {
                navigator.share({ title: 'Rumbo', text: t('invitations.settings.shareText'), url: link }).catch(() => {})
              }}
            >
              <Share2 aria-hidden="true" />
              {t('invitations.settings.share')}
            </Button>
          ) : null}
          <Link href={closeHref} className={cn(buttonVariants({ variant: 'ghost' }), formBtnCls)}>
            {t('invitations.settings.done')}
          </Link>
        </div>
      </div>
    )
  }

  const errorCode = state.status === 'error' ? state.code : null
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="household_id" value={householdId} />
      {errorCode ? <Callout variant="error">{t(`invitations.errors.${errorCode}`)}</Callout> : null}
      <div className="space-y-1.5">
        <Label htmlFor="invite_email">{t('invitations.settings.email')}</Label>
        <Input
          id="invite_email"
          name="email"
          type="email"
          autoComplete="off"
          inputMode="email"
          required
          maxLength={320}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="invite_role">{t('invitations.settings.role')}</Label>
        <select
          id="invite_role"
          name="role"
          defaultValue={roles.includes('member') ? 'member' : roles[0]}
          className={nativeSelectCls}
        >
          {roles.map((role) => (
            <option key={role} value={role}>
              {t(`invitations.roleLabels.${role}`)}
            </option>
          ))}
        </select>
        <ul className="space-y-0.5 text-xs text-muted-foreground">
          {roles.map((role) => (
            <li key={role}>
              <span className="font-medium text-foreground">{t(`invitations.roleLabels.${role}`)}</span>
              {' · '}
              {t(`invitations.roleDescriptions.${role}`)}
            </li>
          ))}
        </ul>
      </div>
      <div className={formActionsCls}>
        <SubmitButton type="submit" className={formBtnCls} pendingText={t('invitations.settings.creating')}>
          {t('invitations.settings.create')}
        </SubmitButton>
        <Link href={closeHref} className={cn(buttonVariants({ variant: 'outline' }), formBtnCls)}>
          {t('common.cancel')}
        </Link>
      </div>
    </form>
  )
}
