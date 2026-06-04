# docs/alpha updated package — Sprint 12.4/12.5/12.6

This folder contains updated Alpha Markdown documentation after:

- Sprint 12.4 — `v0.12.4-alpha-critical-fixes`
- Sprint 12.5 — `v0.12.5-alpha-ux-friction-fixes`
- Sprint 12.6 — `v0.12.6-action-form-ux`

## Files updated

- `bug-friction-log.md` — issues BF-001 to BF-017 updated with:
  - BF-004, BF-007, BF-010 marked Fixed in Sprint 12.6.
  - BF-011 to BF-017 added (new findings from 2026-06-04 alpha usage).
  - Suggested next fix batch updated for Sprint 12.7+.
- `sprint-12-alpha-plan.md` — Alpha plan updated with 12.4/12.5/12.6 progress and current open issues.
- `real-data-import-plan.md` — updated with new FX behavior, base→account rate convention, and debt FX correction.
- `reconciliation-checklist.md` — added post-12.5/12.6 targeted validation checks.
- `alpha-finding-triage-rules.md` — updated with status table and FX/debt examples.
- `alpha-daily-usage-log.md` — added implementation milestones and post-12.6 validation session checklist.
- `sprint-12-4-12-5-architect-handoff.md` — updated with Sprint 12.6 completion, new alpha findings, and Sprint 12.7+ recommendations.

## Current open issues / Next priorities (Sprint 12.7)

**Critical:**
- BF-011 — Newly created categories/subcategories missing from transaction form until refresh (revalidation).

**High (P1):**
- BF-002 — Mobile opening balance field not accepting negative input by keyboard.

**High (P2) — Compactness/UX:**
- BF-012 — Mobile menu auto-collapse after navigation.
- BF-013 — Accounts view too expanded; needs compact layout.
- BF-014 — Transactions view too expanded; needs compact layout.
- BF-015 — Transactions missing category icons for visual scanning.

**Nice-to-have (P2/P3):**
- BF-016 — Accounts card tap → filtered transactions view.
- BF-017 — Multi-select/dynamic filters (deferred).

**Deferred/Blocked:**
- BF-003 — Liability opening balance sign: blocked pending validation.
- BF-005 — Cash account negative balance: warning/helper text decision pending.
- BF-008 — Save and add next: deferred until usage evidence justifies it.

## Notes

No real financial values should be added to these docs before committing.
