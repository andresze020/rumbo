import { describe, expect, it } from 'vitest'

import { asMember, fileDirectives, splitStatements } from './db-test.mjs'

/**
 * RUM-010b — the plumbing both SQL runners share. `db-test.mjs` (live project)
 * and `db-local.mjs` (fixtures) hand every chunk to the same splitter and the
 * same pass/fail rules, so a regression here would silently skip or misname
 * checks in both places at once.
 */

describe('splitStatements', () => {
  it('sends each check alone, so its own rows come back', () => {
    const chunks = splitStatements("select 'a' as check_name, true as passed;\nselect 'b' as check_name, false as passed;")
    expect(chunks).toHaveLength(2)
  })

  it('does not split inside a dollar-quoted do block', () => {
    const sql = "-- check: probe\ndo $$ begin perform 1; perform 2; end $$;\nselect 1;"
    const chunks = splitStatements(sql)
    expect(chunks).toHaveLength(2)
    expect(chunks[0]).toContain('perform 2; end $$;')
  })

  it('keeps a begin … rollback group together so its rollback still applies', () => {
    const chunks = splitStatements('begin; insert into t values (1); rollback;\nselect 1;')
    expect(chunks).toEqual(['begin; insert into t values (1); rollback;', 'select 1;'])
  })

  it('ignores semicolons in strings and comments', () => {
    const chunks = splitStatements("select 'a;b' as x; -- trailing; comment\nselect 2;")
    expect(chunks).toHaveLength(2)
  })
})

describe('fileDirectives', () => {
  it('reads the run-as directive a non-member file declares', () => {
    expect(fileDirectives('-- rumbo-test: run-as=non-member\nselect 1;')).toEqual({ 'run-as': 'non-member' })
  })

  it('returns nothing for an ordinary file', () => {
    expect(fileDirectives('-- just a comment\nselect 1;')).toEqual({})
  })
})

describe('asMember', () => {
  it('prefixes the chunk with the member role and JWT claims', () => {
    const sql = asMember('select 1;', '00000000-0000-4000-a000-0000000000a1')
    expect(sql).toContain('set local role authenticated;')
    expect(sql).toContain('"sub":"00000000-0000-4000-a000-0000000000a1"')
    expect(sql.endsWith('select 1;')).toBe(true)
  })

  it('leaves the chunk untouched without a user (runs as postgres)', () => {
    expect(asMember('select 1;', undefined)).toBe('select 1;')
  })
})
