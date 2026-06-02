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
        <div className="h-4 w-28 rounded-lg bg-muted" />
        <div className="mt-3 h-7 w-48 rounded-lg bg-muted" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="h-4 w-full rounded-lg bg-muted" />
            <div className="h-4 w-5/6 rounded-lg bg-muted" />
            <div className="h-4 w-2/3 rounded-lg bg-muted" />
          </div>
        </CardContent>
      </Card>
    </main>
  )
}
