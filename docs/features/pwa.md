# PWA — Installable App

## Status
**Implemented — available from v0.19.0.**
No database changes required. No service worker (offline mode is out of scope for MVP).

---

## What this enables

App Finanzas can be installed on Android (Chrome), iOS (Safari), and desktop (Chrome/Edge) as a standalone app:

- Appears on the home screen / app drawer with the App Finanzas icon.
- Opens without browser chrome (no address bar, no tabs).
- Receives an entry in the OS task switcher.
- Uses the brand theme color for the status bar on Android.

---

## Requirements met

| Requirement | How |
|---|---|
| HTTPS | Provided by Vercel on all deployments |
| Web App Manifest | `/public/manifest.json` |
| At least one 192×192 icon | `/public/icons/icon-192.png` |
| At least one 512×512 icon | `/public/icons/icon-512.png` |
| Maskable icon (Android adaptive) | `/public/icons/icon-512-maskable.png` |
| Manifest linked in HTML | `metadata.manifest` in `src/app/layout.tsx` |
| App shortcuts | Quick add, Transactions and Recurring in `public/manifest.json` |
| Share Target | Shared text/URL opens the expense quick-add flow prefilled |

A service worker is **not required** for the install prompt on Android Chrome — only the manifest + icons + HTTPS are needed.

---

## Icon design

The icon shows three ascending bars with a trend line — a clean visual shorthand for "finance tracking". Designed to be recognizable at 192×192 and work well on all Android adaptive icon shapes (circle, squircle, rounded square).

| File | Size | Use |
|---|---|---|
| `public/icons/icon-192.png` | 192×192 | Android home screen (standard) |
| `public/icons/icon-512.png` | 512×512 | Android splash screen, high-DPI |
| `public/icons/icon-512-maskable.png` | 512×512 | Android adaptive icons — content is within the 60% safe zone |

**Colors:**
- Background: `#0f0f14` (dark, matches app's dark theme background)
- Bars / line: `#7c9cf5` (approximation of `oklch(0.748 0.177 261)`, the dark-mode primary)

**Regenerating icons:**
If the brand colors or design change, re-run:
```bash
node scripts/generate-icons.mjs
```
Source SVG is defined inline in `scripts/generate-icons.mjs`. Requires `sharp` (already a project dependency).

---

## Manifest (`/public/manifest.json`)

```json
{
  "name": "App Finanzas",
  "short_name": "Finanzas",
  "start_url": "/dashboard",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#0f0f14",
  "theme_color": "#0f0f14",
  "icons": [...]
}
```

`start_url: "/dashboard"` — users land directly on the dashboard, skipping the marketing root.

---

## How to install (Android)

1. Open the deployed URL in Chrome on Android.
2. Log in.
3. Tap the three-dot menu → **"Add to home screen"** (or Chrome may show an install banner automatically).
4. Confirm → the app icon appears on the home screen.

Chrome shows the install prompt automatically after the user visits the site a couple of times and the manifest passes validation.

---

## How to install (iOS)

1. Open the deployed URL in Safari.
2. Tap the Share button → **"Add to Home Screen"**.
3. Confirm.

Note: iOS uses Safari's own install flow and does not show an automatic install prompt. The `appleWebApp` metadata in `layout.tsx` enables standalone mode and hides the Safari chrome when launched from the home screen.

---

## What is NOT included

| Feature | Status |
|---|---|
| Service worker / offline mode | Not implemented — financial data requires a live connection and offline caching adds significant complexity |
| Push notifications | Not implemented (post-MVP) |
| Background sync | Not implemented (post-MVP) |

---

## Installed-app verification

The manifest implementation is complete, but BR-028 still requires a real
installed-PWA QA pass. This cannot be proven from a browser tab alone.

- Long-press/right-click the installed icon and open **Quick add**,
  **Transactions**, and **Recurring**.
- Share text and a URL from another app to **App Finanzas**.
- Confirm the installed app opens the expense quick-add dialog and preserves
  the shared title/text/URL without creating a transaction automatically.
- Repeat on the target mobile platform after any manifest change; installed
  manifests may be cached and can require reinstalling the PWA.

---

## Files changed

| File | Change |
|---|---|
| `public/manifest.json` | New — PWA manifest |
| `public/icons/icon-192.png` | New — generated icon |
| `public/icons/icon-512.png` | New — generated icon |
| `public/icons/icon-512-maskable.png` | New — generated maskable icon |
| `src/app/layout.tsx` | Added `manifest` and `appleWebApp` to metadata |
| `scripts/generate-icons.mjs` | New — icon generation script (dev only) |
