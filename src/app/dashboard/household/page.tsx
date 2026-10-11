import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ServerPageHeader as PageHeader } from '@/components/server-page-header'
import { Callout } from '@/components/callout'
import { SubmitButton } from '@/components/submit-button'
import { getLocale } from '@/lib/i18n/server'
import { createUiTranslator } from '@/lib/i18n/ui'
import { translate } from '@/lib/i18n/translate'
import { isInvitationRefusal } from '@/lib/households/invitations'
import { isMemberRefusal, isMemberSaved } from '@/lib/households/members'
import { updateHouseholdAction } from '../settings/settings-actions'
import { switchHouseholdAction } from '../household-actions'
import { HouseholdInvitationsSection } from './household-invitations-section'
import { FormerHouseholdsSection, parseFormerHouseholds } from './former-households-section'
import { ActivityCard, MembersCard, type AuditEvent } from './members-card'
import { inviteRolesFor, loadHouseholdBase, loadMembers, loadPendingInvitations } from './data'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Props = {
  searchParams: Promise<Record<string, string | undefined>>
}

/**
 * HH-7: the Household section. Its details (moved from Settings), and — with
 * RUMBO_HOUSEHOLD_SHARING on — members, invitations, recent activity and
 * former households. Inviting, a member's actions and leaving each open their
 * own page under /dashboard/household.
 */
export default async function HouseholdPage({ searchParams }: Props) {
  const sp = await searchParams
  const locale = await getLocale()
  const ui = createUiTranslator(locale)
  const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate(locale, key, vars)
  const { supabase, user, householdId, household, callerRole, sharingEnabled } = await loadHouseholdBase()
  const errorMsg = sp.error ? decodeURIComponent(sp.error) : null

  const inviteRoles = inviteRolesFor(callerRole, sharingEnabled)
  const canSeeActivity = sharingEnabled && (callerRole === 'owner' || callerRole === 'admin')
  const [members, invitations, auditRows, formerRows, joinedHousehold] = await Promise.all([
    sharingEnabled ? loadMembers(householdId) : Promise.resolve([]),
    inviteRoles.length > 0 ? loadPendingInvitations(householdId) : Promise.resolve([]),
    canSeeActivity
      ? supabase
          .from('household_audit_log')
          .select('id, actor_id, target_user_id, action, metadata, created_at')
          .eq('household_id', householdId)
          .order('created_at', { ascending: false })
          .limit(50)
          .then(({ data }) => data)
      : Promise.resolve(null),
    sharingEnabled ? supabase.rpc('get_my_former_households').then(({ data }) => data) : Promise.resolve(null),
    // INV-9: accepted an invitation while keeping another household active —
    // offer the switch (RLS shows the name only to a member of it).
    sharingEnabled && typeof sp.joined === 'string' && UUID_PATTERN.test(sp.joined) && sp.joined !== householdId
      ? supabase
          .from('households')
          .select('id, name')
          .eq('id', sp.joined)
          .maybeSingle()
          .then(({ data }) => data as { id: string; name: string } | null)
      : Promise.resolve(null),
  ])

  const activity: AuditEvent[] = ((auditRows ?? []) as {
    id: string
    actor_id: string | null
    target_user_id: string | null
    action: string
    metadata: Record<string, unknown> | null
    created_at: string
  }[]).map((row) => ({
    id: row.id,
    actorId: row.actor_id,
    targetUserId: row.target_user_id,
    action: row.action,
    role: typeof row.metadata?.role === 'string' ? row.metadata.role : null,
    createdAt: row.created_at,
  }))
  const memberSaved = isMemberSaved(sp.memberSaved) ? sp.memberSaved : null
  const memberError = isMemberRefusal(sp.memberError) ? sp.memberError : null
  const invitationError = isInvitationRefusal(sp.invitationError) ? sp.invitationError : null

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8 sm:px-6">
      <PageHeader title={t('members.household.title')} description={t('members.household.description')} />

      {errorMsg && <Callout variant="error">{errorMsg}</Callout>}
      {sp.saved === 'household' && <Callout variant="success">{ui('Household updated.')}</Callout>}
      {memberSaved ? <Callout variant="success">{t(`members.settings.saved.${memberSaved}`)}</Callout> : null}
      {memberError ? <Callout variant="error">{t(`members.errors.${memberError}`)}</Callout> : null}
      {sp.invitationRevoked === '1' ? <Callout variant="success">{t('invitations.settings.revoked')}</Callout> : null}
      {invitationError ? <Callout variant="error">{t(`invitations.errors.${invitationError}`)}</Callout> : null}
      {joinedHousehold ? (
        <Callout variant="success" className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <span>{t('invitations.settings.joined', { household: joinedHousehold.name })}</span>
          <form action={switchHouseholdAction}>
            <input type="hidden" name="household_id" value={joinedHousehold.id} />
            <input type="hidden" name="return_to" value="/dashboard" />
            <SubmitButton type="submit" size="sm">
              {t('invitations.settings.switchTo', { household: joinedHousehold.name })}
            </SubmitButton>
          </form>
        </Callout>
      ) : null}

      {/* The app bar's household selector links here with `#household`. */}
      <Card id="household" className="scroll-mt-20">
        <CardHeader>
          <CardTitle>Household</CardTitle>
          <CardDescription>Shared settings for your household.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={updateHouseholdAction} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="household_name">Household name</Label>
              <Input id="household_name" name="name" defaultValue={household?.name ?? ''} maxLength={80} />
            </div>
            <div className="space-y-1.5">
              <Label>Base currency</Label>
              <p className="rounded-lg border border-input bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                {household?.base_currency ?? '—'}
              </p>
              <p className="text-xs text-muted-foreground">
                The base currency is set at household creation. Changing it would invalidate all stored balance calculations and requires a full data migration.
              </p>
            </div>
            {/* BR-036 — slice 1. The copy states plainly which screen honours
                this, because a setting that only half applies is worse than no
                setting if the user has to discover the boundary themselves. */}
            <div className="space-y-1.5">
              <Label htmlFor="month_start_day">Month starts on day</Label>
              <Input
                id="month_start_day"
                name="month_start_day"
                type="number"
                inputMode="numeric"
                min={1}
                max={31}
                step={1}
                defaultValue={household?.month_start_day ?? 1}
              />
              <p className="text-xs text-muted-foreground">
                For a household paid on the 25th, set 25 and a period runs from
                the 25th to the 24th. Leave it at 1 for the calendar month.
              </p>
              <p className="text-xs text-muted-foreground">
                Applies to Reports for now. Budgets, month closures and the
                dashboard still use the calendar month.
              </p>
            </div>
            <SubmitButton type="submit" size="sm" pendingText="Saving…">
              Save household
            </SubmitButton>
          </form>
        </CardContent>
      </Card>

      {sharingEnabled && members.length > 0 ? (
        <MembersCard locale={locale} callerId={user.id} callerRole={callerRole} members={members} />
      ) : null}

      {inviteRoles.length > 0 && callerRole ? (
        <HouseholdInvitationsSection locale={locale} callerRole={callerRole} invitations={invitations} />
      ) : null}

      {canSeeActivity ? <ActivityCard locale={locale} members={members} activity={activity} /> : null}

      <FormerHouseholdsSection locale={locale} households={parseFormerHouseholds(formerRows)} />
    </div>
  )
}
