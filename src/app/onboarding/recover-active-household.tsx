'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { recoverActiveHouseholdAction } from '@/app/dashboard/household-actions'

/**
 * MEM-7: the default household is not one the user belongs to any more. Runs
 * the repair once (a Server Action: a POST, never a prefetch) and lets it
 * redirect — to the dashboard of another membership, or back to onboarding
 * when none is left. Shows nothing meanwhile, so the household being left is
 * never named. Only if the repair fails does the page underneath appear,
 * instead of bouncing between /dashboard and /onboarding.
 */
export function RecoverActiveHousehold({ children }: { children: ReactNode }) {
  const started = useRef(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    recoverActiveHouseholdAction().catch(() => setFailed(true))
  }, [])

  return failed ? children : null
}
