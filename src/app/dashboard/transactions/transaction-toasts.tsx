'use client'

import { useEffect } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useToast } from '@/components/toast-provider'
import { useLanguage } from '@/components/language-provider'

export function TransactionToasts() {
  const { toast } = useToast()
  const { t } = useLanguage()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    const created = searchParams.get('created') === '1'
    const updated = searchParams.get('updated') === '1'
    const voided = searchParams.get('voided') === '1'
    if (!created && !updated && !voided) return

    if (created) toast({ message: t('transactionsList.toastCreated') })
    if (updated) toast({ message: t('transactionsList.toastUpdated') })
    if (voided) toast({ message: t('transactionsList.toastVoided') })

    const params = new URLSearchParams(searchParams.toString())
    params.delete('created')
    params.delete('updated')
    params.delete('voided')
    router.replace(params.size ? `${pathname}?${params.toString()}` : pathname, { scroll: false })
    // Run once on mount to consume the redirect flags from the URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}
