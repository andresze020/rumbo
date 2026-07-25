# User Settings Page

## Status
**Implemented.**
No database schema changes required. Profile and household writes use the
existing `profiles` and `households` tables; password/email/session changes use
Supabase Auth.

---

## Contexto

`/dashboard/settings` is the central hub for account preferences and household
settings. It is reachable from the desktop sidebar user block and the mobile
navigation.

---

## Funcionalidad

| Sección | Implementación |
|---|---|
| Perfil | Edita `profiles.display_name` and shows the active Auth email. |
| Email | Calls `supabase.auth.updateUser({ email })`, shows confirmation instructions and the pending address while Supabase waits for confirmation. |
| Contraseña | Calls `supabase.auth.updateUser({ password })` with length and confirmation validation. |
| Household | Edits the household name. Base currency is read-only because changing it requires a ledger-wide data migration. |
| Apariencia | System, light and dark theme through `next-themes`. |
| Idioma | English, Spanish and French; persists the app locale cookie/profile preference through the language provider. |
| Sesiones | Global sign-out through `supabase.auth.signOut({ scope: 'global' })`. |

---

## Arquitectura

- Page and server-rendered account state:
  `src/app/dashboard/settings/page.tsx`.
- Auth/profile/household server actions:
  `src/app/dashboard/settings/settings-actions.ts`.
- Theme controls:
  `src/app/dashboard/settings/appearance-section.tsx`.
- Language controls:
  `src/app/dashboard/settings/language-section.tsx`.
- Auth errors are converted to generic user-facing messages; sensitive provider
  details are not exposed.

---

## Alcance diferido

Account deletion remains out of scope. It requires a separately reviewed
soft-delete/anonymization policy and an administrative Auth deletion path; the
current "Danger zone" only revokes all sessions.

---

## QA manual

1. Change the display name and reload Settings/sidebar.
2. Request an email change and confirm the pending-address message.
3. Complete the Supabase confirmation flow and log in with the new email.
4. Change the password, then verify the old password no longer works.
5. Rename the household and verify dashboard headers update.
6. Switch theme and language, reload, and confirm persistence.
7. Use **Sign out all** and verify another active device/session is revoked.
