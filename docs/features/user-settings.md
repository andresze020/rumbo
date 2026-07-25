# User Settings Page

## Status

**Implemented.**
No new database migration is required. Profile and language preferences use the
existing `profiles` table; household settings use `households`; authentication
changes use Supabase Auth.

---

## Context

`/dashboard/settings` is the central place for account preferences and household
configuration. It is linked from the authenticated navigation.

---

## Implemented sections

| Section | Capability | Persistence |
|---|---|---|
| Profile | Edit display name and view the current email | `profiles.display_name` |
| Password | Set a new account password | Supabase Auth |
| Household | Edit the household name and view its immutable base currency | `households.name` |
| Appearance | Choose system, light, or dark theme | Browser theme preference |
| Language | Choose English, Spanish, or Canadian French | `profiles.locale`, mirrored in `af_locale` |
| Security | Sign out all active sessions | Supabase Auth global sign-out |

The base currency remains read-only because changing it would invalidate
historical base-currency amounts and requires a dedicated data migration.

---

## Language behavior

The selected language is a user preference, not only a browser setting.
`setLocaleAction` updates `profiles.locale` and the `af_locale` cookie. Password
and OAuth login restore that cookie from the profile so a new browser, device,
or incognito session uses the same language after authentication.

Legacy values such as `en-CA` are normalized to the supported UI locale `en`.

---

## Deferred scope

- Email change with confirmation and pending-email state.
- Account deletion and household-data cleanup.

Both remain separate product changes and are not implied by the current global
sign-out action.
