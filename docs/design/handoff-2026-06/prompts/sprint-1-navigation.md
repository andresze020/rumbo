# Sprint 1 — Navigation system (groups + phases + locked)

Copy everything below the line into Claude Code.

---

You are working on my project "App Finanzas", a personal/family finance PWA built with Next.js, TypeScript, Tailwind, shadcn/ui, Supabase Auth, Supabase/PostgreSQL, GitHub, Vercel, Recharts, and Zod.

Keep the implementation aligned with the Product Brief, Roadmap, PRD, and Data Model. Read the design handoff first: `docs/design/handoff-2026-06/` (README.md, IMPLEMENTATION-PLAN.md, and `project/App Finanzas.dc.html` for the desktop sidebar). The design tokens already match `src/app/globals.css`.

Current status:
- MVP Alpha (Sprint 12.x). Nav today is a flat list duplicated in `app-sidebar.tsx` and `mobile-nav.tsx`.
- This is the first sprint of the 2026-06 UI/UX redesign. See `docs/design/handoff-2026-06/IMPLEMENTATION-PLAN.md` (Sprint 1).
- Current branch: create and work on `feature/redesign-s1-navigation`.
- Sprint goal: introduce a scalable, grouped navigation IA with feature-phase badges and a locked "coming soon" pattern, WITHOUT changing any existing screen content.

Scope:
- Do:
  1. Create `src/lib/nav/config.ts` as the single source of navigation:
     `Phase = 'alpha' | 'beta' | 'soon' | 'pro'`;
     `NavItem = { href; labelKey; icon; phase }`;
     `NavGroup = { titleKey; items }`.
     Groups: Overview, Money, Planning, Analysis, Automation, Settings.
     Place current Alpha routes as `phase: 'alpha'` (no badge).
  2. Refactor `src/components/app-sidebar.tsx` to render groups with uppercase
     titles + phase badges. Keep the existing collapse + localStorage behavior.
  3. Create `src/components/locked-feature-card.tsx` and a generic route
     `src/app/dashboard/coming-soon/[feature]/page.tsx` that renders title,
     description, phase, icon and a `Callout` "coming soon".
  4. Add future items to the config (Goals/Funds, Debt Planner, Month Review,
     Reports, Trends, Cash Flow, Automation/Rules, Review Queue, Assistant
     module, Household, Privacy, Plan/Billing) with phase beta/soon/pro, each
     linking to `coming-soon`.
  5. Phase badge styles: amber (beta), gray/muted (soon), gold (pro).
  6. Add the new i18n keys (group titles + labels + coming-soon copy) to
     `src/lib/i18n/dictionaries.ts` in ES/EN/FR.
- Do not:
  1. Build any real future-module functionality or backend.
  2. Touch the mobile bottom-nav (that is Sprint 2) — keep `mobile-nav.tsx` working.
  3. Redesign Dashboard or Transactions content.
  4. Change tokens in `globals.css`.

Architecture rules:
- Household-first. Preserve RLS. Simplified ledger (transactions, entries, allocations).
- No physical delete for critical financial records.

Workflow rules:
- Inspect before editing. Produce a concise plan before changes. Keep changes scoped.
- Do not run git add/commit/push/merge/tag/reset/clean/rebase.
- Do not run npx supabase db push. No migrations expected this sprint.

Validation:
- Run or tell me to run `npm run lint`, `npx tsc --noEmit`, and `npm run build`.
- Manual tests:
  1. Sidebar shows 6 groups; Alpha items have no badge; beta/soon/pro show the right badge.
  2. Clicking a locked item opens the coming-soon page with correct copy/phase.
  3. Collapse/expand still works and persists.
  4. ES/EN/FR labels render; light/dark both look correct.

Final response:
- Files changed
- Database impact
- Commands run
- Manual tests
- Manual Supabase commands
- Manual Git commands
