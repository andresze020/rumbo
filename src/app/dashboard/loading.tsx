import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

function SkeletonCard({ title }: { title: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-7 w-32 rounded-lg bg-muted" />
      </CardContent>
    </Card>
  )
}

export default function DashboardLoading() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <div className="h-4 w-28 rounded-lg bg-muted" />
          <div className="h-8 w-40 rounded-lg bg-muted" />
        </div>
        <div className="h-9 w-44 rounded-lg bg-muted" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SkeletonCard title="Monthly income" />
        <SkeletonCard title="Monthly expenses" />
        <SkeletonCard title="Monthly savings" />
        <SkeletonCard title="Savings rate" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Expenses by category</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="h-12 rounded-lg bg-muted" />
          <div className="h-12 rounded-lg bg-muted" />
          <div className="h-12 rounded-lg bg-muted" />
        </CardContent>
      </Card>
    </main>
  )
}
