'use client'

import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

export function WelcomeButton() {
  const router = useRouter()

  return (
    <Button
      type="button"
      className="h-11 w-full rounded-xl"
      onClick={() => router.push('/onboarding/household')}
    >
      Get started →
    </Button>
  )
}
