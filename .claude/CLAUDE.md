# App Finanzas — Claude Code Project Context

## Product context
App Finanzas is a personal/family finance PWA built with Next.js, TypeScript, Tailwind, shadcn/ui, Supabase Auth, Supabase/PostgreSQL, GitHub, Vercel, Recharts, and Zod.

The product is an MVP Alpha. Keep scope small, usable, and aligned with the project documents: Product Brief, Roadmap, PRD, and Data Model.

## Product principles
- Manual-first, automation-later.
- Household-first architecture.
- Privacy by design.
- Simplicity over overbuilding.
- Every feature should support financial analysis, not just data entry.
- Do not add post-MVP features unless explicitly requested.

## Architecture rules
- Financial data belongs to a household.
- Use household_id on household-scoped tables.
- Preserve RLS and household isolation.
- Use the simplified ledger model:
  - transactions = financial event header.
  - transaction_entries = account balance movements.
  - transaction_allocations = reporting/budget classification.
- Account balances must be derived from transaction_entries.
- Dashboards, category reports, and budgets must use transaction_allocations.
- Do not physically delete critical financial records; prefer archive, void, or soft delete.
- For debts, use a liability account plus the debts extension table.
- Transfers should be modeled as one transaction with at least two entries and should not count as income or expense.

## Development workflow
- Work from main only after completed sprint merges.
- Create one branch per sprint or fix.
- Verify clean working tree before switching or starting.
- Keep each sprint scoped.
- You may create branches, commit, push, merge, and tag when the user explicitly asks.
- Never run destructive git commands (reset --hard, push --force, clean -f, branch -D) without explicit confirmation.
- Do not run npx supabase db push automatically.
- If database changes are needed, create or prepare migrations only and list exact manual Supabase commands for the user.

## Validation expectations
Before finishing a task, run or instruct the user to run the relevant checks:
- npm run lint
- npm run typecheck, if available
- npm run build, if feasible
- npm test, if available
- Manual localhost tests for the touched flow

## Final response format
End every implementation task with:
1. Files changed
2. Database/migration impact
3. Commands run
4. Manual tests required
5. Manual Supabase commands, if any
