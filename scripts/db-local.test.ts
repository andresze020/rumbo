import { describe, expect, it } from 'vitest'

import { coMemberRuns, parseCsv } from './db-local.mjs'

/** RUM-010b — how db-local.mjs reads psql --csv output back into check rows. */

describe('parseCsv (psql --csv output)', () => {
  it('maps rows to header keys', () => {
    expect(parseCsv('check_name,passed\nfoo,t\nbar,f\n')).toEqual([
      { check_name: 'foo', passed: 't' },
      { check_name: 'bar', passed: 'f' },
    ])
  })

  it('handles quoted fields with commas, quotes and newlines', () => {
    expect(parseCsv('check_name,passed\n"a, ""b""\nc",t\n')).toEqual([{ check_name: 'a, "b"\nc', passed: 't' }])
  })

  it('returns no rows for empty output (a do block)', () => {
    expect(parseCsv('')).toEqual([])
  })
})

/** HH-0 — a run-as=co-member file runs once from each member's side. */
describe('coMemberRuns', () => {
  it('runs as A2 about A1, then as A1 about A2', () => {
    expect(coMemberRuns(['a1', 'a2'])).toEqual([
      { runAs: 'a2', subject: 'a1' },
      { runAs: 'a1', subject: 'a2' },
    ])
  })

  it('gives a one-member household no run at all', () => {
    expect(coMemberRuns(['b1'])).toEqual([])
    expect(coMemberRuns([])).toEqual([])
  })
})
