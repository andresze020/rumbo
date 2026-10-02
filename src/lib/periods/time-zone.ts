/**
 * MQ-001: the user's time zone, as the server learns it.
 *
 * The browser writes its IANA zone (`Intl.DateTimeFormat().resolvedOptions()
 * .timeZone`) into this cookie (`TimeZoneCookieSync`, mounted in the dashboard
 * layout); `getRequestToday()` in `periods/server.ts` reads it back so every
 * server-rendered "today" and "this month" is the user's, not UTC's. Shared by
 * both sides, hence no `server-only` here.
 */
export const TIME_ZONE_COOKIE = 'rumbo-tz'

/** What the server falls back to with no (or a bad) cookie — the old behaviour. */
export const DEFAULT_TIME_ZONE = 'UTC'

/** A zone `Intl` accepts. The cookie is user-controlled, so it is never trusted. */
export function isValidTimeZone(value: string | null | undefined): value is string {
  if (!value || value.length > 64) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value })
    return true
  } catch {
    return false
  }
}
