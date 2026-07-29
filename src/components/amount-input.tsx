'use client'

import { useRef, useState } from 'react'
import { Calculator, Delete } from 'lucide-react'
import { Input } from '@/components/ui/input'
import {
  evaluateAmountExpression,
  hasPendingOperation,
  roundToCents,
  trimIncompleteExpression,
} from '@/lib/calc'
import {
  formatAmountForDisplay,
  getCurrencySymbol,
  sanitizeAmountInput,
} from '@/lib/format'
import { cn } from '@/lib/utils'

type AmountInputProps = {
  /** Form field name for the raw (unformatted) numeric value submitted with the form. */
  name: string
  /** Currency whose symbol is shown as a prefix (e.g. the budget's currency). */
  currencyCode: string
  id?: string
  /** Raw initial value (e.g. "150.00"); shown formatted with thousands/decimal separators. Ignored when `value` is provided. */
  defaultValue?: string
  /** Controlled raw value. Pair with `onValueChange` when the parent needs the amount (e.g. FX conversion previews). */
  value?: string
  /** Called with the sanitized raw numeric string on every change (controlled mode). */
  onValueChange?: (raw: string) => void
  /** Fired when the user presses Enter — for "next field" chaining, never submit. */
  onCommit?: () => void
  placeholder?: string
  required?: boolean
  /** Calculator toggle inside the field; the keypad applies results live to the amount. On by default for all money fields. */
  withCalculator?: boolean
  /** "lg" renders the hero variant used at the top of the transaction form. */
  size?: 'default' | 'lg'
  className?: string
}

const OPERATOR_KEYS = ['÷', '×', '−', '+'] as const
type KeypadKey = string

/**
 * Currency-aware amount field: prefixes the currency symbol and groups
 * thousands while typing, so amounts read as money (e.g. "$1,500.00") rather
 * than a bare integer. The visible input carries the `required` validation;
 * a hidden input submits the sanitized numeric string under `name`.
 *
 * With `withCalculator`, a keypad unfolds under the field. Results are applied
 * to the amount live on every keystroke, so a forgotten "=" can never submit a
 * stale amount.
 */
export function AmountInput({
  name,
  currencyCode,
  id,
  defaultValue = '',
  value,
  onValueChange,
  onCommit,
  placeholder = '0.00',
  required,
  withCalculator = true,
  size = 'default',
  className,
}: AmountInputProps) {
  const [internalRaw, setInternalRaw] = useState(() => sanitizeAmountInput(defaultValue))
  const raw = value !== undefined ? sanitizeAmountInput(value) : internalRaw
  const symbol = getCurrencySymbol(currencyCode)
  const inputRef = useRef<HTMLInputElement>(null)

  const [calcOpen, setCalcOpen] = useState(false)
  const [expression, setExpression] = useState('')

  const isLarge = size === 'lg'

  function commitRaw(nextRaw: string) {
    if (value === undefined) setInternalRaw(nextRaw)
    onValueChange?.(nextRaw)
  }

  function handleTyped(next: string) {
    const sanitized = sanitizeAmountInput(next)
    commitRaw(sanitized)
    // Typing directly while the keypad is open restarts the expression from
    // the typed value so the two stay consistent.
    if (calcOpen) setExpression(sanitized)
  }

  function applyExpression(nextExpression: string) {
    setExpression(nextExpression)
    if (!nextExpression) {
      commitRaw('')
      return
    }
    const result = evaluateAmountExpression(trimIncompleteExpression(nextExpression))
    if (result !== null) commitRaw(String(roundToCents(result)))
  }

  function toggleCalculator() {
    setCalcOpen((open) => {
      const next = !open
      if (next) {
        setExpression(raw)
        // Hide the OS keyboard on mobile so it doesn't stack under the keypad.
        inputRef.current?.blur()
      }
      return next
    })
  }

  function pressKey(key: KeypadKey) {
    if (key === 'C') {
      applyExpression('')
      return
    }
    if (key === '⌫') {
      applyExpression(expression.slice(0, -1))
      return
    }
    if ((OPERATOR_KEYS as readonly string[]).includes(key)) {
      if (!expression) {
        if (key === '−') applyExpression('−')
        return
      }
      const last = expression.at(-1)!
      if ((OPERATOR_KEYS as readonly string[]).includes(last)) {
        applyExpression(expression.slice(0, -1) + key)
      } else {
        applyExpression(expression + key)
      }
      return
    }
    if (key === '.') {
      const currentNumber = expression.split(/[÷×−+]/).pop() ?? ''
      if (currentNumber.includes('.')) return
      applyExpression(expression + (currentNumber === '' ? '0.' : '.'))
      return
    }
    applyExpression(expression + key)
  }

  const previewResult = calcOpen
    ? evaluateAmountExpression(trimIncompleteExpression(expression))
    : null
  const showPreview = calcOpen && hasPendingOperation(expression) && previewResult !== null

  return (
    <div className={className}>
      <div className="relative">
        <span
          className={cn(
            'pointer-events-none absolute top-1/2 -translate-y-1/2 text-muted-foreground',
            isLarge ? 'left-3.5 text-lg font-medium' : 'left-3 text-sm'
          )}
        >
          {symbol}
        </span>
        <Input
          ref={inputRef}
          id={id}
          type="text"
          inputMode="decimal"
          placeholder={placeholder}
          value={formatAmountForDisplay(raw)}
          onChange={(e) => handleTyped(e.target.value)}
          // Enter means "done with the amount" — the form is never submitted
          // from here, so callers can use it to jump to the next field instead.
          onKeyDown={
            onCommit
              ? (event) => {
                  if (event.key !== 'Enter') return
                  event.preventDefault()
                  event.currentTarget.blur()
                  onCommit()
                }
              : undefined
          }
          enterKeyHint={onCommit ? 'next' : undefined}
          className={cn(
            isLarge
              ? 'h-14 rounded-xl pl-9 text-2xl font-semibold tracking-tight'
              : 'pl-7',
            withCalculator && (isLarge ? 'pr-12' : 'pr-9')
          )}
          required={required}
        />
        {withCalculator ? (
          <button
            type="button"
            onClick={toggleCalculator}
            aria-label="Calculator"
            aria-expanded={calcOpen}
            className={cn(
              'absolute top-1/2 -translate-y-1/2 rounded-lg p-1.5 transition-colors',
              isLarge ? 'right-2.5' : 'right-1.5',
              calcOpen
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            <Calculator className={isLarge ? 'size-5' : 'size-4'} aria-hidden="true" />
          </button>
        ) : null}
      </div>
      <input type="hidden" name={name} value={raw} />

      {withCalculator && calcOpen ? (
        <div className="mt-2 rounded-xl border bg-card p-2 shadow-sm">
          <div className="flex min-h-8 items-center justify-end gap-2 px-2 pb-1.5">
            <span
              className={cn(
                'truncate font-mono text-sm tabular-nums',
                expression ? 'text-foreground' : 'text-muted-foreground'
              )}
            >
              {expression || '0'}
            </span>
            {showPreview ? (
              <span className="shrink-0 font-mono text-sm font-semibold tabular-nums text-primary">
                = {formatAmountForDisplay(String(roundToCents(previewResult!)))}
              </span>
            ) : null}
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {(
              [
                'C', '÷', '×', '⌫',
                '7', '8', '9', '−',
                '4', '5', '6', '+',
                '1', '2', '3', '=',
                '0', '.',
              ] as const
            ).map((key) => {
              const isOperator = (OPERATOR_KEYS as readonly string[]).includes(key)
              const isAction = key === 'C' || key === '⌫'
              const isEquals = key === '='
              return (
                <button
                  key={key}
                  type="button"
                  tabIndex={-1}
                  onClick={() => (isEquals ? setCalcOpen(false) : pressKey(key))}
                  aria-label={
                    key === '⌫' ? 'Backspace' : key === 'C' ? 'Clear' : key === '=' ? 'Done' : key
                  }
                  className={cn(
                    'flex h-11 items-center justify-center rounded-lg text-base font-medium transition-colors active:scale-95',
                    isEquals
                      ? 'row-span-2 bg-primary text-primary-foreground hover:bg-primary/90'
                      : isOperator
                      ? 'bg-primary/10 text-primary hover:bg-primary/15'
                      : isAction
                      ? 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground'
                      : 'bg-muted/50 text-foreground hover:bg-muted',
                    key === '0' && 'col-span-2'
                  )}
                >
                  {key === '⌫' ? <Delete className="size-4.5" aria-hidden="true" /> : key}
                </button>
              )
            })}
          </div>
        </div>
      ) : null}
    </div>
  )
}
