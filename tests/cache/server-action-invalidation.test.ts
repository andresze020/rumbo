import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import nextConfig from '../../next.config'
import { auditServerActions } from './server-action-invalidation'

const ROOT = join(__dirname, '..', '..')

function serverActionFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...serverActionFiles(path))
    else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith('.test.ts')) {
      if (/^\s*['"]use server['"]/.test(readFileSync(path, 'utf8'))) out.push(path)
    }
  }
  return out
}

describe('auditServerActions', () => {
  it('flags a write that never invalidates', () => {
    const [r] = auditServerActions(`
      export async function saveAction() {
        await supabase.from('budgets').insert({ a: 1 })
        redirect('/dashboard/budgets')
      }`)
    expect(r).toMatchObject({ name: 'saveAction', invalidates: false })
    expect(r.writes).toEqual(['.insert('])
  })

  it('accepts a write that revalidates, directly or through a same-file helper', () => {
    const reports = auditServerActions(`
      function revalidateSurfaces() { revalidatePath('/dashboard/tags') }
      export async function a() { await supabase.from('t').update({}).eq('id', 1); revalidatePath('/x') }
      export const b = async () => { await supabase.from('t').delete().eq('id', 1); revalidateSurfaces() }`)
    expect(reports.map((r) => [r.name, r.invalidates])).toEqual([
      ['a', true],
      ['b', true],
    ])
  })

  it('counts a write done inside a helper', () => {
    const [r] = auditServerActions(`
      async function persist() { await supabase.rpc('create_manual_transaction', {}) }
      export async function createAction() { await persist(); redirect('/x') }`)
    expect(r.writes).toEqual(['rpc:create_manual_transaction'])
    expect(r.invalidates).toBe(false)
  })

  it('does not mistake reads for writes', () => {
    const [r] = auditServerActions(`
      export async function readAction() {
        const params = new URLSearchParams(); params.delete('month')
        await supabase.rpc('get_account_balances', {})
        await supabase.rpc('search_household_transactions', {})
        return supabase.from('accounts').select('id')
      }`)
    expect(r.writes).toEqual([])
  })

  it('flags an exit after a committed write that skips the invalidation (Codex, PR #81)', () => {
    const [r] = auditServerActions(`
      async function advance() {
        const { error } = await supabase.from('recurring_transactions').update({}).eq('id', 1)
        if (error) redirect('/dashboard/recurring?posted=1&advance_warning=1')
        revalidateSurfaces()
        redirect('/dashboard/recurring?posted=1')
      }
      function revalidateSurfaces() { revalidatePath('/dashboard') }
      export async function postAction() {
        const { error } = await supabase.rpc('create_manual_transaction', {})
        if (error) redirectWithError('Could not post.')
        await advance()
      }`)
    expect(r.invalidates).toBe(true)
    expect(r.uninvalidatedExits).toEqual(["redirect('/dashboard/recurring?posted=1&advance_warning=1')"])
  })

  it("does not flag a write's own error check, nor an exit after an invalidation", () => {
    const [r] = auditServerActions(`
      function redirectWithError(m) { revalidatePath('/dashboard', 'layout'); redirect('/x?error=' + m) }
      export async function createAction() {
        if (!name) redirect('/x?error=name')
        const { error } = await supabase.from('a').insert({})
        if (error) redirect('/x?error=insert')
        const { error: e2 } = await supabase.rpc('set_transaction_tags', {})
        if (e2) redirectWithError('tags')
        revalidatePath('/x')
        redirect('/x?created=1')
      }`)
    expect(r.uninvalidatedExits).toEqual([])
  })

  it('treats starting or ending a session as a write', () => {
    const [r] = auditServerActions(`
      export async function signOutAction() { await supabase.auth.signOut(); redirect('/login') }`)
    expect(r.writes).toEqual(['auth:signOut'])
    expect(r.invalidates).toBe(false)
  })
})

describe('RUM-005 Router Cache safety', () => {
  const files = serverActionFiles(join(ROOT, 'src'))
  const reports = files.flatMap((file) =>
    auditServerActions(readFileSync(file, 'utf8')).map((r) => ({
      ...r,
      file: relative(ROOT, file),
    }))
  )
  const writers = reports.filter((r) => r.writes.length > 0)

  it('finds the server actions (the check is not vacuous)', () => {
    expect(files.length).toBeGreaterThanOrEqual(20)
    expect(writers.length).toBeGreaterThanOrEqual(60)
  })

  // The Router Cache (next.config.ts `staleTimes`) may show a page it already
  // rendered for up to 30 s. A write that does not call revalidatePath would
  // leave the tab that made it looking at the old figures for that long.
  it('every Server Action that writes, or changes the session, invalidates', () => {
    const missing = writers
      .filter((r) => !r.invalidates)
      .map((r) => `${r.file} · ${r.name} (${r.writes.join(', ')})`)
    expect(missing).toEqual([])
  })

  // Codex, PR #81: "calls revalidatePath somewhere" is not enough. Once a write
  // has committed, an error exit that skips the invalidation (the transaction
  // posted, then its tags failed) leaves that write invisible for up to 30 s.
  it('no exit after a committed write skips the invalidation', () => {
    const partial = writers
      .filter((r) => r.uninvalidatedExits.length > 0)
      .map((r) => `${r.file} · ${r.name}: ${r.uninvalidatedExits.join(' | ')}`)
    expect(partial).toEqual([])
  })

  it('the freshness window stays short', () => {
    // Raising it is a product decision (stale figures after another member's
    // change), not a tuning knob: see performance-ux-execution-status.md.
    expect(nextConfig.experimental?.staleTimes).toEqual({ dynamic: 30, static: 30 })
  })
})
