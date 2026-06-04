# Alpha Daily Usage Log

> Documentation only. Lightweight log of real-usage sessions during Alpha. Keep it quick — one row per session.
>
> **Privacy:** do not record real amounts or account numbers here. Counts and structural descriptions only.

## Field guide

- **Date** — YYYY-MM-DD.
- **Device** — Desktop / Tablet / Mobile (+ browser if relevant).
- **Session duration** — rough minutes.
- **Actions performed** — e.g. added expenses, reviewed dashboard, imported CSV, reconciled FX.
- **# transactions added** — count of manual transactions entered.
- **Imports performed** — count of CSV imports and batch ids if useful.
- **Bugs found** — count + `BF-###` ids logged in [bug-friction-log.md](./bug-friction-log.md).
- **Frictions found** — count + `BF-###` ids.
- **Needed AndroMoney?** — Yes/No: did you need the old system to complete the task or trust a number?
- **Notes** — structural notes only; no real figures.

## Implementation milestones already completed

| Date | Sprint/tag | Summary | Issues affected | Notes |
|---|---|---|---|---|
| 2026-06-04 | `v0.12.4-alpha-critical-fixes` | Alpha critical fixes completed. | BF-002, BF-003, BF-006, BF-009 | Validate on mobile, liabilities, categories, and auth signup. |
| 2026-06-04 | `v0.12.5-alpha-ux-friction-fixes` | UX friction fixes and FX redesign completed. | BF-001, BF-004, BF-010 + debt FX data issue | Validate FAB, edit-account scroll, auto-FX, non-base debt conversion. |
| 2026-06-04 | `v0.12.6-action-form-ux` | Action forms (accounts, transactions, debts) converted to FormDialog pattern. | BF-004, BF-007, BF-010 | Validate forms open in dialogs, FAB lazy-loads, no inline card forms. |
| 2026-06-04 | `v0.12.7-critical-bug-fixes` | Transfer FX bug (BF-020) + form field preservation (BF-018) + category caching (BF-011) fixed. | BF-020, BF-018, BF-011 | **CRITICAL:** Re-validate all non-base-currency transfers after this migration. Test account field preservation across type changes. Verify new categories appear in Add Transaction dialog. |

## Log

| Date | Device | Session duration | Actions performed | # transactions added | Imports performed | Bugs found | Frictions found | Needed AndroMoney? | Notes |
|---|---|---|---|---:|---:|---|---|---|---|
|  |  |  |  |  |  |  |  |  |  |
|  |  |  |  |  |  |  |  |  |  |
|  |  |  |  |  |  |  |  |  |  |
|  |  |  |  |  |  |  |  |  |  |
|  |  |  |  |  |  |  |  |  |  |

## Post-12.7 validation sessions to capture (CRITICAL)

Use one row per session above after checking:

**CRITICAL (Sprint 12.7 migration):**
- Non-base-currency transfers: create a COP→COP transfer, verify Total Assets impact is correct (small amount, not literal COP amount).
- Account field preservation: start Expense with account selected, change to Income (account persists), change to Transfer (account becomes "From account").
- Category creation: create a category, open Add Transaction FAB immediately (new category should appear).

**Regression checks (from 12.4-12.6):**
- Mobile negative opening balance typing.
- Liability account setup and net worth impact.
- Non-base-currency opening balance FX.
- Non-base-currency debt creation FX.
- Category parent filtering.
- Global Add Transaction FAB.
- Edit Account scroll/focus behavior.
- FormDialog pattern (all forms open in dialogs, not inline).

## Week summary

- Days used out of 7:
- Total transactions added:
- Total imports:
- Total bugs / frictions logged:
- Times I needed AndroMoney instead:
- Overall: could I rely on App Finanzas alone yet? (Yes / Not yet — why):

## Related documents

- [bug-friction-log.md](./bug-friction-log.md)
- [sprint-12-alpha-plan.md](./sprint-12-alpha-plan.md)
- [reconciliation-checklist.md](./reconciliation-checklist.md)
