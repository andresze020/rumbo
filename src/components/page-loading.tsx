import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { getLocale } from '@/lib/i18n/server'
import { createUiTranslator } from '@/lib/i18n/ui'

type PageLoadingProps = {
  title: string
  description: string
}

export async function PageLoading({ title, description }: PageLoadingProps) {
  const ui = createUiTranslator(await getLocale())

  return (
    <main
      role="status"
      aria-live="polite"
      className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 sm:p-6"
    >
      <div aria-hidden="true">
        <div className="h-4 w-28 animate-pulse rounded-lg bg-muted" />
        <div className="mt-3 h-7 w-48 animate-pulse rounded-lg bg-muted" />
      </div>

      {/* CardTitle/Description carry the loading announcement itself
          ("Accounts" / "Loading account balances…") — the role="status" on
          <main> is enough to read them once; the pulse bars below are purely
          decorative and stay out of the accessibility tree. */}
      <Card>
        <CardHeader>
          <CardTitle>{ui(title)}</CardTitle>
          <CardDescription>{ui(description)}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3" aria-hidden="true">
            <div className="h-4 w-full animate-pulse rounded-lg bg-muted" />
            <div className="h-4 w-5/6 animate-pulse rounded-lg bg-muted" />
            <div className="h-4 w-2/3 animate-pulse rounded-lg bg-muted" />
          </div>
        </CardContent>
      </Card>
    </main>
  )
}
