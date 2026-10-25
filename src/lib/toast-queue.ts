/**
 * The toast stack's one rule, kept pure so it is testable without a DOM.
 *
 * A run of "Save & Add Next" fires one "Transaction created." per save, each
 * on screen for five seconds. Saving every two or three seconds stacked them
 * three high over the bottom of a full-screen form that was already asking
 * for the next entry (seen in the 2026-10-14 recording). The same message
 * arriving again now refreshes the toast already showing it and counts the
 * repeats: still one confirmation per write, but one row on screen.
 *
 * A toast with an action (Undo) never merges, in either direction: each Undo
 * is bound to its own write, and folding two into one row would leave one of
 * them unreachable.
 */

export type QueuedToast<Action = unknown> = {
  id: number
  message: string
  action?: Action
  /** How many times this message arrived while it was showing. 1 = once. */
  count: number
}

export function pushToast<Action>(
  current: QueuedToast<Action>[],
  input: { message: string; action?: Action },
  id: number
): QueuedToast<Action>[] {
  if (!input.action) {
    const index = current.findIndex(
      (item) => !item.action && item.message === input.message
    )
    if (index !== -1) {
      const merged: QueuedToast<Action> = {
        id,
        message: input.message,
        count: current[index].count + 1,
      }
      // Moved to the end, where a new toast would have gone, so the stack's
      // order still reads oldest → newest.
      return [...current.slice(0, index), ...current.slice(index + 1), merged]
    }
  }
  return [...current, { ...input, id, count: 1 }]
}
