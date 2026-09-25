import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

/**
 * RUM-010a — the JS/TS test runner for Rumbo.
 *
 * Deliberately small: unit tests over pure logic, no database, no browser.
 * The ledger invariants that need real rows stay in `supabase/tests/` and run
 * with `npm run db:test`; the two suites coexist and do not overlap.
 *
 * Conventions (also documented in AGENTS.md):
 *   - A unit test lives next to its subject as `<module>.test.ts`.
 *   - Fixtures live in `tests/fixtures/` and are plain TypeScript modules.
 *   - `@/…` resolves to `src/…`, exactly as in the app.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    // Node only: nothing under test touches the DOM yet. Adding a jsdom
    // project later is a config change, not a migration.
    environment: 'node',
    // scripts/ since RUM-010b: the SQL runners' parsing helpers are tested
    // next to the scripts that own them, like everything else.
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts', 'tests/**/*.test.ts'],
    // `supabase/tests/` is SQL run by `npm run db:test`, not Vitest.
    exclude: ['node_modules/**', '.next/**', 'supabase/**'],
    // Explicit `import { describe, it, expect } from 'vitest'` in every file,
    // so no ambient globals leak into the app's type surface.
    globals: false,
  },
})
