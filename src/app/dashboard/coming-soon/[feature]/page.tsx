import { notFound, redirect } from 'next/navigation'
import { LockedFeatureCard } from '@/components/locked-feature-card'
import { ServerPageHeader as PageHeader } from '@/components/server-page-header'
import { findNavItemByFeature, PHASE_LABEL_KEY } from '@/lib/nav/config'
import { createClient } from '@/lib/supabase/server'
import { getLocale } from '@/lib/i18n/server'
import { translate } from '@/lib/i18n/translate'

type ComingSoonPageProps = {
  params: Promise<{ feature: string }>
}

export default async function ComingSoonPage({ params }: ComingSoonPageProps) {
  const { feature } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const item = findNavItemByFeature(feature)
  if (!item || item.phase === 'alpha' || !item.descriptionKey) notFound()

  const locale = await getLocale()
  const title = translate(locale, item.labelKey)
  const phaseLabel = translate(locale, PHASE_LABEL_KEY[item.phase])

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 sm:p-6">
      <PageHeader eyebrow={phaseLabel} title={title} />
      <LockedFeatureCard
        icon={item.icon}
        title={title}
        description={translate(locale, item.descriptionKey)}
        phase={item.phase}
        phaseLabel={phaseLabel}
        calloutText={translate(locale, 'comingSoon.calloutBody')}
        backHref="/dashboard"
        backLabel={translate(locale, 'comingSoon.back')}
      />
    </main>
  )
}
