import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

const accounts = [
  {
    id: 1,
    name: "TD Checking",
    type: "Checking",
    balance: 1250.75,
    currency: "CAD",
  },
  {
    id: 2,
    name: "Cash Wallet",
    type: "Cash",
    balance: 120,
    currency: "CAD",
  },
  {
    id: 3,
    name: "Credit Card",
    type: "Credit Card",
    balance: -850.3,
    currency: "CAD",
  },
];

const transactions = [
  {
    id: 1,
    description: "Groceries",
    category: "Food",
    account: "TD Checking",
    amount: -82.45,
  },
  {
    id: 2,
    description: "Salary",
    category: "Income",
    account: "TD Checking",
    amount: 2500,
  },
  {
    id: 3,
    description: "Restaurant",
    category: "Restaurants",
    account: "Credit Card",
    amount: -48.9,
  },
];

function formatMoney(amount: number, currency = "CAD") {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency,
  }).format(amount);
}

export default function HomePage() {
  const monthlyIncome = transactions
    .filter((transaction) => transaction.amount > 0)
    .reduce((total, transaction) => total + transaction.amount, 0);

  const monthlyExpenses = transactions
    .filter((transaction) => transaction.amount < 0)
    .reduce((total, transaction) => total + Math.abs(transaction.amount), 0);

  const netWorth = accounts.reduce((total, account) => {
    return total + account.balance;
  }, 0);

  return (
    <main className="min-h-screen bg-muted/40 p-6">
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <Badge variant="secondary">MVP Alpha</Badge>

            <h1 className="mt-3 text-4xl font-bold tracking-tight">
              App Finanzas
            </h1>

            <p className="mt-2 text-muted-foreground">
              Dashboard inicial para cuentas, transacciones, gastos y patrimonio.
            </p>
          </div>

          <div className="flex gap-3">
            <Button variant="outline">Import CSV</Button>
            <Button>Add transaction</Button>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Monthly income
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">
                {formatMoney(monthlyIncome)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Monthly expenses
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">
                {formatMoney(monthlyExpenses)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Net worth
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{formatMoney(netWorth)}</p>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Accounts</CardTitle>
            </CardHeader>

            <CardContent className="space-y-4">
              {accounts.map((account) => (
                <div key={account.id}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{account.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {account.type}
                      </p>
                    </div>

                    <p className="font-semibold">
                      {formatMoney(account.balance, account.currency)}
                    </p>
                  </div>

                  <Separator className="mt-4" />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent transactions</CardTitle>
            </CardHeader>

            <CardContent className="space-y-4">
              {transactions.map((transaction) => (
                <div key={transaction.id}>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-medium">{transaction.description}</p>

                      <p className="text-sm text-muted-foreground">
                        {transaction.category} · {transaction.account}
                      </p>
                    </div>

                    <p
                      className={
                        transaction.amount < 0
                          ? "font-semibold"
                          : "font-semibold text-emerald-600"
                      }
                    >
                      {formatMoney(transaction.amount)}
                    </p>
                  </div>

                  <Separator className="mt-4" />
                </div>
              ))}
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}