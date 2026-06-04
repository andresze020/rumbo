# Alpha Finding Triage Rules

> Documentation only. Rules for classifying every finding in [bug-friction-log.md](./bug-friction-log.md). The goal is to fix what truly blocks trustworthy personal use and defer post-MVP work unless real usage proves it blocking.

## Guiding principle

App Finanzas must produce **numbers I can trust** with real money. Anything that makes a relied-upon number wrong outranks anything cosmetic or convenience-related.

## Classifications

### Alpha blocker (P0)

Makes the app **untrustworthy or unusable** for real personal finance. Must be fixed before continuing to rely on the app.

Qualifies if any of:

- A balance, net worth, budget actual, debt balance, FX-converted value, or dashboard total is wrong.
- Import creates duplicates or drops valid transactions in a way that corrupts the ledger.
- Data is lost or silently changed.
- A core flow fails so you cannot record reality.
- Auth/access lets data leak or blocks legitimate access.

### Important bug (P1)

Clearly wrong behavior that has a workaround and does not corrupt core numbers, or corrupts only a limited/edge case.

### UX friction (P2)

The app does the right thing but is annoying, slow, or awkward. Numbers are correct.

### Nice-to-have (P3)

Small improvement that would be pleasant but is not needed for trustworthy use.

### Post-MVP / Deferred

A new capability outside MVP scope: bank sync, advanced rules, recurring transactions, goals, AI, OCR, Stripe, native mobile app, external beta/multi-user invitations, etc.

## Status update after Sprints 12.4 and 12.5

| Finding | Final status | Rationale |
|---|---|---|
| BF-001 | Fixed | FX friction was addressed with shared FX utility, auto-fetch, base→account user-facing rate, and debt FX RPC fix. |
| BF-002 | Fixed | Mobile negative opening balance typing fixed. |
| BF-003 | Fixed | Liability balance display clarified while ledger remains signed internally. |
| BF-004 | Fixed | Edit Account links now scroll to the edit form. |
| BF-005 | Open | Product/UX decision pending for negative Cash opening balance. |
| BF-006 | Fixed | Category parent filtering now updates live. |
| BF-007 | Open | Add Transaction from account still pending. |
| BF-008 | Open / Deferred | “Save and add next” remains P3 until usage evidence justifies it. |
| BF-009 | Fixed | Weak password message improved. |
| BF-010 | Fixed | Global Add Transaction FAB implemented. |

## Decision flow

1. Does it make a relied-upon **number wrong**, lose data, or break a core flow?
   → **Alpha blocker (P0)**.
2. Is it clearly **wrong behavior** but with a workaround / non-core?
   → **Important bug (P1)**.
3. Is the behavior **correct** but annoying/slow/confusing?
   → **UX friction (P2)**.
4. Would it merely be **nicer**, and is already achievable another way?
   → **Nice-to-have (P3)**.
5. Is it a **new capability** outside MVP scope?
   → **Post-MVP / Deferred**.

## Worked examples

| Finding | Classification | Why |
|---|---|---|
| Wrong account balance after import | Alpha blocker | Core number is untrustworthy. |
| Net worth off because a liability has wrong sign | Alpha blocker | Net worth is relied upon. |
| Non-base-currency debt uses 1:1 exchange rate | Alpha blocker | Debt/net worth in base currency is wrong. |
| Dashboard counts transfer as expense | Alpha blocker | Spending/savings are distorted. |
| Weak password message confusing | Important bug | Onboarding failure with clear fix needed. |
| Button placement annoying | UX friction | Behavior works; flow is awkward. |
| Add transaction from account missing | UX friction | Repetitive navigation, but no data impact. |
| Save and add next | Nice-to-have | Useful but not yet proven critical. |
| Bank sync | Post-MVP | Explicitly out of scope. |

## Output of phase 12.4

Produce a prioritized fix list ordered P0 → P1 → P2, with post-MVP items parked in a clearly separated deferred section. Every P0 must be fixed or explicitly deferred with rationale before Alpha is declared done.

## Related documents

- [bug-friction-log.md](./bug-friction-log.md)
- [sprint-12-alpha-plan.md](./sprint-12-alpha-plan.md)
- [reconciliation-checklist.md](./reconciliation-checklist.md)
