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

## Out-of-scope skills
The `zoho-*` skills (`zoho-ds-review`, `zoho-deluge-scripts`, `zoho-csv-import`,
`zoho-feature-blueprint`, `zoho-session-starter`) belong to a **completely separate
Zoho Creator project**. They are account-level skills that happen to be visible in
this session. Never invoke them for App Finanzas work, and never borrow their
conventions, formats, or terminology into this repo.

## Automation primitives
This repo automates parts of its own development. See
`docs/ai-agents-workflow.md` for what exists and why:
- Subagents (`.claude/agents/`): `ledger-guard` (reviews a diff against the
  ledger rules), `scout` (locates code, returns file:line), `i18n-scribe`
  (translations), `migration-drafter` (SQL), `sprint-closer` (state docs).
- Slash commands (`.claude/commands/`): `/revisar-ledger`, `/buscar`,
  `/contexto`, `/i18n`, `/cerrar-sprint`.
- Hooks (`.claude/hooks/`): `SessionStart` (checkout status + context budget),
  `PreToolUse` (`context-guard`, blocks wasteful reads), `Stop` (blocking
  typecheck gate).

## Context budget
Context is the scarcest resource here; treat it as a budget, not a bucket.
- `AGENTS.md` is deliberately short. Sprint history lives in
  `docs/SPRINT-LOG.md` — read it only when you need the *why* of a past
  decision, never as routine startup reading.
- Before opening code that already exists, delegate to `scout`. It explores in
  its own context and returns `file:line`, so 2.000-line files never enter this
  one.
- Translations → `i18n-scribe`. Migrations → `migration-drafter`. Sprint close →
  `sprint-closer`.
- Never read a file over ~700 lines whole. Grep for the symbol, then Read with
  `offset`/`limit` around the hit. The `context-guard` hook enforces this.
- The Supabase MCP server is disabled by default (its tool schemas cost tokens
  every session). Enable it with `/mcp` only when you are actually going to
  query the database.

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
Before finishing a task, run the validation gate defined by the `app-finanzas-verify`
skill (the single source of truth). In short:
- npm run lint
- npx tsc --noEmit  (there is no `typecheck` npm script)
- npm run build, when feasible
- Manual localhost tests for the touched flow

## Final response format
End every implementation task with:
1. Files changed
2. Database/migration impact
3. Commands run
4. Manual tests required
5. Manual Supabase commands, if any
