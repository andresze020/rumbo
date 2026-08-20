# AndroMoney migration (one-off history import)

## Status

**Tooling only — no schema change, no app-surface change.** Two scripts:
`scripts/andromoney-parse.mjs` (pure parsing + planning) and
`scripts/andromoney-import.mjs` (the CLI that talks to Supabase). Nothing in
`src/` is touched, no migration is added, and the in-app CSV importer at
`/dashboard/transactions/import` is unchanged.

Written against a real export: 4 737 rows, 26 accounts, 3 currencies,
2022-06 → 2026-08. Of those, **4 625 rows import**; the 112 that do not are
listed by the tool with the reason for each.

---

## Why the in-app importer cannot do this

`/dashboard/transactions/import` is built for a **bank statement**: one account
at a time, columns the user maps by hand, and every account and category
already existing. It also refuses transfer rows outright
(`src/lib/imports/csv-validation.ts`: *"Transfer rows are not supported in CSV
import yet."*).

An AndroMoney export is the opposite shape:

| AndroMoney export | In-app importer expects |
|---|---|
| Every account in one file, named in the row | One target account per run |
| Transfers inline (both account columns filled) | Transfer rows rejected |
| Its own category tree (`Category` + `Sub-Category`) | Categories must already exist |
| Three currencies mixed in one file | One account currency per run |
| Initial balances as `SYSTEM`/`INIT_AMOUNT` rows | No concept of them |
| `yyyyMMdd` dates, Big5-ish encoding | `YYYY-MM-DD` / `MM/DD/YYYY`, UTF-8 |

So the migration is a script — but it does **not** write its own ledger rows.
Every transaction goes through the same RPCs the UI uses
(`create_manual_transaction`, `create_transfer_transaction`,
`create_opening_balance`), so the entry/allocation invariants in
`.claude/skills/app-finanzas-ledger-rules` hold exactly as they do for manual
entry. The script authenticates as the user with email + password against the
**anon** key — RLS applies normally, there is no service-role bypass.

---

## The AndroMoney data model, as exported

The "Windows Excel" export has two header lines (its own banner, then the real
column header) and these columns:

```
Id, Currency, Amount, Category, Sub-Category, Date,
Expense(Transfer Out), Income(Transfer In), Note, Periodic,
Project, Payee/Payer, uid, Time
```

Row shape is inferred from which account column is filled:

| `Expense(Transfer Out)` | `Income(Transfer In)` | Meaning |
|---|---|---|
| set | empty | expense |
| empty | set | income |
| set | set | transfer |
| — | account name, `Category = SYSTEM` | opening balance (`Date` = sentinel `10100101`) |

### Encoding

AndroMoney writes the file in a Big5-ish encoding, not UTF-8. Two consequences,
both handled in `decodeAndroMoneyBuffer`:

- A comma inside a note becomes the Big5 full-width comma (bytes `A1 41`), which
  reads as `¡A` under latin-1. It is restored to `, `.
- Every character Big5 cannot represent was written as a literal `?` — that
  information is **gone from the file**. `DEFAULT_TEXT_FIXES` restores the ~65
  Spanish/French words that actually occur (`Mar?a` → `María`, `n?mina` →
  `nómina`, `cumplea?os` → `cumpleaños`, …). Extend it per-import through the
  map file's `textFixes` rather than editing the script.

Anything non-ASCII the decoder does not recognise is reported as a warning
instead of being silently imported.

---

## How each field lands

| AndroMoney | App Finanzas |
|---|---|
| `Expense(Transfer Out)` / `Income(Transfer In)` | `accounts.name` (created if missing) |
| `Category` | parent category |
| `Sub-Category` | child category, `parent_category_id` → the parent |
| `Amount` + `Currency` | `p_amount` + `p_exchange_rate_to_base` from the map's rate table |
| `Date` (`yyyyMMdd`) | `transactions.transaction_date` |
| `Time` (`HHmm`, no leading zeros) | `transactions.transaction_time` (BR-045; disable with `"importTime": false`) |
| `Note` | `transactions.description` |
| `Payee/Payer` | `p_payee_name` → resolved to a `payees` row (BR-009) |
| `Project` | a tag (BR-023); disable with `"projectsAsTags": false` |
| `SYSTEM`/`INIT_AMOUNT` | `create_opening_balance`, dated the day before the first real transaction |
| `Periodic` | **dropped** — it is AndroMoney's recurrence rule, not a posted fact. Rebuild the ones you still want under `/dashboard/recurring`. |

### Category direction

The RPCs reject an income transaction filed under an expense category and vice
versa, so each subcategory's direction is taken from **how the rows actually use
it**, not from its name. In the reference export no `Category`/`Sub-Category`
pair is ever used in both directions, so this is unambiguous.

One parent is not: `CxP` holds `pagos` (income) and `Deudas pagadas` (expense).
A category carries a single `reporting_type`, so the planner splits it — the
majority direction keeps the name, the minority gets a suffix (`CxP (ingresos)`).
The report flags any split with `← split`.

### Cross-currency transfers

AndroMoney stores **one** amount for a transfer, in one of the two currencies.
The other leg — what actually arrived — is not in the file, and
`create_transfer_transaction` requires it (`p_to_amount`).

The planner estimates the missing leg from the rate table but, by default,
**refuses to import on an estimate**: a guessed leg is a wrong balance on a real
account. `plan` prints a paste-ready `crossCurrencyTransfers` block with the
estimates and the route/date/note for each, so each one can be checked against
the bank and corrected. Set `"confirmCrossCurrencyTransfers": false` to accept
the estimates instead. In the reference export this is 13 rows.

---

## Running it

```bash
# 1. First run writes a starter map file, pre-filled from the CSV itself.
node --env-file=.env.local scripts/andromoney-import.mjs plan \
  --csv AndroMoney.csv --map andromoney-map.json

# 2. Edit andromoney-map.json — FX rates are empty on purpose — and re-run
#    `plan` until the report is what you want.

# 3. Post it.
node --env-file=.env.local scripts/andromoney-import.mjs apply \
  --csv AndroMoney.csv --map andromoney-map.json

# 4. If it went wrong: one call, or the Revert button in Import history.
node --env-file=.env.local scripts/andromoney-import.mjs revert --batch <uuid>
```

Environment (`.env.local`): `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and optionally `APP_FINANZAS_EMAIL` /
`APP_FINANZAS_PASSWORD` — the script prompts for whichever is missing.

`--limit N` posts only the first N rows, which is the right way to try it: run
`--limit 20`, look at the app, then revert or continue. `--concurrency N`
(default 5) controls how many RPCs are in flight.

### The map file

| Key | What it does |
|---|---|
| `accounts` | Name, `account_type`, `account_class` and currency each AndroMoney account becomes. Types are guessed from the name (`Visa …` → `credit_card`/`liability`, `TFSA`/`RRSP`/`Trii` → `investment`, …) — **check them**, the guess is a regex. |
| `fxRates` | Value of 1 unit of that currency in the household base currency. `"default"`, `"2024"` and `"2024-03"` keys, most specific wins. Empty by default: a plausible-looking wrong rate is silently wrong money, so it has to be a deliberate edit. |
| `crossCurrencyTransfers` | The confirmed legs, keyed by AndroMoney `uid`. |
| `categories` | Rename on the way in, e.g. `"Food/Mecato": { "name": "Snacks" }`. |
| `textFixes` | Extra `?`-repairs on top of `DEFAULT_TEXT_FIXES`. |
| `skipUids` | Rows to leave out entirely. |
| `currencyMismatchPolicy` | `convert` (default), `asis` or `skip`, for rows whose `Currency` differs from their account's. |

---

## Re-running, resuming, undoing

Every posted transaction is attached to an `import_batches` row (metadata
`{ "source": "andromoney" }`) and gets an `import_rows` row carrying AndroMoney's
own `uid`.

- **Resume.** A re-run reads back every `uid` already imported and skips it, so
  an interrupted run continues where it stopped instead of duplicating.
- **Undo.** The batch appears under Import history at
  `/dashboard/transactions/import` with its Revert button, which soft-deletes
  every transaction the batch created (ledger rows are kept). `revert --batch`
  calls the same `revert_csv_import` RPC.
- **Blast radius.** Rows are recorded in chunks of 25, so a crash between
  posting and recording can duplicate at most 25 rows on the next run.
- Failures are written to `andromoney-failures.json` and the batch is marked
  `partial`; re-running `apply` retries only what failed.

---

## What does not import, and why

From the reference export, 112 of 4 737 rows:

| Count | Reason | What to do |
|---|---|---|
| 84 | `Amount` is 0 | AndroMoney keeps 0-amount rows as reminders of things that never happened (a refunded deposit, a cancelled order). The ledger rejects a 0 amount and they carry no financial meaning. Nothing to do. |
| 13 | Cross-currency transfer awaiting confirmation | Paste the block `plan` prints, corrected against the bank. Then they import. |
| 2 | Negative amount | AndroMoney stored a reversal on the opposite side (`Investment / Stock`, `-555 000 COP`). Enter these two by hand once you decide which category the loss belongs to. |
| 3 | Row currency ≠ account currency | Converted through the rate table by default and imported, with a notice per row. |

## Open decisions

- **FX rates are per-year at best.** Every non-base-currency transaction is
  valued at one rate for its year (or month, if configured), not the rate of the
  day. Since `20260817120000_balance_fx_revaluation.sql` this no longer reaches
  **balances** — an account's base-currency equivalent and net worth are
  revalued at the rate on file for the day being shown (see
  [exchange-rates.md](./exchange-rates.md)), so the import's rate table no
  longer decides what your money is worth today. It still decides what each
  income and expense was worth **on its own date**, which is what reports and
  budgets read. Per-month keys are supported for the periods worth the effort.
- **`Periodic` is dropped.** Recreating recurring rules from AndroMoney's
  encoding (`7|20260704|20260804|null|2|1`) would be guesswork about what is
  still active.
