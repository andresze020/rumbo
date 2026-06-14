# Sprint 2 — Mobile bottom-nav + FAB

Copy everything below the line into Claude Code.

---

You are working on my project "App Finanzas", a personal/family finance PWA built with Next.js, TypeScript, Tailwind, shadcn/ui, Supabase Auth, Supabase/PostgreSQL, GitHub, Vercel, Recharts, and Zod.

Keep the implementation aligned with the Product Brief, Roadmap, PRD, and Data Model. Read the design handoff first: `docs/design/handoff-2026-06/project/App Finanzas Movil.dc.html` (bottom-nav with FAB, screens Home/Movements/Plan/More) and `IMPLEMENTATION-PLAN.md` (Sprint 2).

Current status:
- Sprint 1 (grouped navigation + phase badges + locked coming-soon) is merged.
- Mobile today uses a hamburger `Sheet` in `mobile-nav.tsx`.
- Current branch: create and work on `feature/redesign-s2-mobile-nav`.
- Sprint goal: turn mobile into a true daily-use PWA with a 5-slot bottom-nav (Home / Movements / + / Plan / More) and a contextual FAB, reusing existing quick-add flows.

Scope:
- Do:
  1. Create `src/components/mobile-bottom-nav.tsx`: tabs Home/Movements/+/Plan/More,
     active by route, with a centered FAB.
  2. FAB opens a contextual menu: Add expense / Add income / Transfer / Debt
     payment / Import CSV. Reuse `transaction-dialog-provider`,
     `global-add-transaction-button`, and `quick-add-actions.ts`. Do not
     re-implement the add flows.
  3. Create `src/app/dashboard/more/page.tsx`: available modules vs. future
     modules (reuse `LockedFeatureCard` from Sprint 1) plus settings/theme/
     language/profile access.
  4. Create `src/app/dashboard/plan/page.tsx`: mobile aggregator of Budgets
     (real), Debts (real), Goals (locked Beta), and upcoming payments (real,
     from recurring Due/Upcoming).
  5. Update `src/app/dashboard/layout.tsx`: bottom-nav on mobile, sidebar on
     desktop; retire/replace the `Sheet` from `mobile-nav.tsx`. Keep desktop
     untouched. Add bottom padding so content isn't hidden behind the nav.
  6. Add any new i18n keys (Plan, More, FAB actions) in ES/EN/FR.
- Do not:
  1. Build real future-module functionality (Goals stays locked).
  2. Redesign the Dashboard content (Sprint 3) or Transactions (Sprint 4).
  3. Change the desktop sidebar.

Architecture rules:
- Household-first. Preserve RLS. Simplified ledger (transactions, entries, allocations).
- Reports/budgets from allocations; balances from entries.

Workflow rules:
- Inspect before editing. Concise plan before changes. Keep scope tight.
- Do not run git add/commit/push/merge/tag/reset/clean/rebase.
- Do not run npx supabase db push. No migrations expected this sprint.

Validation:
- Run or tell me to run `npm run lint`, `npx tsc --noEmit`, and `npm run build`.
- Manual tests (use device emulation / real phone):
  1. Bottom-nav switches Home/Movements/Plan/More; active state correct.
  2. FAB opens the 5 actions; each opens the existing add/transfer/CSV flow.
  3. Plan shows real budgets/debts/upcoming and a locked Goals card.
  4. More lists available vs. future modules with correct badges.
  5. Desktop layout unchanged. Content not hidden behind bottom-nav.
  6. ES/EN/FR + light/dark verified.

Final response:
- Files changed
- Database impact
- Commands run
- Manual tests
- Manual Supabase commands
- Manual Git commands
