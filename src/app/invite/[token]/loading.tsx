import { PageLoading } from '@/components/page-loading'
import { getLocale } from '@/lib/i18n/server'
import { translate } from '@/lib/i18n/translate'

export default async function InviteLoading() {
  const locale = await getLocale()
  return (
    <PageLoading
      title={translate(locale, 'invitations.loadingTitle')}
      description={translate(locale, 'invitations.loadingDescription')}
    />
  )
}
