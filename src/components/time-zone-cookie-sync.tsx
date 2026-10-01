'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { TIME_ZONE_COOKIE, isValidTimeZone } from '@/lib/periods/time-zone'

const MAX_AGE_SECONDS = 60 * 60 * 24 * 365

function readCookie(): string | null {
  const prefix = `${TIME_ZONE_COOKIE}=`
  const match = document.cookie.split('; ').find((part) => part.startsWith(prefix))
  return match ? match.slice(prefix.length) : null
}

/**
 * MQ-001: tells the server which time zone "today" lives in.
 *
 * Writes the browser's IANA zone into the `rumbo-tz` cookie that
 * `getRequestToday()` reads. When the cookie was missing or held another zone
 * (first visit, travel, a DST-less zone change), the page just rendered was
 * computed in the wrong one, so it asks for exactly one `router.refresh()` —
 * and only once the write is confirmed to have stuck, so a browser that
 * refuses cookies cannot loop. Renders nothing.
 */
export function TimeZoneCookieSync() {
  const router = useRouter()

  useEffect(() => {
    let zone: string
    try {
      zone = Intl.DateTimeFormat().resolvedOptions().timeZone
    } catch {
      return
    }
    if (!isValidTimeZone(zone) || readCookie() === zone) return

    // IANA names are plain cookie-octets (letters, digits, `/`, `_`, `+`, `-`),
    // so the value is written as-is and the server reads it back unchanged.
    document.cookie = [
      `${TIME_ZONE_COOKIE}=${zone}`,
      'path=/',
      `max-age=${MAX_AGE_SECONDS}`,
      'samesite=lax',
    ].join('; ')

    if (readCookie() === zone) router.refresh()
  }, [router])

  return null
}
