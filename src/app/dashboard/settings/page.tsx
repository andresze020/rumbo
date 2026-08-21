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
import { PreferencesSection } from './preferences-section'
import { ExchangeRatesSection, type ExchangeRateRow } from './exchange-rates-section'
import { getUiPreferences } from '@/lib/preferences/server'
import {
  signOutAllAction,
  updateEmailAction,
  updateHouseholdAction,
  updatePasswordAction,
  updateProfileAction,
} from './settings-actions'
import { getLocale } from '@/lib/i18n/server'
import { createUiTranslator } from '@/lib/i18n/ui'
import { translate } from '@/lib/i18n/translate'


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
    .select('name, base_currency, month_start_day')
    .eq('id', profile.default_household_id)
    .maybeSingle()

  // BR-032 + BR-038: the preferences card needs the household's active accounts
  // for the "default account" picker.
  const preferences = await getUiPreferences()
  const { data: accountRows } = await supabase
    .from('accounts')
    .select('id, name')
    .eq('household_id', profile.default_household_id)
    .is('deleted_at', null)
    .eq('is_archived', false)
    .order('sort_order', { ascending: true, nullsFirst: false })
    .order('name', { ascending: true })

  // Exchange rates: one row per foreign currency the household actually holds
  // accounts in — a rate for a currency nobody uses is noise. Archived accounts
  // count, since their balance still shows on the accounts screen.
  const baseCurrency = household?.base_currency ?? 'CAD'
  const { data: currencyRows } = await supabase
    .from('accounts')
    .select('currency_code')
    .eq('household_id', profile.default_household_id)
    .is('deleted_at', null)

  const accountsByCurrency = new Map<string, number>()
  for (const row of (currencyRows ?? []) as { currency_code: string }[]) {
    if (row.currency_code === baseCurrency) continue
    accountsByCurrency.set(
      row.currency_code,
      (accountsByCurrency.get(row.currency_code) ?? 0) + 1
    )
  }

  const today = new Date().toISOString().slice(0, 10)
  const { data: rateRows } = await supabase
    .from('exchange_rates')
    .select('from_currency_code, rate, rate_date, source')
    .eq('household_id', profile.default_household_id)
    .eq('to_currency_code', baseCurrency)
    .in('from_currency_code', [...accountsByCurrency.keys()])
    .order('rate_date', { ascending: false })

  // Ordered newest-first above, so the first row seen per currency is the
  // latest one on file.
  const latestRateByCurrency = new Map<
    string,
    { rate: number; rate_date: string; source: string | null }
  >()
  for (const row of (rateRows ?? []) as {
    from_currency_code: string
    rate: number | string
    rate_date: string
    source: string | null
  }[]) {
    if (latestRateByCurrency.has(row.from_currency_code)) continue
    latestRateByCurrency.set(row.from_currency_code, {
      rate: Number(row.rate),
      rate_date: row.rate_date,
      source: row.source,
    })
  }

  const exchangeRateRows: ExchangeRateRow[] = [...accountsByCurrency.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currencyCode]) => {
      const latest = latestRateByCurrency.get(currencyCode) ?? null

      return {
        currencyCode,
        rate: latest?.rate ?? null,
        rateDate: latest?.rate_date ?? null,
        source: latest?.source ?? null,
      }
    })

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
      {saved === 'email' && (
        <Callout variant="success">
          {ui('Email change requested. Confirm the messages sent by Supabase before the new address becomes active.')}
        </Callout>
      )}
      {saved === 'household' && <Callout variant="success">{ui('Household updated.')}</Callout>}
      {saved === 'preferences' && <Callout variant="success">{ui('Preferences saved.')}</Callout>}
      {saved === 'exchange-rate' && (
        <Callout variant="success">
          {translate(locale, 'settings.exchangeRates.saved')}
        </Callout>
      )}

      {/* ── Profile ─────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Your display name and email address.</CardDescription>
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
              <Label htmlFor="email">Email</Label>
              <p className="rounded-lg border border-input bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                {user.email}
              </p>
              {(user as { new_email?: string }).new_email ? (
                <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
                  {ui('Pending confirmation:')} {(user as { new_email?: string }).new_email}
                </p>
              ) : null}
              <p className="text-xs text-muted-foreground">
                {ui('Changing your email requires confirmation before it becomes active.')}
              </p>
            </div>
            <SubmitButton type="submit" size="sm" pendingText="Saving…">
              Save profile
            </SubmitButton>
          </form>
          <form action={updateEmailAction} className="mt-6 space-y-4 border-t pt-6">
            <div className="space-y-1.5">
              <Label htmlFor="new_email">New email address</Label>
              <Input
                id="new_email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                required
              />
            </div>
            <SubmitButton type="submit" size="sm" variant="outline" pendingText="Sending…">
              Change email
            </SubmitButton>
          </form>
        </CardContent>
      </Card>

      {/* ── Password ────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Password</CardTitle>
          <CardDescription>Set a new password for your account.</CardDescription>
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
          <CardTitle>Household</CardTitle>
          <CardDescription>Shared settings for your household.</CardDescription>
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

      {/* ── Preferences (BR-032 + BR-038) ───────────────────────────── */}
      <PreferencesSection
        preferences={preferences}
        accounts={(accountRows ?? []) as { id: string; name: string }[]}
      />

      {/* ── Exchange rates ──────────────────────────────────────────── */}
      <ExchangeRatesSection
        baseCurrency={baseCurrency}
        rows={exchangeRateRows}
        today={today}
      />

      {/* ── Appearance ──────────────────────────────────────────────── */}
      <AppearanceSection />

      {/* ── Language ────────────────────────────────────────────────── */}
      <LanguageSection />

      {/* ── Danger zone ─────────────────────────────────────────────── */}
      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-destructive">Danger zone</CardTitle>
          <CardDescription>Irreversible actions for your account.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium">Sign out all devices</p>
              <p className="text-xs text-muted-foreground">
                Immediately revokes all active sessions.
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
