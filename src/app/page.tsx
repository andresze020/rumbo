export default function HomePage() {
  return (
    <main className="min-h-screen p-8">
      <section className="mx-auto max-w-4xl">
        <p className="text-sm font-medium text-gray-500">
          MVP Alpha
        </p>

        <h1 className="mt-3 text-4xl font-bold tracking-tight">
          App Finanzas
        </h1>

        <p className="mt-4 text-lg text-gray-600">
          Personal finance app for households, accounts, transactions, budgets,
          debts, and net worth tracking.
        </p>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border p-4 shadow-sm">
            <p className="text-sm text-gray-500">Monthly income</p>
            <p className="mt-2 text-2xl font-bold">CAD 0.00</p>
          </div>

          <div className="rounded-xl border p-4 shadow-sm">
            <p className="text-sm text-gray-500">Monthly expenses</p>
            <p className="mt-2 text-2xl font-bold">CAD 0.00</p>
          </div>

          <div className="rounded-xl border p-4 shadow-sm">
            <p className="text-sm text-gray-500">Net worth</p>
            <p className="mt-2 text-2xl font-bold">CAD 0.00</p>
          </div>
        </div>
      </section>
    </main>
  );
}