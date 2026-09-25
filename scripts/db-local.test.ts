import { describe, expect, it } from 'vitest'

import { parseCsv } from './db-local.mjs'

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
