Estoy trabajando en mi proyecto “App Finanzas”, una PWA de finanzas personales/familiares construida con:

* Next.js
* TypeScript
* Tailwind
* shadcn/ui
* Supabase Auth
* Supabase/PostgreSQL
* GitHub
* Vercel
* Claude Code

Quiero que el desarrollo siga alineado con los documentos del proyecto:

* Product Brief
* Roadmap
* PRD
* Data Model
* Initial SQL Schema

No quiero saltar módulos fuera del orden documentado salvo que sea intencional.

Estado actual del proyecto:

* Sprint 1: setup técnico, completado.
* Sprint 2: base de datos inicial, completado.
* Sprint 3: auth/onboarding/household, completado.
* Sprint 4: accounts/categories CRUD/archive, completado.
* Sprint 5.1: transaction filters, completado.
* Sprint 5.2: safe transaction edit, completado.
* Sprint 6: transfers, completado.
* Sprint 7: dashboard financiero, completado.
* Sprint 8: budget/presupuesto mensual, completado.
* Sprint 9: CSV import, completado.
* Sprint 10: debts and net worth, completado.
* Sprint 11.1: CSV export, completado.
* Sprint 11.2: Security/RLS/server-side validation review, completado.
* Sprint 11.2.5: Navigation/session UI polish, completado.
* Sprint 11.3.1: Accounts UX cleanup, completado.
* Sprint 11.3.2: Categories UX cleanup, completado.
* Sprint 11.3.3: Transactions UX cleanup, completado.
* Sprint 11.3.4: Responsive QA and Alpha Readiness, completado.
* Sprint 11.3.5: Alpha Blocking Fixes, completado.
* Sprint 11.3.6: Budgets UX cleanup, completado.
* Sprint 11.3.7: Debts UX and payment guardrails, completado.
* Sprint 11.3.8: Final Alpha Readiness Re-test, completado.

Sprint 11 ya quedó completo, merged, pushed y tagged como:

* v0.11.0-export-security-polish

Estado Git esperado:

* Estoy en `main` o debo volver a `main`.
* El último sprint está merged a `main`.
* El working tree debería estar limpio.
* El tag `v0.11.0-export-security-polish` ya existe o debe confirmarse.
* No quiero trabajar directo sobre `main` para cambios nuevos.
* Para cualquier fix del Alpha, quiero crear branches limpias desde `main`.

Preferencias importantes de Git/Codex:

* Usar branches limpias desde `main`.
* Verificar siempre `git status` antes de empezar.
* Codex puede crear branches con comandos seguros como:

  * `git checkout -b <branch>`
* Codex puede inspeccionar archivos y editar archivos.
* Codex puede preparar migrations si son necesarias.
* Codex NO debe ejecutar:

  * `git add`
  * `git commit`
  * `git push`
  * `git merge`
  * `git tag`
  * `git reset`
  * `git clean`
  * `git rebase`
  * `npx supabase db push`
  * `supabase db push`
  * `supabase link`
  * `supabase login`
  * comandos destructivos

Yo ejecutaré manualmente esos comandos desde mi terminal local.

Si hay cambios SQL/RPC:

* Codex debe crear/preparar la migration.
* Codex NO debe correr `npx supabase db push`.
* Codex debe decirme exactamente qué comando correr manualmente y qué validar después.

Instrucción especial para futuros prompts de Codex:

Cada prompt debe terminar con instrucciones explícitas sobre:

1. Si debe preparar migration o no.
2. Si aplica o no correr Supabase push.
3. Que Codex NO debe correr `npx supabase db push`.
4. Qué comando exacto debo correr yo manualmente si hay migration.
5. Qué manual tests debo hacer.
6. Qué validaciones debo correr:

   * `git status`
   * `npm run lint`
   * `npm run build`
   * tests si existen
7. Qué commits manuales se sugieren.
8. Qué push/merge/tag manual debo hacer.

Sprints completados en Alpha personal use:

* Sprint 12.1: Alpha setup and data import plan, completado.
* Sprint 12.2: Real data import and reconciliation, completado.
* Sprint 12.3: One-week usage and bug/friction log, completado.
* Sprint 12.4: Alpha findings triage and next fixes, completado.
* Sprint 12.5: UX friction fixes (inline→focused, footer compact), completado.
* Sprint 12.6: Action Forms UX (FormDialog pattern, FAB-only global add), completado.

Sprint 12 — Alpha personal use

Según el PRD/Roadmap, Sprint 12 no debería ser un sprint de funcionalidades grandes. Debe enfocarse en usar la app con datos reales durante el Alpha personal, validar balances, comparar contra mi sistema actual/AndroMoney, registrar bugs, registrar fricciones, y decidir qué ajustes son realmente necesarios antes de pensar en beta externa.

Objetivo de Sprint 12:

* Usar App Finanzas con datos reales personales/familiares.
* Cargar/importar datos reales.
* Validar que balances, dashboard, budget, debts y net worth sean confiables.
* Comparar contra AndroMoney o mis registros actuales.
* Registrar bugs/fricciones reales.
* Clasificar hallazgos entre:

  * Alpha blocker
  * Bug importante
  * UX friction
  * Nice-to-have
  * Post-MVP
* Evitar construir features nuevas sin evidencia de uso real.
* Preparar una lista priorizada de fixes después del Alpha.

No quiero avanzar todavía a:

* bank sync
* advanced categorization rules
* recurring transactions
* goals
* AI recommendations
* OCR
* Stripe/billing
* native mobile app
* account deletion completa
* beta externa
* multi-user invitations completas
* Payee/Vendor/Lender CRUD avanzado
* features post-MVP

Alpha findings (2026-06-04 feedback during real usage)

**Bugs/Critical:**
- [FIXED in 12.6] Inline edit forms (accounts, transactions, debts) were hidden or not obvious.
- [BUG] Subcategorías nuevas no aparecen en transaction form hasta refresh de página.

**UX Friction:**
- Accounts view is too expanded; should be compact by default, expand only when card is tapped.
- Transactions view is too expanded; should be more compact.
- Mobile: when selecting menu item, menu should auto-collapse (saving screen real estate).
- [COMPLETED in 12.6] Forms should use dialog/modal instead of inline cards.
- [COMPLETED in 12.6] Create categoría should use FormDialog.

**Feature Requests / Nice-to-have:**
- Accounts summary card tap should navigate to filtered transactions view for that account only (quick access, no manual filter).
- Transactions should display category icon next to amount/description for quick visual scanning.
- Filters could be more dynamic with multi-select support (instead of single-select dropdowns).

**Post-MVP:**
- Advanced categorization rules.
- Recurring transactions.
- Goals.
- Bank sync.
- AI recommendations.

## Sprint 12.7+ — Next phase planning

**Before Sprint 12.7 kicks off:**

1. Validate that liability opening balance sign behavior is correct (BF-003 P0 blocker).
2. Validate that net worth calculations match expected values.
3. Document any additional fricc found during extended alpha usage.

**Sprint 12.7 recommended roadmap:**

**High-priority compactness and bugs (to run concurrently if possible):**

1. BF-011 (P1) — Investigate and fix category/subcategory revalidation (likely NextJS cache/revalidatePath issue).
2. BF-002 (P1) — Mobile input field negative value entry (HTML input type/inputMode fix).
3. BF-012 (P2) — Mobile menu auto-collapse (add onClick handler to close <details>).
4. BF-013/014 (P2) — Accounts and Transactions view compactness (redesign card/row layouts).
5. BF-015 (P2) — Transaction category icons (add to transaction display if data available).

**Sprint 12.8+ (lower priority):**

6. BF-016 (P2) — Accounts card tap → filtered transactions (low-risk, high UX gain).
7. BF-017 (P3) — Multi-select filters (defer unless real usage shows necessity).

**Validation after Sprint 12.7:**

- 2-week extended Alpha usage with fixes applied.
- Confirm balances still match AndroMoney/manual records.
- No new critical bugs.
- UX friction reduced.

**Then plan Beta Readiness (v0.13):**

- Documentation for external testers.
- Onboarding improvements.
- Multi-user household invites (scope TBD).
- Bug/feedback submission workflow.
