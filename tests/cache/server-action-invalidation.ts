import ts from 'typescript'

// RUM-005: the client Router Cache keeps a visited page for
// `experimental.staleTimes` (next.config.ts). That is only safe because every
// write in the app goes through a Server Action that calls `revalidatePath`
// (or `revalidateTag`), which purges that cache. This module finds the
// exported Server Actions that write without doing so, so a test can fail the
// day one is added.

// A Supabase call that changes data. `.delete(` needs the `()` form so
// `URLSearchParams#delete(key)` never matches.
const TABLE_WRITE = /\.(insert|update|upsert)\(|\.delete\(\s*\)/
// RPCs that only read. Every other RPC is treated as a write.
const READ_RPC = /^(get_|search_|is_|list_|preview_|calculate_|compute_)/
// Starting or ending a session changes whose data every page shows.
const SESSION_CHANGE = /\.auth\.(signInWithPassword|signInWithOtp|signUp|signOut)\(/
const INVALIDATES = /\b(revalidatePath|revalidateTag|updateTag|refresh)\(/

export type ActionWriteReport = {
  name: string
  writes: string[]
  invalidates: boolean
}

function writesIn(text: string): string[] {
  const found: string[] = []
  const table = text.match(TABLE_WRITE)
  if (table) found.push(table[0])
  const session = text.match(SESSION_CHANGE)
  if (session) found.push(`auth:${session[1]}`)
  for (const m of text.matchAll(/\.rpc\(\s*['"`]([a-z0-9_]+)['"`]/g)) {
    if (!READ_RPC.test(m[1])) found.push(`rpc:${m[1]}`)
  }
  return found
}

/**
 * For each exported function of a `'use server'` module, whether it writes and
 * whether it invalidates — directly or through a helper in the same file that
 * does (e.g. `revalidateTagSurfaces()`). Writes through a helper in the same
 * file count as writes too.
 */
export function auditServerActions(source: string): ActionWriteReport[] {
  const file = ts.createSourceFile('actions.ts', source, ts.ScriptTarget.Latest, true)
  const bodies = new Map<string, string>()
  const exported: string[] = []

  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) && node.name && node.body) {
      bodies.set(node.name.text, node.body.getText(file))
      if (node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) {
        exported.push(node.name.text)
      }
    } else if (ts.isVariableStatement(node)) {
      const isExported = node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
      for (const decl of node.declarationList.declarations) {
        const init = decl.initializer
        if (
          ts.isIdentifier(decl.name) &&
          init &&
          (ts.isArrowFunction(init) || ts.isFunctionExpression(init))
        ) {
          bodies.set(decl.name.text, init.body.getText(file))
          if (isExported) exported.push(decl.name.text)
        }
      }
    }
  }
  file.statements.forEach(visit)

  // Resolve same-file helpers transitively (bounded: a helper chain is short).
  const memo = new Map<string, { writes: string[]; invalidates: boolean }>()
  const resolve = (name: string, seen: Set<string>): { writes: string[]; invalidates: boolean } => {
    const cached = memo.get(name)
    if (cached) return cached
    const body = bodies.get(name) ?? ''
    const result = { writes: writesIn(body), invalidates: INVALIDATES.test(body) }
    for (const [helper] of bodies) {
      if (helper === name || seen.has(helper)) continue
      if (!new RegExp(`\\b${helper}\\(`).test(body)) continue
      const inner = resolve(helper, new Set([...seen, name]))
      result.writes.push(...inner.writes)
      result.invalidates ||= inner.invalidates
    }
    memo.set(name, result)
    return result
  }

  return exported.map((name) => ({ name, ...resolve(name, new Set()) }))
}
