# Alpha Finding Triage Rules

> Documentation only. Rules for classifying every finding in
> [bug-friction-log.md](./bug-friction-log.md) during phase 12.4. The goal is to fix
> what truly blocks trustworthy personal use and to **defer post-MVP work unless real
> usage proves it blocking**.

## Guiding principle

App Finanzas must produce **numbers I can trust** with my real money. Anything that
makes a relied-upon number wrong outranks anything cosmetic or convenience-related.
A feature request is not a bug; it only earns priority if real Alpha usage shows the
MVP is unusable without it.

## Classifications

### Alpha blocker (P0)
Makes the app **untrustworthy or unusable** for real personal finance. Must be fixed
before continuing to rely on the app.

Qualifies if **any** of:
- A balance, net worth, budget actual, or dashboard total is **wrong**.
- Import **creates duplicates** or **drops valid transactions** in a way that corrupts
  the ledger.
- Data is **lost** or silently changed.
- A core flow (add transaction, transfer, set opening balance, import) **fails** so you
  cannot record reality.
- Auth/access lets data leak or blocks legitimate access.

→ Fix first. Do not import more real data on top of an open Alpha blocker.

### Important bug (P1)
Clearly wrong behavior that has a workaround and does **not** corrupt core numbers, or
corrupts only an edge case you rarely hit.

Qualifies if:
- Wrong behavior but a reliable manual workaround exists.
- A non-core screen/report is incorrect but the underlying ledger is correct.
- Display/formatting bug that could mislead but doesn't change stored data.

→ Fix soon, after blockers.

### UX friction (P2)
The app does the right thing but is annoying, slow, or awkward. Numbers are correct.

Qualifies if:
- Too many steps/clicks for a common action.
- Confusing labels, placement, or layout.
- Mobile ergonomics (small targets, scrolling) without data impact.

→ Batch these; fix the highest-frequency ones. Friction hit **every day** can be
promoted in priority even though it isn't a bug.

### Nice-to-have (P3)
A small improvement that would be pleasant but isn't needed for trustworthy use.

Qualifies if:
- Minor convenience, polish, or quality-of-life tweak.
- A shortcut for something already achievable.

→ Backlog; do opportunistically.

### Post-MVP (defer)
A genuinely new capability outside the MVP scope. **Not built in Sprint 12** unless real
Alpha usage proves the MVP is blocking without it — and even then it is logged as
evidence and triaged, not built ad hoc.

Qualifies if it is one of: bank sync, advanced categorization rules, recurring
transactions, goals, AI recommendations, OCR, Stripe/billing, native mobile app, full
account deletion, external beta/multi-user invitations, advanced Payee/Vendor/Lender
CRUD, or similar.

→ Defer. Record the real-usage evidence (frequency, workaround cost) so a future
decision is data-driven.

## Decision flow

1. Does it make a relied-upon **number wrong**, lose data, or break a core flow?
   → **Alpha blocker (P0)**.
2. Is it clearly **wrong behavior** but with a workaround / non-core?
   → **Important bug (P1)**.
3. Is the behavior **correct** but annoying/slow/confusing?
   → **UX friction (P2)** (promote toward P1 if it hits every single day).
4. Would it merely be **nicer**, and is already achievable another way?
   → **Nice-to-have (P3)**.
5. Is it a **new capability** outside MVP scope?
   → **Post-MVP (defer)** — only reconsider with hard usage evidence.

## Worked examples

| Finding | Classification | Why |
|---|---|---|
| Wrong account balance after import | **Alpha blocker (P0)** | A core number is untrustworthy. |
| Import creates duplicated transactions | **Alpha blocker** or **Important bug** depending on severity | Mass/silent duplication that corrupts the ledger = P0; a rare, obvious, easily-removed dupe with a workaround = P1. |
| Net worth off because a liability shows the wrong sign | **Alpha blocker (P0)** | Net worth is a relied-upon total. |
| Dashboard counts a transfer as expense | **Alpha blocker (P0)** | Distorts spending/savings you rely on. |
| Budget "percent used" rounds oddly in display only | **Important bug (P1)** | Misleading but stored data is correct. |
| Button placement for "Add transaction" is annoying | **UX friction (P2)** | Behavior is correct; it's just awkward. |
| Editing a transaction takes too many steps, done many times a day | **UX friction (P2 → P1)** | Friction, but daily frequency can promote it. |
| Want a quick keyboard shortcut for entry | **Nice-to-have (P3)** | Convenience; already achievable. |
| Want recurring transactions | **Post-MVP (defer)** | New capability; defer unless Alpha proves it blocking. |
| Want bank sync | **Post-MVP (defer)** | Explicitly out of scope. |
| Want AI to auto-categorize | **Post-MVP (defer)** | Out of scope; gather evidence only. |

## Output of phase 12.4

Produce a **prioritized fix list** ordered P0 → P1 → P2, with post-MVP items parked in a
clearly-separated "deferred (needs evidence)" section. Every P0 must be either fixed or
explicitly deferred with written rationale before the Alpha is declared done.

## Related documents

- [bug-friction-log.md](./bug-friction-log.md)
- [sprint-12-alpha-plan.md](./sprint-12-alpha-plan.md)
- [reconciliation-checklist.md](./reconciliation-checklist.md)
