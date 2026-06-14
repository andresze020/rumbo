# React Hooks Lint Cleanup

## Status

**Implemented.**
No database schema changes required.

BR-005 clears the React hooks lint failures reported by `npm run lint` without
changing user-facing behavior.

---

## Context

The project had React lint failures from `react-hooks/set-state-in-effect` and
one hook immutability warning where an effect referenced a function before its
declaration.

Those failures did not block `next build`, but they made a separate lint CI gate
red and pointed to avoidable render cascades.

---

## Changes

The cleanup keeps existing behavior and limits edits to the lint offenders:

- Theme and appearance controls no longer need a manual `mounted` state.
- Sidebar, mobile nav, onboarding checklist, install hint, chart color reads, and
  transaction-dialog URL cleanup now defer state updates from effects.
- Transaction form localStorage defaults and frequent-category chips still work,
  but their state updates are scheduled after the effect tick.
- Transfer edit auto-fetch keeps the same FX behavior, with the helper declared
  before the effect that uses it.

---

## Verification

Run:

```powershell
npm run lint
npx tsc --noEmit
npm run build
```

Manual UI smoke:

1. Toggle theme from the sidebar and settings page.
2. Collapse and expand the desktop sidebar.
3. Open and close mobile navigation.
4. Use Save and Add Next from the transaction dialog.
5. Edit a non-base transfer and confirm the FX auto-fetch section still works.
