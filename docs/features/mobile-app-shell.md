# Mobile App Shell — Chrome That Does Not Move

## Status
**Implemented — 2026-08-29 (PR #61).** UI only, no database changes.

This doc exists because the decision it records is easy to undo by accident.
The dashboard's top bar and bottom nav are **deliberately not `position: fixed`**.
If you are about to make one of them `fixed` again, read this first.

---

## The rule

> The dashboard is a shell exactly one viewport tall that does not scroll. The
> top bar and the bottom nav are ordinary flex rows inside it. Only the middle
> row scrolls.

A bar that is not inside the scrolling box cannot be moved by the scrolling
box — on any engine, with nothing measured and nothing to keep in sync.

---

## Why, in one paragraph

`position: fixed` anchors to the **layout viewport**. On a phone, the layout
viewport is regularly not the box you can see: a collapsing browser toolbar, a
rubber-band overscroll and a pinch zoom each move the visual viewport and the
layout viewport by different amounts. So `fixed` chrome drifts. We tried to
correct for that from JavaScript — `ViewportPin` measured the gap between the
two viewports and translated the bars to close it — and every round of
correction was wrong in a new direction.

| Attempt | Symptom that followed |
|---|---|
| PR #48 → #53 | Bars sat **low**; the nav's labels fell off the bottom edge on Android |
| PR #55 → #57 | Bars **walked down** the screen mid-scroll on iOS |
| PR #59 | Bars **rode up** off the screen: the top bar gone entirely, the nav floating mid-screen with content running underneath |

Three failures in three different directions, from the same mechanism. Chasing
what an engine reports is the mistake, not any particular sign of the
correction. PR #61 stopped chasing.

---

## How it is built

`src/app/dashboard/layout.tsx`:

```
<div className="flex h-dvh overflow-hidden">        ← the shell, never scrolls
  <AppSidebar />                                    ← desktop only
  <div className="flex min-w-0 flex-1 flex-col">
    <MobileNav />                                   ← flex row, not fixed
    <main id={APP_SCROLL_ID}                        ← the ONLY scroller
          className="flex-1 overflow-y-auto overscroll-contain">
      …
    </main>
    <MobileBottomNav />                             ← flex row, not fixed
  </div>
</div>
```

- **`h-dvh`, not `h-vh`** — so the shell tracks a browser toolbar opening and
  closing instead of hanging a bar's height off the bottom.
- **`overscroll-contain`** on the scroller — a bounce at either end is not
  handed to the document behind it.
- **Content ends above the nav, not behind it.** The nav takes real space in
  flow now, so screens no longer need bottom padding to clear it.

---

## The consequence that bites: `window.scrollY` is dead

The document itself never scrolls. Anything that reads or resets scroll
position must go through **`src/lib/app-scroll.ts`** (`APP_SCROLL_ID`,
`getAppScroller()`), not `window`.

Two things were repointed in PR #61 and are the precedent for anything new:

| What | Would have broken as |
|---|---|
| The assistant FAB's hide-while-scrolling (`assistant-drawer.tsx`) | A `scroll` listener on `window` hears nothing; the FAB never moves |
| Reset to top on route change (`screen-transition.tsx`) | The router's scroll restoration drives the document, which no longer scrolls, so each screen inherits the previous one's position |

A third followed in PR #60: the install hint was a sibling *above* `main`, so
it started at y=0 and rendered under the top bar. Page content belongs
**inside** `main`.

---

## What `ViewportPin` still does

`ViewportPin` was not deleted — it was narrowed. It stays for the boxes that
really are `fixed` and really do need re-boxing onto the visual viewport under
pinch zoom:

| Utility | Applies to | Counter-scaled? |
|---|---|---|
| `.vv-pin-screen`, `.vv-pin-screen-center`, `.vv-pin-screen-edge` | Dialogs, alert dialogs, sheets, drawers | **No** — an overlay is content, a zoom should magnify it |
| `.vv-pin-corner` | The assistant and add-transaction FABs | Yes — furniture keeps its on-screen size |
| `.vv-pin-bottom` | The toast stack | Yes |

`.vv-pin-top` was removed in the same cleanup as this doc: after PR #61 it had
no consumers left, since the top bar is the one element it existed for.

---

## Pinch zoom stays enabled

Unchanged by any of this, and deliberate — see
[pending-work.md](../pending-work.md) §2. Disabling it would not work
consistently (iOS Safari has ignored `user-scalable=no` since iOS 10), it is a
WCAG 2.1 SC 1.4.4 failure, and on a screen full of dense figures the pinch is a
real reading aid.

---

## Verification

PR #61 was verified in headless Chromium against the real compiled Tailwind,
driving the class strings read out of the source: across the whole scroll
range, including the far end where the rubber band used to bite, the top bar
holds 0..56 and the nav holds 635..700 flush with the viewport bottom, while
the scroller moves 0 → 2445. The document reports as not scrollable at all and
`window.scrollY` stays 0 throughout — the property that makes this immune
rather than merely corrected.

**Still owed:** none of this has been through a pass on a real iPhone. The
device report that started the saga was an iPhone, and the fix is verified only
in headless Chromium. See [pending-work.md](../pending-work.md) §4.

---

## Related

- `src/lib/app-scroll.ts` — the scroll container module
- `src/components/viewport-pin.tsx` — what remains of the measured approach
- `src/app/globals.css` — the `.vv-pin-*` utilities
- [pwa.md](./pwa.md) — installed-app behaviour
