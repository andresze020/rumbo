import { describe, expect, it } from 'vitest'
import { pushToast, type QueuedToast } from './toast-queue'

type Action = { label: string }

describe('pushToast', () => {
  it('appends a new message', () => {
    const next = pushToast<Action>([], { message: 'Transaction created.' }, 1)
    expect(next).toEqual([{ id: 1, message: 'Transaction created.', count: 1 }])
  })

  it('merges a repeated message into one row, counts it and takes the new id', () => {
    let stack: QueuedToast<Action>[] = []
    stack = pushToast(stack, { message: 'Transaction created.' }, 1)
    stack = pushToast(stack, { message: 'Transaction created.' }, 2)
    stack = pushToast(stack, { message: 'Transaction created.' }, 3)
    expect(stack).toEqual([{ id: 3, message: 'Transaction created.', count: 3 }])
  })

  it('moves the merged toast to the end so the stack stays oldest → newest', () => {
    let stack: QueuedToast<Action>[] = []
    stack = pushToast(stack, { message: 'A' }, 1)
    stack = pushToast(stack, { message: 'B' }, 2)
    stack = pushToast(stack, { message: 'A' }, 3)
    expect(stack.map((t) => [t.message, t.count])).toEqual([
      ['B', 1],
      ['A', 2],
    ])
  })

  it('never merges a toast that carries an action', () => {
    let stack: QueuedToast<Action>[] = []
    stack = pushToast(stack, { message: 'Voided.', action: { label: 'Undo' } }, 1)
    stack = pushToast(stack, { message: 'Voided.', action: { label: 'Undo' } }, 2)
    expect(stack).toHaveLength(2)
  })

  it('does not fold a plain toast into one with an action, or the reverse', () => {
    let stack: QueuedToast<Action>[] = []
    stack = pushToast(stack, { message: 'Voided.', action: { label: 'Undo' } }, 1)
    stack = pushToast(stack, { message: 'Voided.' }, 2)
    expect(stack).toHaveLength(2)
    stack = pushToast(stack, { message: 'Voided.', action: { label: 'Undo' } }, 3)
    expect(stack).toHaveLength(3)
  })
})
