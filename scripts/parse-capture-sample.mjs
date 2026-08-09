// Dev-only sandbox for the tap-capture Phase 0 spike.
//
// Paste the raw text of a wallet / bank notification and this prints what a
// parser could actually extract from it: amount, currency, merchant and card
// last-four. The point of the spike is to find out whether the notifications
// your phone and bank emit are machine-readable *before* committing to the
// ingest work, so this deliberately does no network calls and touches nothing
// in the app.
//
// Usage:
//   node scripts/parse-capture-sample.mjs --demo
//   node scripts/parse-capture-sample.mjs --text "Compra por $12.500 en HELADERIA X"
//   pbpaste | node scripts/parse-capture-sample.mjs
//
// See docs/alpha/tap-capture-phase-0-spike.md.

import fs from 'node:fs'

const CURRENCY_CODES = ['COP', 'USD', 'CAD', 'EUR', 'MXN', 'ARS', 'CLP', 'PEN', 'BRL', 'GBP']

const SYMBOL_TO_CODE = {
  '€': 'EUR',
  '£': 'GBP',
  // '$' is deliberately absent: it is ambiguous across COP/USD/CAD/MXN/ARS/CLP
  // and guessing it is exactly the kind of silent error that produces a wrong
  // number in the ledger.
}

/**
 * Turn a localized amount string into a number.
 *
 * The hard case is `12.500`, which is twelve thousand five hundred in Colombia
 * and twelve and a half in the US. When a single separator is followed by
 * exactly three digits there is no way to tell from the string alone, so this
 * reports the ambiguity instead of silently picking one.
 */
function normalizeAmount(raw) {
  const cleaned = raw.replace(/\s/g, '')
  const lastDot = cleaned.lastIndexOf('.')
  const lastComma = cleaned.lastIndexOf(',')

  if (lastDot === -1 && lastComma === -1) {
    return { value: Number(cleaned), ambiguous: false, note: 'no separators' }
  }

  // Both present: the rightmost one is the decimal separator.
  if (lastDot !== -1 && lastComma !== -1) {
    const decimalSep = lastDot > lastComma ? '.' : ','
    const groupSep = decimalSep === '.' ? ',' : '.'
    const value = Number(
      cleaned.split(groupSep).join('').replace(decimalSep, '.'),
    )
    return {
      value,
      ambiguous: false,
      note: `decimal separator "${decimalSep}", group separator "${groupSep}"`,
    }
  }

  const sep = lastDot !== -1 ? '.' : ','
  const index = lastDot !== -1 ? lastDot : lastComma
  const decimals = cleaned.length - index - 1
  const occurrences = cleaned.split(sep).length - 1

  // More than one of the same separator can only be grouping: 1.234.567
  if (occurrences > 1) {
    return {
      value: Number(cleaned.split(sep).join('')),
      ambiguous: false,
      note: `repeated "${sep}" is a group separator`,
    }
  }

  if (decimals === 3) {
    return {
      value: Number(cleaned.split(sep).join('')),
      ambiguous: true,
      note: `"${sep}" followed by exactly 3 digits is ambiguous — read as a group separator (${cleaned} → ${cleaned.split(sep).join('')}), but it could be decimals. Resolve with the currency, not the string.`,
    }
  }

  if (decimals === 1 || decimals === 2) {
    return {
      value: Number(cleaned.replace(sep, '.')),
      ambiguous: false,
      note: `"${sep}" followed by ${decimals} digit(s) is a decimal separator`,
    }
  }

  return {
    value: Number(cleaned.split(sep).join('')),
    ambiguous: true,
    note: `unusual grouping (${decimals} digits after "${sep}")`,
  }
}

function extractCurrency(text) {
  const code = CURRENCY_CODES.find((c) =>
    new RegExp(`\\b${c}\\b`, 'i').test(text),
  )
  if (code) return { currency: code, via: 'ISO code in the text' }

  for (const [symbol, mapped] of Object.entries(SYMBOL_TO_CODE)) {
    if (text.includes(symbol)) return { currency: mapped, via: `symbol ${symbol}` }
  }

  if (text.includes('$')) {
    return {
      currency: null,
      via: '"$" found but it is ambiguous — the sender must state the ISO code, or the account must fix it',
    }
  }

  return { currency: null, via: 'no currency marker found' }
}

function extractAmount(text) {
  // Amount adjacent to a currency marker, in either order.
  const patterns = [
    /(?:[$€£]|\b(?:COP|USD|CAD|EUR|MXN|ARS|CLP|PEN|BRL|GBP)\b)\s*([0-9][0-9.,]*)/i,
    /([0-9][0-9.,]*)\s*(?:[$€£]|\b(?:COP|USD|CAD|EUR|MXN|ARS|CLP|PEN|BRL|GBP)\b)/i,
    // Last resort: a bare number with a separator, e.g. "por 12.500"
    /\b([0-9]{1,3}(?:[.,][0-9]{3})+(?:[.,][0-9]{1,2})?)\b/,
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) {
      const normalized = normalizeAmount(match[1])
      if (Number.isFinite(normalized.value) && normalized.value > 0) {
        return { raw: match[1], ...normalized }
      }
    }
  }

  return null
}

function extractLastFour(text) {
  const patterns = [
    /(?:termina(?:da|do)?\s+en|ending\s+in|final)\s*[:#]?\s*(\d{4})\b/i,
    /(?:[*•·xX]{2,}|\*)\s*(\d{4})\b/,
    /\b(?:t\.?c\.?|tarjeta|card)\s*[*•#]*\s*(\d{4})\b/i,
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) return match[1]
  }

  return null
}

// Words that mark the end of a merchant descriptor. Without these the greedy
// character class swallows the rest of the sentence ("HELADERIA X con tu
// tarjeta terminada en...").
const MERCHANT_STOP_WORDS = [
  'con', 'usando', 'por', 'el dia', 'el día', 'fecha', 'hora',
  'with', 'using', 'via', 'on',
  't.c', 'tc', 'tarjeta', 'card', 'visa', 'mastercard', 'amex',
  'apple pay', 'google pay', 'saldo', 'balance',
]

function trimMerchant(value) {
  let cut = value
  for (const stop of MERCHANT_STOP_WORDS) {
    const match = cut.match(new RegExp(`\\s${stop.replace(/\./g, '\\.')}\\b`, 'i'))
    if (match && match.index !== undefined) {
      cut = cut.slice(0, match.index)
    }
  }
  return cut.trim().replace(/[.,;:\-\s]+$/, '')
}

function extractMerchant(text) {
  // Labeled forms first — these are the reliable ones.
  const patterns = [
    { re: /\ben\s+(?:el\s+comercio\s+)?([A-Za-z0-9ÁÉÍÓÚÑáéíóúñ&'’.\- ]{3,40})/, label: 'after "en"' },
    { re: /\bat\s+([A-Za-z0-9&'’.\- ]{3,40})/i, label: 'after "at"' },
    { re: /\b(?:comercio|merchant|establecimiento)\s*[:=]\s*([^\n,;]{3,40})/i, label: 'labeled field' },
  ]

  for (const { re, label } of patterns) {
    const match = text.match(re)
    if (match) {
      const value = trimMerchant(match[1])
      if (value) return { merchant: value, via: label }
    }
  }

  // Fallback: the longest all-caps run. Bank notifications overwhelmingly
  // render the merchant descriptor in caps.
  const capsRuns = text.match(/\b[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ0-9&'’.\- ]{3,40}\b/g)
  if (capsRuns) {
    const best = capsRuns
      .map((run) => run.trim())
      .filter((run) => !CURRENCY_CODES.includes(run))
      .sort((a, b) => b.length - a.length)[0]
    if (best) return { merchant: best, via: 'longest all-caps run (weak)' }
  }

  return { merchant: null, via: 'not found' }
}

function parse(text) {
  const amount = extractAmount(text)
  const { currency, via: currencyVia } = extractCurrency(text)
  const { merchant, via: merchantVia } = extractMerchant(text)
  const lastFour = extractLastFour(text)

  return { amount, currency, currencyVia, merchant, merchantVia, lastFour }
}

function verdict(result) {
  if (!result.amount) return { ok: false, text: 'UNUSABLE — no amount found' }
  if (!result.merchant) {
    return { ok: false, text: 'PARTIAL — amount only, no merchant to categorize on' }
  }
  if (result.amount.ambiguous) {
    return { ok: false, text: 'PARTIAL — amount is ambiguous, needs the currency to disambiguate' }
  }
  if (!result.currency) {
    return { ok: true, text: 'USABLE — but currency must come from the account, not the text' }
  }
  return { ok: true, text: 'USABLE — amount, currency and merchant all extracted' }
}

function report(text) {
  const result = parse(text)
  const v = verdict(result)

  console.log('─'.repeat(68))
  console.log(text.trim())
  console.log('─'.repeat(68))
  console.log(`  amount     : ${result.amount ? result.amount.value : '(none)'}${result.amount ? `   [raw "${result.amount.raw}" — ${result.amount.note}]` : ''}`)
  console.log(`  currency   : ${result.currency ?? '(none)'}   [${result.currencyVia}]`)
  console.log(`  merchant   : ${result.merchant ?? '(none)'}   [${result.merchantVia}]`)
  console.log(`  last_four  : ${result.lastFour ?? '(none)'}`)
  console.log(`  verdict    : ${v.ok ? '✅' : '⚠️ '} ${v.text}`)
  if (result.amount?.ambiguous) {
    console.log(`  ⚠️  ${result.amount.note}`)
  }
  console.log()

  return v.ok
}

// Synthetic samples only — never commit a real notification, it carries real
// amounts and card digits (see the privacy rule in docs/).
const DEMO_SAMPLES = [
  'Compra por $12.500 en HELADERIA LA ESQUINA con tu tarjeta terminada en 4821',
  'Bancolombia: Compra por COP 12.500,00 en HELADERIA LA ESQUINA T.C. *4821',
  'You paid $3.50 at Sweet Scoop Creamery with Apple Pay',
  'Google Pay\nSWEET SCOOP CREAMERY\n$3.50\nVisa ••••4821',
  'Transaccion aprobada USD 3,50 comercio: SWEET SCOOP',
  'Su tarjeta fue usada. Monto 45.000. Establecimiento: SUPERMERCADO CENTRAL',
]

function main() {
  const args = process.argv.slice(2)

  if (args.includes('--demo')) {
    console.log('\nSynthetic samples (not real transactions):\n')
    let usable = 0
    for (const sample of DEMO_SAMPLES) {
      if (report(sample)) usable += 1
    }
    console.log(`${usable}/${DEMO_SAMPLES.length} samples parsed cleanly.\n`)
    return
  }

  const textIndex = args.indexOf('--text')
  if (textIndex !== -1 && args[textIndex + 1]) {
    report(args[textIndex + 1])
    return
  }

  const stdin = process.stdin.isTTY ? '' : fs.readFileSync(0, 'utf8')
  if (stdin.trim()) {
    report(stdin)
    return
  }

  console.log(`
Tap-capture parse sandbox — Phase 0.

  node scripts/parse-capture-sample.mjs --demo
  node scripts/parse-capture-sample.mjs --text "<notification text>"
  pbpaste | node scripts/parse-capture-sample.mjs

Paste the raw text of a wallet or bank notification to see whether a parser
can extract amount, currency, merchant and card last-four from it.
`)
}

main()
