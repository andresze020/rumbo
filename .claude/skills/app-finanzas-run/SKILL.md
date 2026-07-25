---
description: Use when asked to run, start, launch, or open the App Finanzas dev server locally. Starts the Next.js dev server and opens localhost:3000 in the browser.
---

# App Finanzas — Run Dev Server

## Steps

1. From the repo root (`C:\Users\Andres\Documents\Projects\app-finanzas`), start the dev server in the background:

```bash
npm run dev &
```

2. Wait ~8 seconds, then verify it's up:

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
```

Expected: `307` (redirect to `/login`) or `200`. Any 3xx/2xx means the server is live.

3. Open in the default browser (Windows):

```bash
start http://localhost:3000
```

## Notes

- The app redirects unauthenticated users to `/login` — a 307 response is normal and means the server is healthy.
- Port is always `3000` (Next.js default; no custom port set in this project).
- The dev server uses hot reload — no restart needed when editing files.
- If port 3000 is already in use, Next.js will automatically try 3001, 3002, etc. — check terminal output for the actual port.
- `.env.local` must be present with Supabase keys for auth and data to work. It is gitignored and lives only on this machine.
