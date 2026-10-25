// `npm run e2e:entry`: the entry dialog's browser scenarios, end to end.
//
// Starts the Supabase stand-in (mock-supabase.mjs) and the built app
// (`next start` with RUMBO_E2E=1, which enables the /e2e/entry harness page),
// runs entry.e2e.mjs against them, then stops both. Exits with the scenarios'
// status.
//
// The app must be built first, pointed at the stand-in:
//   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
//   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=e2e npm run build
// (NEXT_PUBLIC_* values are baked in at build time.) See docs/testing.md.

import { spawn } from 'node:child_process'
import fs from 'node:fs'

const APP_PORT = Number(process.env.E2E_PORT ?? 3110)
const MOCK_PORT = 54321
const LOG = 'e2e/entry/.mock-supabase.log'

fs.writeFileSync(LOG, '')

const children = []
function start(command, args, env) {
  // Detached, so each child leads its own process group: `npx next start`
  // forks the real server, and killing only npx left it holding the port.
  const child = spawn(command, args, {
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  })
  let output = ''
  child.stdout.on('data', (chunk) => (output += chunk))
  child.stderr.on('data', (chunk) => (output += chunk))
  child.output = () => output
  children.push(child)
  return child
}
function stopAll() {
  for (const child of children) {
    try {
      process.kill(-child.pid, 'SIGTERM')
    } catch {
      // already gone
    }
  }
}
process.on('exit', stopAll)

async function waitFor(url, label, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.status < 500) return
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`${label} did not start on ${url}`)
}

start('node', ['e2e/entry/mock-supabase.mjs'], { PORT: String(MOCK_PORT), LOG })
const app = start('npx', ['next', 'start', '-p', String(APP_PORT)], { RUMBO_E2E: '1' })

try {
  await waitFor(`http://127.0.0.1:${MOCK_PORT}/auth/v1/user`, 'The Supabase stand-in')
  await waitFor(`http://localhost:${APP_PORT}/login`, 'The app')
} catch (error) {
  console.error(String(error.message ?? error))
  console.error(app.output().slice(-2000))
  stopAll()
  process.exit(1)
}

const scenarios = spawn('node', ['e2e/entry/entry.e2e.mjs', `http://localhost:${APP_PORT}`], {
  env: { ...process.env, LOG },
  stdio: 'inherit',
})
scenarios.on('exit', (code) => {
  stopAll()
  process.exit(code ?? 1)
})
