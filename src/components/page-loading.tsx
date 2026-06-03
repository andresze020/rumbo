import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

type PageLoadingProps = {
  title: string
  description: string
}

export function PageLoading({ title, description }: PageLoadingProps) {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 sm:p-6">
      <div>
        <div className="h-4 w-28 animate-pulse rounded-lg bg-muted" />
        <div className="mt-3 h-7 w-48 animate-pulse rounded-lg bg-muted" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="h-4 w-full animate-pulse rounded-lg bg-muted" />
            <div className="h-4 w-5/6 animate-pulse rounded-lg bg-muted" />
            <div className="h-4 w-2/3 animate-pulse rounded-lg bg-muted" />
          </div>
        </CardContent>
      </Card>
    </main>
  )
}
