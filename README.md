# Rumbo

Rumbo is a household finance tracker built as a Next.js PWA. It's manual-first — it
doesn't connect to a bank, you record what happened — and everything belongs to a
*household* rather than to a user, so two people can share one set of books. Under the
UI it's a double-entry-style ledger, which is the reason the numbers reconcile instead
of approximately agreeing.

The repository is still called `app-finanzas`, which was the working title before the
app got a name.

## Status

MVP alpha. One household is using it on real data and nobody else has an account yet,
so treat anything here as subject to change.

Things that are deliberately not here, so you don't go hunting for them: no bank
connections, no household switcher in the UI (you get the one on your profile), and no
unit-test framework — see [Tests and CI](#tests-and-ci) for what stands in for it.
Migrating history from a previous app (AndroMoney) is handled by a one-off CLI in
`scripts/`, written against a real 4,737-row export and run in verified slices rather
than one big import.

## What it does

Accounts, transactions and transfers are the core. On top of that: budgets with
rollover, debts with a payoff planner, net worth, recurring transactions, credit-card
statement cycles, installment plans, refunds, payees, tags and notes. CSV import with
exchange-rate handling, and a rules engine that categorises rows on the way in. The
analysis side is reports, trends, cash flow, a calendar and a month review, all reading
the same ledger. There's also an assistant backed by the Anthropic API for drafting a
transaction from a photo of a receipt.

Multi-currency throughout, with a base currency per household. The interface is
translated into English, Spanish and French.

## How it fits together

The ledger is the part worth understanding, and it's three tables.

`transactions` is the event header — date, type, status, who entered it. It holds no
amount at all. `transaction_entries` holds the **signed** amount that moved in one
account, one row per account touched, and it's the only thing that changes a balance.
`transaction_allocations` holds a **positive** amount against a category, and it's what
budgets and every report read.

Keeping those two apart is what makes transfers behave. A transfer is one transaction
with two entries — `−X` on the source account, `+X` on the destination — and *zero*
allocations. Since reports read allocations, moving your own money between your own
accounts can't show up as income or expense no matter how you filter.

Balances are derived, not stored. `accounts` has no balance column; `get_account_balances()`
sums entries, with separate posted, pending and projected figures in both the account's
currency and the household base currency. That's a deliberate trade. A stored column
reads faster, but nothing here is ever physically deleted — transactions are voided or
soft-deleted — and there are a lot of writers: manual entry, CSV import, recurring
auto-post, installments, refunds, adjustments. Any one of them forgetting to update a
stored balance gives you a number that quietly disagrees with the rows underneath it,
which is the worst failure available in a finance app. If it ever gets slow, the answer
is a periodic snapshot per account, not a mutable column.

Household isolation is enforced by Postgres row-level security on `household_id`, not by
application filtering. Queries do also filter by household, but that's defence in depth:
remove the app-level filters and nothing leaks, remove RLS and everything does. The
browser only ever holds the publishable key; the service-role key doesn't appear in
application code at all.

Writes go through server actions into plpgsql functions, so the header, its entries and
its allocations all land in a single database transaction. Three separate inserts from
the client would be three chances to half-write a financial record.

For the whole picture, `docs/architecture/architecture.html` is a self-contained
interactive diagram — double-click it, no server or network needed — and
[docs/architecture/README.md](docs/architecture/README.md) explains how it's built.

## Stack

Next.js 16 (App Router) with React 19 and TypeScript. Tailwind v4 with shadcn/ui and
Base UI, Recharts for charts, Zod for validation, dnd-kit for the drag-and-drop account
ordering. Supabase for Postgres and Auth, wired up for SSR. Deployed on Vercel.

## Getting started

Node 22, matching CI.

```bash
npm ci
npm run dev
```

Then create a `.env.local`:

| Variable | Needed for |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Everything. Your Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Everything. The publishable (anon) key — it's meant to be public; RLS is what protects the data. |
| `ANTHROPIC_API_KEY` | The in-app assistant only. Skip it and the rest of the app works. |
| `SUPABASE_ACCESS_TOKEN` | The `db:*` scripts only. A personal access token (`sbp_…`). |
| `SUPABASE_PROJECT_REF` | The `db:*` scripts, and only if `supabase/.temp/project-ref` isn't set. |

The app opens at http://localhost:3000 and redirects to `/login`.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server. |
| `npm run build` / `npm start` | Production build and serve. |
| `npm run lint` | ESLint. |
| `npm run i18n:check` | Fails if a UI string is missing from any of the three locales. |
| `npm run db:status` | Which migrations the linked project has applied. |
| `npm run db:push` | Apply pending migrations over the Management API. |
| `npm run db:test` | Run the SQL invariant checks against a real household. |

Typechecking is `npx tsc --noEmit`. There's intentionally no `typecheck` script — the
command shows up in a Git hook, in CI and in the project docs, and having one spelling
of it everywhere is worth more than saving eleven keystrokes.

## Project layout

```
src/app/             Routes. Nearly everything lives under dashboard/.
src/components/      Shared design system — Money, AmountInput, FormDialog, etc.
src/lib/             Domain logic: fx, calc, periods, imports, exports, rules,
                     recurring, i18n, ai, health.
supabase/migrations/ 59 timestamped SQL migrations, all applied.
supabase/tests/      SQL invariant checks (see below).
scripts/             db-push, db-test, i18n coverage, icon generation, the
                     one-off AndroMoney importer.
docs/                Architecture map, per-feature docs, sprint log, open work.
```

One thing worth knowing before you write date code: `src/lib/periods/month.ts` is *the*
period resolver. Households can start their month on a day other than the 1st, so
deriving period boundaries anywhere else is how you get a report that disagrees with the
budget beside it.

## Database

Migrations are small, additive and timestamped, and they're applied with
`node scripts/db-push.mjs push --apply`, which goes over the Supabase Management API.
That exists because `supabase db push` needs TCP 5432, which isn't available from every
environment this gets worked on from.

A migration that has shipped doesn't get rewritten — fix it forward with a new one. A
few of the files in `supabase/migrations/` are exactly that, and the history is more
useful than a tidy fiction.

## Tests and CI

There's no unit-test framework yet. What exists instead:

- Three SQL invariant files in `supabase/tests/` — money, goals and refunds — run with
  `npm run db:test`. They're read-only assertions that each return a `passed` boolean
  against a real household.
- [`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs lint → `tsc --noEmit` →
  `i18n:check` → build on every pull request and every push to `main`.

The first proper tests belong at the database boundary rather than in TypeScript,
because that's where the risk actually is: allocations summing to their entries,
transfers netting to zero, and a cross-household `select` returning no rows.

## Docs

[`AGENTS.md`](AGENTS.md) is the canonical project state — if it and the code disagree,
the code wins and the doc is the bug. [`docs/features/`](docs/features/) has a document
per feature, [`docs/pending-work.md`](docs/pending-work.md) is the single index of
everything still open, and `docs/SPRINT-LOG.md` is the append-only history.

---

Private personal project. No licence is granted.
