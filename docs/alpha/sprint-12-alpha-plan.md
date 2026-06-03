# Sprint 12 — Alpha Personal Use Plan

> Status: planning document. **No application, UI, business-logic, schema, RLS, or
> migration changes are part of this sprint.** Documentation only.

## Objective

Use App Finanzas with **real personal/family financial data**, compare it against
the current system of record (AndroMoney and/or existing spreadsheets/bank
statements), and validate that the core MVP produces trustworthy numbers across:

- Account balances
- Dashboard metrics
- Budgets
- Debts
- Net worth
- CSV import
- CSV export

The goal is to gather **real usage evidence** — concrete bugs and frictions — before
deciding what to build or fix next.

## Why this sprint exists

The MVP is feature-complete for personal use, but it has never been exercised with
real data over a real usage period. Building more features now would be guessing.

This sprint deliberately delays new functionality until real usage proves what is
actually missing or broken. It exists to:

1. Convert "it looks done" into "it is verified correct with my own money."
2. Produce a prioritized, evidence-based list of issues instead of assumptions.
3. Protect against shipping post-MVP features that real usage may not justify.

## Scope

- Importing real accounts and a bounded slice of real transactions.
- Reconciling App Finanzas numbers against AndroMoney / current records.
- Using the app for everyday entry for at least one week.
- Logging every bug and friction encountered, with severity classification.
- Triaging findings into a prioritized fix list at the end.

## Out of scope

Do **not** build, and do **not** treat as Alpha work:

- Bank sync / open banking
- Advanced categorization rules / auto-categorization
- Recurring transactions
- Goals
- AI recommendations
- OCR / receipt scanning
- Stripe / billing
- Native mobile app
- Full account deletion
- External beta / multi-user invitations
- Advanced Payee / Vendor / Lender CRUD
- Any other post-MVP functionality

If real Alpha usage proves one of these is genuinely blocking, it gets logged as
evidence and triaged — it is still not built inside Sprint 12 without that evidence.

Also out of scope: schema changes, RLS/policy changes, RPC changes, migrations, and
any change to financial calculations or import/export logic.

## Alpha success criteria

The Alpha is considered successful when **all** of the following hold:

1. **Balances reconcile.** Every active account's posted balance in App Finanzas
   matches the current system of record within the agreed tolerance (see
   [reconciliation-checklist.md](./reconciliation-checklist.md)).
2. **Dashboard is trustworthy.** Monthly income, expenses, savings, and savings rate
   match an independent recomputation for the reconciled month.
3. **Budgets are correct.** Planned vs. actual per category matches expectations for
   the reconciled month.
4. **Debts are correct.** Outstanding balances and principal paydown reflect reality.
5. **Net worth is correct.** Assets − liabilities matches the system of record at the
   chosen month-end.
6. **Import is safe.** CSV import does not create duplicates or silently drop valid
   rows, and invalid/duplicate rows are reported rather than posted.
7. **Export round-trips.** Exported CSVs contain the data needed to rebuild/verify
   the ledger.
8. **A findings list exists.** Every bug/friction is logged and triaged, with Alpha
   blockers either fixed or explicitly deferred with rationale.

## Real data privacy notes

This sprint involves **real personal/family financial data**. Treat it accordingly:

- Real data lives only in the live Supabase project and the authenticated app. It is
  protected by Supabase Auth + RLS (unchanged in this sprint).
- **Do not** commit real CSVs, exports, statements, balances, account numbers, or
  screenshots containing real figures into the git repository.
- Keep working CSVs and exports in a local, non-tracked location (e.g. outside the
  repo, or in a git-ignored scratch folder). Delete temporary exports when done.
- The logs in this folder ([bug-friction-log.md](./bug-friction-log.md),
  [alpha-daily-usage-log.md](./alpha-daily-usage-log.md)) are templates. When filling
  them in, **redact** real amounts/account identifiers — describe issues structurally
  (e.g. "checking posted balance off by one transaction") rather than pasting real
  numbers.
- `last_four` style fields are partial by design; still avoid pasting full numbers
  anywhere in docs or commits.

## Definition of done (for Sprint 12 overall)

- Real accounts created and opening balances set at the chosen cutoff date.
- At least one recent month imported and fully reconciled.
- At least one week of real daily usage completed and logged.
- Bug/friction log populated and triaged using
  [alpha-finding-triage-rules.md](./alpha-finding-triage-rules.md).
- A prioritized fix list produced for the next sprint.
- No unresolved **Alpha blocker** left undocumented.

## Definition of done (for Sprint 12.1 specifically — this sub-sprint)

- `docs/alpha/` exists with all six planning/checklist/log files.
- No code, UI, logic, SQL, RLS, or migration changes.
- `npm run lint` and `npm run build` pass.
- Branch `sprint/12-1-alpha-setup` ready for review and manual commit.

## Recommended phases

### 12.1 — Alpha setup and data import plan *(this sub-sprint)*
Produce the planning and checklist documentation (this folder). No data imported yet.

### 12.2 — Real data import and reconciliation
Follow [real-data-import-plan.md](./real-data-import-plan.md): create real accounts,
choose a cutoff date, set opening balances, import one recent month, and reconcile
using [reconciliation-checklist.md](./reconciliation-checklist.md). Import more history
only after the first month reconciles.

### 12.3 — One-week usage and bug/friction log
Use the app for real daily entry for at least a week. Record sessions in
[alpha-daily-usage-log.md](./alpha-daily-usage-log.md) and every issue in
[bug-friction-log.md](./bug-friction-log.md).

### 12.4 — Findings triage and prioritized fixes
Classify every logged finding with
[alpha-finding-triage-rules.md](./alpha-finding-triage-rules.md), then produce a
prioritized fix list. Alpha blockers are addressed first; post-MVP requests are
deferred unless real usage proved them blocking.

## Related documents

- [real-data-import-plan.md](./real-data-import-plan.md)
- [reconciliation-checklist.md](./reconciliation-checklist.md)
- [bug-friction-log.md](./bug-friction-log.md)
- [alpha-daily-usage-log.md](./alpha-daily-usage-log.md)
- [alpha-finding-triage-rules.md](./alpha-finding-triage-rules.md)
