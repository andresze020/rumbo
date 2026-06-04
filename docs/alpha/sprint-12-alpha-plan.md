# Sprint 12 — Alpha Personal Use Plan

> Status: active Alpha validation document. Sprint 12 started as documentation-only, then produced real Alpha findings. Sprints 12.4, 12.5, and 12.6 addressed the first high-priority findings and UX frictions. Sprint 12.7+ will focus on compactness and remaining friction fixes based on 2026-06-04 alpha feedback.

## Objective

Use App Finanzas with **real personal/family financial data**, compare it against
current records (AndroMoney and/or bank/credit-card statements), and validate that the
core MVP produces trustworthy numbers across:

- Account balances
- Dashboard metrics
- Budgets
- Debts
- Net worth
- CSV import
- CSV export

The goal remains to gather **real usage evidence** before deciding what to build or fix next.

## Why this sprint exists

The MVP is feature-complete for personal use, but real Alpha usage is what proves whether the app can be trusted with actual finances. Sprint 12 deliberately delays post-MVP functionality until real usage proves what is actually missing or broken.

## Scope

- Importing or manually entering real accounts and a bounded slice of transactions.
- Reconciling App Finanzas numbers against AndroMoney / current records.
- Using the app for everyday entry.
- Logging every bug and friction encountered.
- Triaging findings into a prioritized fix list.
- Fixing only the issues that block or significantly degrade Alpha usage.

## Out of scope

Do **not** build, and do **not** treat as Alpha work unless real usage proves it blocking:

- Bank sync / open banking
- Advanced categorization rules / auto-categorization
- Recurring transactions
- Goals
- AI recommendations
- OCR / receipt scanning
- Stripe / billing
- Native mobile app
- Full account deletion
- External beta / multi-user invitations
- Advanced Payee / Vendor / Lender CRUD
- Any other post-MVP functionality

## Alpha success criteria

The Alpha is considered successful when **all** of the following hold:

1. **Balances reconcile.** Every active account's posted balance matches the current system of record within the agreed tolerance.
2. **Dashboard is trustworthy.** Monthly income, expenses, savings, and savings rate match an independent recomputation for the reconciled month.
3. **Budgets are correct.** Planned vs. actual per category matches expectations.
4. **Debts are correct.** Outstanding balances and principal paydown reflect reality, including non-base-currency debts.
5. **Net worth is correct.** Assets − liabilities matches the system of record at the chosen month-end.
6. **Import is safe.** CSV import does not create duplicates or silently drop valid rows.
7. **Export round-trips.** Exported CSVs contain data needed to rebuild/verify the ledger.
8. **A findings list exists.** Every bug/friction is logged and triaged, with Alpha blockers fixed or explicitly deferred with rationale.

## Progress update — Sprints 12.4 and 12.5

### Sprint 12.4 — Alpha Critical Bug Fixes

Branch: `sprint/12-4-alpha-critical-fixes`  
Tag: `v0.12.4-alpha-critical-fixes`

Fixed:

- `BF-002` — Mobile opening balance input blocked typed negative values.
- `BF-003` — Liability balances now display as absolute owed amounts while ledger remains signed internally.
- `BF-006` — Category parent options now refresh when category/reporting type changes.
- `BF-009` — Weak-password signup error now surfaces clearer Supabase password-specific message.

Database impact: none for these fixes. Liability sign handling was already correct in prior migration `20260601143624_fix_opening_balance_signed_amount.sql`.

### Sprint 12.5 — Alpha UX Friction Fixes

Branch: `sprint/12-5-alpha-ux-friction-fixes`  
Tag: `v0.12.5-alpha-ux-friction-fixes`

Fixed:

- `BF-010` — Added global Add Transaction as fixed FAB; mobile menu keeps text link.
- `BF-004` — Edit Account now scrolls to the edit form via `#account-edit-form` fragment.
- `BF-001` — Multi-currency exchange-rate UX redesigned across transaction, opening-balance, and debt forms.
- `BF-001 debt data` — `create_debt_with_account` RPC no longer hardcodes `exchange_rate_to_base = 1`; it now accepts `p_exchange_rate_to_base`.

Database impact: Sprint 12.5 added migration `20260603000100_debt_opening_balance_exchange_rate.sql`.

## Current FX behavior after Sprint 12.5

- Shared utility: `src/lib/fx.ts`.
- User-facing rate direction: **base→account**, e.g. `1 CAD = X COP`.
- Server actions invert user input before writing `exchange_rate_to_base`.
- Applied in:
  - `accounts/actions.ts` → `setOpeningBalanceAction`
  - `transactions/actions.ts` → `createManualTransactionAction`
  - `debts/actions.ts` → `createDebtAction`
- Auto-fetch exists in:
  - `TransactionForm`
  - `OpeningBalanceForm`
  - `DebtCreateForm`
- For future dates, the FX utility uses the latest available rate and shows a warning.

### Sprint 12.6 — Action Forms UX

Branch: `sprint/12-6-action-form-ux`  
Tag: `v0.12.6-action-form-ux`

Fixed:

- `BF-004` — Edit Account now opens in a `FormDialog` instead of inline, making it obvious that edit mode started.
- `BF-007` — Add Transaction from account card now opens transaction form with account preselected.
- `BF-010` — Global Add Transaction FAB button (bottom-right) appears on all dashboard pages; lazy-loads form data on first open.

New components:

- `src/components/form-dialog.tsx` — Reusable dialog wrapper for all action forms (URL-param based open/close, auto-navigate to clean URL on close).
- `src/components/global-add-transaction-button.tsx` — Client component for global transaction entry with lazy-loaded form data.
- `src/app/dashboard/quick-add-actions.ts` — Server action to fetch accounts/categories for the quick-add dialog.

UI pattern established:

- All create/edit/action forms now open in `FormDialog`, never inline.
- Forms are triggered by URL params (`?mode=create`, `?edit={id}`, `?pay={id}`).
- Cancel/close navigates to the clean URL, naturally dismissing the dialog.
- Pattern codified in `app-finanzas-ui-polish` skill for future form additions.

Database impact: none for Sprint 12.6.

### Sprint 12.7 — Critical Bug Fixes

Branch: `sprint/12-7-critical-bug-fixes`
Tag: `v0.12.7-critical-bug-fixes`

Fixed:

- `BF-020` — Transfer between non-base-currency accounts (COP→COP, base CAD) was storing `amount_base_currency = amount` instead of `amount × exchange_rate_to_base`, causing Total Assets to treat COP amounts as CAD. Both `create_transfer_transaction` and `update_transfer_transaction` RPCs now accept `p_exchange_rate_to_base`. TransactionForm shows auto-fetch FX field for transfers when accounts are non-base-currency.
- `BF-018` — Account field no longer resets when switching between Expense and Income. Switching to Transfer now pre-populates the From account with the currently selected account.
- `BF-011` — `GlobalAddTransactionButton` now refetches accounts and categories on every open instead of caching after first load, so newly created categories appear immediately.

Database impact: migration `20260604000100_transfer_exchange_rate.sql` — replaces `create_transfer_transaction` and `update_transfer_transaction` RPCs with versions that accept `p_exchange_rate_to_base numeric(18,8) default 1`.

## Current remaining open issues

After Sprints 12.4/12.5/12.6, next priorities (from 2026-06-04 alpha feedback):

| ID | Priority | Status | Next decision |
|---|---:|---|---|
| BF-020 | P0 | Fixed | [Sprint 12.7] Transfer FX rate bug. |
| BF-018 | P1 | Fixed | [Sprint 12.7] Account field preserved across type changes. |
| BF-011 | P1 | Fixed | [Sprint 12.7] GlobalAddTransactionButton refetches on every open. |
| BF-002 | P1 | Open | [BUG] Mobile opening balance field not accepting negative values by keyboard (input type/inputMode fix). |
| BF-012 | P2 | Open | Mobile menu should auto-collapse after navigation. |
| BF-013 | P2 | Open | Accounts view too expanded; needs compact rows that expand on tap. |
| BF-014 | P2 | Open | Transactions view too expanded; needs compact layout with category icons. |
| BF-015 | P2 | Open | Transaction rows should display category icons for visual scanning. |
| BF-016 | P2 | Open | Accounts card tap should navigate to filtered transactions view for that account (low-risk, high UX gain). |
| BF-017 | P3 | Open | Multi-select/dynamic transaction filters (nice-to-have if time allows). |
| BF-005 | P2 | Open | Decide warning/helper text vs blocking negative Cash balances. Do not auto-convert Cash to liability. |
| BF-008 | P3 | Open | Keep deferred unless daily logs show strong repeated friction. |

## Recommended next phase — Sprint 12.7+

Continue Alpha real usage with compactness and critical-bug fixes:

**Sprint 12.7 high-priority batch:**

1. Fix BF-011 (category/subcategory revalidation bug).
2. Fix BF-002 (mobile negative input).
3. Fix BF-012 (mobile menu auto-collapse).
4. Compact BF-013/014 (Accounts and Transactions views).
5. Add BF-015 (transaction category icons).

**Sprint 12.8+ (lower priority):**

6. Implement BF-016 (Accounts card tap → filtered transactions) if time allows.
7. Keep BF-017 (multi-select filters) deferred unless usage proves necessary.
8. Keep BF-005 and BF-008 deferred unless usage evidence justifies.

**Validation after Sprint 12.7:**

- 2-week extended Alpha usage with compactness fixes applied.
- Confirm balances still match AndroMoney/records.
- No new critical bugs surface.
- UX friction is reduced to acceptable levels.

Then move toward **Beta Readiness Planning (v0.13)**.

## Real data privacy notes

This sprint involves **real personal/family financial data**. Treat it accordingly:

- Do not commit real CSVs, exports, statements, balances, account numbers, or screenshots with real figures.
- Keep working CSVs and exports outside the repo or in a git-ignored scratch folder.
- Redact real amounts/account identifiers in logs.
- Use structural notes such as “checking balance off by one transaction” rather than real figures.

## Definition of done — Sprint 12 overall

- Real accounts created and opening balances set at the chosen cutoff date.
- At least one recent period imported or entered and reconciled.
- Real daily usage completed and logged.
- Bug/friction log populated and triaged.
- Prioritized fix list produced.
- No unresolved **Alpha blocker** left undocumented.

## Sprint Execution Workflow (for Sprint 12.7+)

### Phase 1: Discovery & Logging (Week-long usage)
1. Use App Finanzas normally with real data.
2. Log findings in `alpha-daily-usage-log.md` (quick informal notes).
3. Record: what worked, where friction appeared, unexpected behaviors.

### Phase 2: Triage & Classification
1. Review findings using `alpha-finding-triage-rules.md` (Type + Priority rules).
2. Formalize entries in `bug-friction-log.md` as BF-018, BF-019, etc.
   - Complete field guide: area, type, priority, steps to reproduce, impact, workaround.
3. Update `bug-friction-log.md` summary counts.

### Phase 3: Sprint Planning
1. Select issues from `bug-friction-log.md` by priority:
   - **P0/P1** → must do in this sprint.
   - **P2** → do if time allows.
   - **P3** → defer to later sprint.
2. Give me a sprint prompt with explicit list of BF-IDs to fix.
3. I execute: code changes, validation, commit/push/documentation.

### Phase 4: Post-Sprint Update
1. **`bug-friction-log.md`:** Mark fixed issues as `Status: Fixed` with sprint tag.
2. **`sprint-12-alpha-plan.md`:** Add new section (e.g., "### Sprint 12.7 — [Title]") with:
   - Branch / Tag created.
   - Issues fixed + short description.
   - Database impact (if any).
   - Key implementation notes.
   - Updated "Current remaining open issues" and "Recommended next phase".
3. **`reconciliation-checklist.md`:** Run post-sprint validation to confirm balances/numbers are still correct.
4. **Git:** commit (code + docs), push, keep clean for next sprint.

### Phase 5: Validation (2-week usage)
1. Use the app with fixes applied.
2. Validate numbers still match AndroMoney / records.
3. Log any new findings → goes back to Phase 1.

### When to move to Beta Planning (v0.13)
- All P0/P1 issues closed or explicitly deferred.
- P2 friction reduced to acceptable levels.
- 2+ weeks of usage with no new critical bugs.
- Numbers/balances consistently validate.

## Related documents

- [real-data-import-plan.md](./real-data-import-plan.md) — FX convention, import validation
- [reconciliation-checklist.md](./reconciliation-checklist.md) — post-sprint validation checklist
- [bug-friction-log.md](./bug-friction-log.md) — all findings, issue tracker
- [alpha-daily-usage-log.md](./alpha-daily-usage-log.md) — quick usage notes
- [alpha-finding-triage-rules.md](./alpha-finding-triage-rules.md) — how to classify findings
