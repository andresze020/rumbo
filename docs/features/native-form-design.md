# Native Form Design

## Status

**Implemented.**
No database schema changes required.

Gives every data-entry form in the app a single, native-app look: tall rounded
fields, icon-led selects, segmented controls, an amount calculator, and a
mobile bottom-sheet dialog. Presentation-only — no financial logic changed.

Shipped in two parts:
- **PR #17** — introduced the look on the add-transaction form (redesign,
  amount calculator, icon fixes) and merged to `main`.
- **PR #18** — extracted the reusable primitives and applied the same look to
  every other entry form.

---

## Context

The add-transaction form was redesigned to feel like a native mobile app rather
than a plain web form, and users liked it. The rest of the app's forms still
used the older compact style (32px fields, `rounded-lg`, bare native selects),
so the product felt inconsistent depending on which screen you were on.

The goal was to promote the transaction form's patterns into shared primitives
and roll them across every form, without a bespoke rewrite per screen.

---

## Architecture

Two shared modules are the single source of truth for the form look:

- `src/components/form-field.tsx` — client primitives:
  - `SelectField` — native `<select>` with a leading icon slot and a custom
    chevron. Pass `leading={null}` when the selected option text already starts
    with an emoji, so the glyph is not shown twice.
  - `DateField` — labelled date input with a calendar glyph.
  - `SegmentedField` — iOS-style segmented control backed by a hidden input
    (via `name`) so plain server-action forms keep working.
- `src/lib/form-styles.ts` — class constants (`nativeSelectCls`,
  `selectFieldCls`, `formActionsCls`, `formBtnCls`). Kept out of any
  `'use client'` module so server components can import them too.

Base components carry the look app-wide so most fields upgrade for free:

| Component | Change |
|---|---|
| `src/components/ui/input.tsx` | 44px height, `rounded-xl` |
| `src/components/ui/textarea.tsx` | `rounded-xl`, matching padding |
| `src/components/ui/select.tsx` | shadcn trigger height matched to 44px |
| `src/components/form-dialog.tsx` | bottom sheet + grab handle on mobile |
| `src/components/amount-input.tsx` | calculator keypad on by default |

The reference layout lives in
`src/app/dashboard/transactions/transaction-form.tsx`; it consumes the shared
primitives instead of its own local copies.

---

## Scope

Forms restyled to the native look:

- Accounts: create, edit, opening balance
- Categories: create / edit
- Budgets; Debts (create / edit / payment); Goals (create / edit + contribute /
  withdraw); Recurring (create + post)
- Transactions: edit, transfer edit, CSV import, quick-edit row
- Login, Onboarding

Form footers stack full-width 44px buttons on mobile and stay inline on
desktop. Dense inline controls (the bulk-categorize toolbar and the quick-edit
row) intentionally stay compact rather than adopting the tall style.

The amount calculator (`+ − × ÷` with precedence, results applied live) is now
present on every money field: budgets, debts, goals, recurring, opening
balance, and the debt planner, in addition to the transaction forms.

---

## Verification

```powershell
npm run lint
npx tsc --noEmit
npm run build
```

Manual UI smoke (check mobile ~360px and desktop):

1. Create and edit an account and a category — tall fields, bottom-sheet dialog
   on mobile, full-width buttons.
2. Register a debt payment and a budget line — the amount field shows the
   calculator toggle.
3. Create a goal and a recurring entry — selects use the new style.
4. Login and onboarding — 44px inputs and primary button.
5. Confirm account/category emojis render once (not doubled) in selects.
