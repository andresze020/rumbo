# AGENTS.md — App Finanzas

## Project context

This is App Finanzas, a personal/family finance PWA.

Stack:
- Next.js
- TypeScript
- Tailwind CSS
- shadcn/ui
- Supabase Auth
- Supabase/PostgreSQL
- GitHub
- Vercel

The product is household-first. All financial data must belong to a household.

Current completed sprint:
- Sprint 2.1 — Auth + Profile + Household

Already existing real Supabase tables:
- profiles
- households
- household_members
- currencies

Supabase SSR is already configured.

Existing files include:
- src/lib/supabase/client.ts
- src/lib/supabase/server.ts
- src/lib/supabase/middleware.ts
- src/middleware.ts
- src/app/login/page.tsx
- src/app/login/actions.ts
- src/app/onboarding/page.tsx
- src/app/onboarding/actions.tsx
- src/app/dashboard/page.tsx

## Current sprint

We are starting Sprint 2.2 — Accounts + Categories base.

Do not build transactions yet.

The sprint should add:
- accounts table
- categories table
- indexes
- updated_at triggers
- RLS
- policies by household
- default categories per household
- minimal accounts UI
- minimal categories UI
- server actions connected to the active household

## Technical rules

Use small, safe SQL migrations.

Do not apply the full big schema yet.

Do not introduce Java.

Do not bypass RLS.

Do not use Supabase service role key in app code.

Use server actions for writes.

Prefer simple readable code over abstractions.

Use TypeScript types where practical.

Run checks before final answer:
- npm run lint
- npm run build

## Git rules

Work on a branch, not directly on main.

Use small commits:
1. database migration
2. accounts UI/actions
3. categories UI/actions
4. onboarding/default categories integration if needed

Before making code changes, explain the plan.
Before committing, show the diff summary.