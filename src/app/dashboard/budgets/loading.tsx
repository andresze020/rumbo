import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export default function BudgetsLoading() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      <div>
        <p className="text-sm text-muted-foreground">Loading</p>
        <h1 className="text-2xl font-semibold tracking-normal">Budgets</h1>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {['Total budgeted', 'Total spent', 'Remaining', 'Percent used'].map(
          (label) => (
            <Card key={label}>
              <CardHeader>
                <CardTitle>{label}</CardTitle>
                <CardDescription>Loading budget data.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-6 w-24 rounded-lg bg-muted" />
              </CardContent>
            </Card>
          )
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Budget lines</CardTitle>
          <CardDescription>Loading planned and actual amounts.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 rounded-lg border p-4">
            <div className="h-4 w-48 rounded-lg bg-muted" />
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="h-16 rounded-lg bg-muted" />
              <div className="h-16 rounded-lg bg-muted" />
              <div className="h-16 rounded-lg bg-muted" />
              <div className="h-16 rounded-lg bg-muted" />
            </div>
          </div>
        </CardContent>
      </Card>
    </main>
  )
}
