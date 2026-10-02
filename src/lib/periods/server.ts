import 'server-only'
import { cookies } from 'next/headers'
import { todayIsoDate } from '@/lib/periods/transaction-period'
import { DEFAULT_TIME_ZONE, TIME_ZONE_COOKIE, isValidTimeZone } from '@/lib/periods/time-zone'

/**
 * The user's IANA time zone for this request, from the `rumbo-tz` cookie.
 * Falls back to UTC — the behaviour before MQ-001 — never to an error.
 */
export async function getRequestTimeZone(): Promise<string> {
  const store = await cookies()
  const value = store.get(TIME_ZONE_COOKIE)?.value
  return isValidTimeZone(value) ? value : DEFAULT_TIME_ZONE
}

/**
 * Today's `YYYY-MM-DD` on the user's wall clock. The one way server code asks
 * "what day is it?" — the current month is `today.slice(0, 7)`.
 */
export async function getRequestToday(): Promise<string> {
  return todayIsoDate(await getRequestTimeZone())
}
