import { describe, expect, it } from 'vitest'
import { cleanSupabaseActionError } from './errors'

const FALLBACK = 'Could not create the transfer. Please check the form and try again.'

describe('cleanSupabaseActionError', () => {
  it('rewords known RPC messages into UI text', () => {
    expect(
      cleanSupabaseActionError(
        'from_account_id and to_account_id must be different',
        FALLBACK
      )
    ).toBe('Choose two different accounts.')
    expect(cleanSupabaseActionError('ERROR:  to account is not active', FALLBACK)).toBe(
      'One of the accounts is archived or no longer exists.'
    )
  })

  it('passes people-facing RPC messages through unchanged', () => {
    expect(
      cleanSupabaseActionError('Pick a category for the transfer cost.', FALLBACK)
    ).toBe('Pick a category for the transfer cost.')
    expect(
      cleanSupabaseActionError(
        'This account uses a different currency. To move the transaction there, void it and record it again.',
        FALLBACK
      )
    ).toBe(
      'This account uses a different currency. To move the transaction there, void it and record it again.'
    )
  })

  it('hides messages that name a column or function', () => {
    expect(cleanSupabaseActionError('from_account_id is required', FALLBACK)).toBe(FALLBACK)
    expect(
      cleanSupabaseActionError(
        'Only transfer transactions can be edited with update_transfer_transaction.',
        FALLBACK
      )
    ).toBe(FALLBACK)
  })

  it('keeps hiding internal database errors', () => {
    expect(
      cleanSupabaseActionError('duplicate key value violates unique constraint', FALLBACK)
    ).toBe(FALLBACK)
    expect(cleanSupabaseActionError(undefined, FALLBACK)).toBe(FALLBACK)
  })
})
