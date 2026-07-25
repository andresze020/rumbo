import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ServerPageHeader as PageHeader } from '@/components/server-page-header'
import { Callout } from '@/components/callout'
import { SubmitButton } from '@/components/submit-button'
import { AppearanceSection } from './appearance-section'
import { LanguageSection } from './language-section'
import {
  signOutAllAction,
  updateHouseholdAction,
  updatePasswordAction,
  updateProfileAction,
} from './settings-actions'
import { getLocale } from '@/lib/i18n/server'
import { createUiTranslator } from '@/lib/i18n/ui'


type Props = {
  searchParams: Promise<Record<string, string | undefined>>
}

export default async function SettingsPage({ searchParams }: Props) {
  const sp = await searchParams
  const locale = await getLocale()
  const ui = createUiTranslator(locale)
  const saved = sp.saved
  const errorMsg = sp.error ? decodeURIComponent(sp.error) : null

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, default_household_id')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile?.default_household_id) redirect('/onboarding')

  const { data: household } = await supabase
    .from('households')
    .select('name, base_currency')
    .eq('id', profile.default_household_id)
    .maybeSingle()

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8 sm:px-6">
      <PageHeader
        title="Settings"
        description="Manage your profile, household, and account preferences."
      />

      {errorMsg && <Callout variant="error">{errorMsg}</Callout>}
      {saved === 'profile' && <Callout variant="success">{ui('Profile updated.')}</Callout>}
      {saved === 'password' && (
        <Callout variant="success">{ui('Password updated successfully.')}</Callout>
      )}
      {saved === 'household' && <Callout variant="success">{ui('Household updated.')}</Callout>}

      {/* ── Profile ─────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>{ui('Profile')}</CardTitle>
          <CardDescription>{ui('Your display name and email address.')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={updateProfileAction} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="display_name">Display name</Label>
              <Input
                id="display_name"
                name="display_name"
                defaultValue={profile?.display_name ?? ''}
                placeholder="Your name"
                maxLength={80}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <p className="rounded-lg border border-input bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                {user.email}
              </p>
              <p className="text-xs text-muted-foreground">
                {ui('Contact support to change your email address.')}
              </p>
            </div>
            <SubmitButton type="submit" size="sm" pendingText="Saving…">
              Save profile
            </SubmitButton>
          </form>
        </CardContent>
      </Card>

      {/* ── Password ────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>{ui('Password')}</CardTitle>
          <CardDescription>{ui('Set a new password for your account.')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={updatePasswordAction} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="password">New password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={8}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm_password">Confirm password</Label>
              <Input
                id="confirm_password"
                name="confirm_password"
                type="password"
                autoComplete="new-password"
              />
            </div>
            <SubmitButton type="submit" size="sm" pendingText="Updating…">
              Update password
            </SubmitButton>
          </form>
        </CardContent>
      </Card>

      {/* ── Household ───────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>{ui('Household')}</CardTitle>
          <CardDescription>{ui('Shared settings for your household.')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={updateHouseholdAction} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="household_name">Household name</Label>
              <Input
                id="household_name"
                name="name"
                defaultValue={household?.name ?? ''}
                maxLength={80}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Base currency</Label>
              <p className="rounded-lg border border-input bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                {household?.base_currency ?? '—'}
              </p>
              <p className="text-xs text-muted-foreground">
                {ui('The base currency is set at household creation. Changing it would invalidate all stored balance calculations and requires a full data migration.')}
              </p>
            </div>
            <SubmitButton type="submit" size="sm" pendingText="Saving…">
              Save household
            </SubmitButton>
          </form>
        </CardContent>
      </Card>

      {/* ── Appearance ──────────────────────────────────────────────── */}
      <AppearanceSection />

      {/* ── Language ────────────────────────────────────────────────── */}
      <LanguageSection />

      {/* ── Danger zone ─────────────────────────────────────────────── */}
      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-destructive">{ui('Danger zone')}</CardTitle>
          <CardDescription>{ui('Irreversible actions for your account.')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium">{ui('Sign out all devices')}</p>
              <p className="text-xs text-muted-foreground">
                {ui('Immediately revokes all active sessions.')}
              </p>
            </div>
            <form action={signOutAllAction} className="shrink-0">
              <SubmitButton type="submit" variant="destructive" size="sm" pendingText="Signing out…">
                Sign out all
              </SubmitButton>
            </form>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
