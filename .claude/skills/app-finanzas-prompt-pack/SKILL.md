---
name: app-finanzas-prompt-pack
description: Use when the user asks for a prompt for Claude Code, Codex, ChatGPT, a new chat, or a continuation prompt for an App Finanzas sprint.
---

# App Finanzas Prompt Pack

Use this skill to produce reusable prompts for Claude Code, Codex, or ChatGPT.

## Prompt requirements

Every implementation prompt must include:

1. Project context.
2. Current sprint status.
3. Current branch or required branch name.
4. Sprint goal.
5. Specific tasks.
6. Expected behavior.
7. Scope exclusions.
8. Architecture constraints.
9. Supabase instructions.
10. Git instructions.
11. Validation commands.
12. Manual tests.
13. Final response format.

## Standard implementation prompt structure

```text
You are working on my project “App Finanzas”, a personal/family finance PWA built with Next.js, TypeScript, Tailwind, shadcn/ui, Supabase Auth, Supabase/PostgreSQL, GitHub, Vercel, Recharts, and Zod.

Keep the implementation aligned with the Product Brief, Roadmap, PRD, and Data Model.

Current status:
- [state completed sprints]
- Current branch: [branch]
- Sprint goal: [goal]

Scope:
- Do:
  1. ...
  2. ...
- Do not:
  1. ...

Architecture rules:
- Household-first.
- Preserve RLS.
- Use simplified ledger: transactions, transaction_entries, transaction_allocations.
- Account balances from entries.
- Reports/budgets from allocations.
- No physical delete for critical financial records.

Workflow rules:
- Inspect before editing.
- Produce a concise plan before changes.
- Keep changes scoped.
- Do not run git add/commit/push/merge/tag/reset/clean/rebase.
- Do not run npx supabase db push.
- If migrations are needed, create them and list the manual command.

Validation:
- Run or tell me to run npm run lint.
- Run or tell me to run npm run build.
- Include manual test steps.

Final response:
- Files changed
- Database impact
- Commands run
- Manual tests
- Manual Supabase commands
- Manual Git commands
```

## Language rule

Default to English for prompts to coding agents unless the user explicitly asks for Spanish.
