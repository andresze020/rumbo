// ============================================================
// App Finanzas — andromoney-parse.mjs
// Pure (no network, no Supabase) parsing + planning for an AndroMoney CSV
// export. Consumed by scripts/andromoney-import.mjs; kept separate so the
// decoding and classification rules can be reasoned about — and eyeballed
// against a real export — without touching the database.
//
// AndroMoney's "Windows Excel" export is a 2-header-line CSV:
//   line 1: "Windows Excel","AndroMoney","<yyyymmdd>"
//   line 2: the real column header
// Columns: Id, Currency, Amount, Category, Sub-Category, Date,
//          Expense(Transfer Out), Income(Transfer In), Note, Periodic,
//          Project, Payee/Payer, uid, Time
//
// Row shapes (this is AndroMoney's whole data model):
//   * Category = SYSTEM / INIT_AMOUNT  → an account's initial balance; the
//     account name sits in Income(Transfer In) and Date is the sentinel
//     10100101.
//   * Expense(Transfer Out) set, Income(Transfer In) empty → expense.
//   * Income(Transfer In) set, Expense(Transfer Out) empty → income.
//   * BOTH set → transfer (Category is always "Transfer" in practice).
// ============================================================

// AndroMoney writes the export in a Big5-ish encoding: any character it cannot
// represent becomes a literal "?", and a comma inside a note is written as the
// Big5 full-width comma (bytes A1 41), which decodes to "¡A" under latin-1.
const BIG5_FULLWIDTH_COMMA = '¡A'

// The "?" above are lossy — the original letter is gone. These are the words
// that actually appear in the export, restored by hand. Extend through the map
// file's `textFixes` rather than editing this list.
export const DEFAULT_TEXT_FIXES = {
  'Mar?a': 'María',
  'n?mina': 'nómina',
  'Andr?s': 'Andrés',
  'Membres?as': 'Membresías',
  'membres?a': 'membresía',
  'cumplea?os': 'cumpleaños',
  'g?ants': 'géants',
  'Pr?stamos': 'Préstamos',
  'Pr?stamo': 'Préstamo',
  'pr?stamo': 'préstamo',
  'pr?stamos': 'préstamos',
  'mam?': 'mamá',
  'do?a': 'doña',
  'Do?a': 'Doña',
  't?a': 'tía',
  't?as': 'tías',
  'T?as': 'Tías',
  'Jos?': 'José',
  'inversi?n': 'inversión',
  '?tienne': 'Étienne',
  'decoraci?n': 'decoración',
  'd?a': 'día',
  'valorizaci?n': 'valorización',
  'G?mez': 'Gómez',
  'bu?uelos': 'buñuelos',
  'portugu?s': 'portugués',
  'pirot?cnicos': 'pirotécnicos',
  'Montr?al': 'Montréal',
  'Barrag?n': 'Barragán',
  'jab?n': 'jabón',
  'cr?dito': 'crédito',
  'maestr?a': 'maestría',
  'Valent?n': 'Valentín',
  'g?teries': 'gâteries',
  'aud?fonos': 'audífonos',
  'franc?s': 'francés',
  'f?tbol': 'fútbol',
  'peluquer?a': 'peluquería',
  'u?as': 'uñas',
  'Odontolog?a': 'Odontología',
  'odontolog?a': 'odontología',
  'm?dias': 'medias',
  'donaci?n': 'donación',
  'Donaci?n': 'Donación',
  'comparaci?n': 'comparación',
  'm?dica': 'médica',
  'm?dico': 'médico',
  'ba?o': 'baño',
  'Sebasti?n': 'Sebastián',
  'd?panneur': 'dépanneur',
  'traducci?n': 'traducción',
  'traducci?nes': 'traducciones',
  'inter?s': 'interés',
  'navide?a': 'navideña',
  'Guti?rrez': 'Gutiérrez',
  'L?pez': 'López',
  'c?mara': 'cámara',
  'm?ster': 'máster',
  'Mu?oz': 'Muñoz',
  'colch?n': 'colchón',
  'c?cteles': 'cócteles',
  'acci?n': 'acción',
  'panader?a': 'panadería',
  'reuni?n': 'reunión',
  'Psicologia': 'Psicología',
}

// ── CSV reading ─────────────────────────────────────────────────────────────

function splitCsvLine(line) {
  const values = []
  let current = ''
  let inQuotes = false

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]

    if (character === '"' && inQuotes && line[index + 1] === '"') {
      current += '"'
      index += 1
    } else if (character === '"') {
      inQuotes = !inQuotes
    } else if (character === ',' && !inQuotes) {
      values.push(current)
      current = ''
    } else {
      current += character
    }
  }

  values.push(current)

  return values.map((value) => value.trim())
}

/**
 * Decode the raw file bytes. AndroMoney exports latin-1/Big5 bytes, never
 * UTF-8, so decoding as UTF-8 would mangle every note that has one.
 */
export function decodeAndroMoneyBuffer(buffer, { textFixes = {} } = {}) {
  let text = buffer.toString('latin1')

  // A note that contained a comma comes back as the Big5 full-width comma.
  text = text.replaceAll(BIG5_FULLWIDTH_COMMA, ', ')

  // Anything still non-ASCII at this point is an encoding artefact we do not
  // know about. Measured here, before the repairs below reintroduce legitimate
  // accented characters of their own.
  const leftover = [...new Set(text.match(/[^\x00-\x7F]/g) ?? [])]

  const fixes = { ...DEFAULT_TEXT_FIXES, ...textFixes }
  for (const [broken, fixed] of Object.entries(fixes)) {
    text = text.replaceAll(broken, fixed)
  }

  return { text, leftover }
}

export function parseAndroMoneyCsv(buffer, options = {}) {
  const { text, leftover } = decodeAndroMoneyBuffer(buffer, options)
  const lines = text.split(/\r\n|\n|\r/).filter((line) => line.trim().length)

  if (lines.length < 2) {
    throw new Error('The CSV does not look like an AndroMoney export (too few lines).')
  }

  // Line 0 is AndroMoney's own file banner; line 1 is the column header.
  const headers = splitCsvLine(lines[1])
  const rows = []

  for (let index = 2; index < lines.length; index += 1) {
    const values = splitCsvLine(lines[index])
    const row = {}
    headers.forEach((header, position) => {
      row[header] = values[position] ?? ''
    })
    row.__line = index + 1
    rows.push(row)
  }

  return {
    headers,
    rows,
    warnings: leftover.length
      ? [
          `Unrecognised non-ASCII character(s) in the export: ${leftover.join(' ')}. ` +
            'Check the notes they appear in before importing.',
        ]
      : [],
  }
}

// ── Row classification ──────────────────────────────────────────────────────

export const ROW_KINDS = {
  OPENING: 'opening_balance',
  TRANSFER: 'transfer',
  INCOME: 'income',
  EXPENSE: 'expense',
  UNKNOWN: 'unknown',
}

export function classifyRow(row) {
  const out = row['Expense(Transfer Out)']?.trim() ?? ''
  const into = row['Income(Transfer In)']?.trim() ?? ''

  if (row.Category?.trim() === 'SYSTEM') return ROW_KINDS.OPENING
  if (out && into) return ROW_KINDS.TRANSFER
  if (out) return ROW_KINDS.EXPENSE
  if (into) return ROW_KINDS.INCOME

  return ROW_KINDS.UNKNOWN
}

/** AndroMoney dates are yyyyMMdd; 10100101 is its "no date" sentinel. */
export function parseAndroDate(value) {
  const raw = value?.trim() ?? ''
  if (!/^\d{8}$/.test(raw)) return null

  const year = Number(raw.slice(0, 4))
  const month = Number(raw.slice(4, 6))
  const day = Number(raw.slice(6, 8))

  if (year < 1900 || month < 1 || month > 12 || day < 1 || day > 31) return null

  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`
}

/** AndroMoney times are HHmm without leading zeros ("2" = 00:02, "828" = 08:28). */
export function parseAndroTime(value) {
  const raw = value?.trim() ?? ''
  if (!raw || !/^\d{1,4}$/.test(raw)) return null

  const padded = raw.padStart(4, '0')
  const hours = Number(padded.slice(0, 2))
  const minutes = Number(padded.slice(2, 4))

  if (hours > 23 || minutes > 59) return null

  return `${padded.slice(0, 2)}:${padded.slice(2, 4)}:00`
}

export function parseAndroAmount(value) {
  const amount = Number(String(value ?? '').trim().replaceAll(',', ''))

  return Number.isFinite(amount) ? amount : null
}

// ── Account / category planning ─────────────────────────────────────────────

const ACCOUNT_TYPE_HINTS = [
  [/visa|mastercard|master card|\bcc\b|credit/i, { account_type: 'credit_card', account_class: 'liability' }],
  [/deuda|loan|pr[eé]stamo/i, { account_type: 'debt', account_class: 'liability' }],
  [/cash|efectivo/i, { account_type: 'cash', account_class: 'asset' }],
  [/tfsa|rrsp|cripto|crypto|trii|semilla|fiducuenta|invest|stock|broker/i, { account_type: 'investment', account_class: 'asset' }],
  [/ahorro|saving/i, { account_type: 'savings', account_class: 'asset' }],
]

export function guessAccountShape(name) {
  for (const [pattern, shape] of ACCOUNT_TYPE_HINTS) {
    if (pattern.test(name)) return shape
  }

  return { account_type: 'checking', account_class: 'asset' }
}

/**
 * Build the full import plan: which accounts and categories have to exist, what
 * every CSV row turns into, and everything that cannot be imported as-is.
 *
 * Nothing here talks to Supabase — `existing` is injected so the same function
 * serves both `plan` (against the live household) and unit-style dry runs.
 */
export function buildPlan({ rows, map = {}, existing = {} }) {
  const existingAccounts = existing.accounts ?? []
  const existingCategories = existing.categories ?? []
  const baseCurrency = existing.baseCurrency ?? map.baseCurrency ?? 'CAD'

  const accountMap = map.accounts ?? {}
  const categoryMap = map.categories ?? {}
  const fxRates = map.fxRates ?? {}
  const crossCurrency = map.crossCurrencyTransfers ?? {}
  const skipUids = new Set(map.skipUids ?? [])

  const problems = []
  const note = (row, reason) =>
    problems.push({
      line: row.__line,
      id: row.Id,
      uid: row.uid,
      date: row.Date,
      amount: row.Amount,
      currency: row.Currency,
      category: `${row.Category}${row['Sub-Category'] ? ` / ${row['Sub-Category']}` : ''}`,
      note: row.Note,
      reason,
    })

  // 1. Accounts: name → observed currencies (the dominant one wins).
  const accountCurrencyCounts = new Map()
  const openingBalances = new Map()

  for (const row of rows) {
    const kind = classifyRow(row)
    const names =
      kind === ROW_KINDS.OPENING
        ? [row['Income(Transfer In)']?.trim()]
        : [row['Expense(Transfer Out)']?.trim(), row['Income(Transfer In)']?.trim()]

    for (const name of names) {
      if (!name) continue
      if (!accountCurrencyCounts.has(name)) accountCurrencyCounts.set(name, new Map())
      const counts = accountCurrencyCounts.get(name)
      const currency = row.Currency?.trim().toUpperCase() || baseCurrency
      counts.set(currency, (counts.get(currency) ?? 0) + 1)
    }

    if (kind === ROW_KINDS.OPENING) {
      const name = row['Income(Transfer In)']?.trim()
      const amount = parseAndroAmount(row.Amount)
      if (name && amount !== null) {
        openingBalances.set(name, {
          amount,
          currency: row.Currency?.trim().toUpperCase() || baseCurrency,
        })
      }
    }
  }

  const existingAccountByName = new Map(
    existingAccounts.map((account) => [account.name.trim().toLowerCase(), account])
  )

  const accounts = [...accountCurrencyCounts.entries()].map(([sourceName, counts]) => {
    const override = accountMap[sourceName] ?? {}
    const dominantCurrency = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0]
    const targetName = override.name ?? sourceName
    const shape = guessAccountShape(targetName)
    const opening = openingBalances.get(sourceName) ?? null

    return {
      sourceName,
      name: targetName,
      currency_code: override.currency_code ?? dominantCurrency,
      account_type: override.account_type ?? shape.account_type,
      account_class: override.account_class ?? shape.account_class,
      openingBalance: override.openingBalance ?? opening?.amount ?? 0,
      openingBalanceDate: override.openingBalanceDate ?? map.openingBalanceDate ?? null,
      transactionCount: [...counts.values()].reduce((total, value) => total + value, 0),
      existingId: existingAccountByName.get(targetName.trim().toLowerCase())?.id ?? null,
    }
  })

  const accountBySourceName = new Map(accounts.map((account) => [account.sourceName, account]))

  // 2. Categories. AndroMoney's Category/Sub-Category is exactly the app's
  //    parent/child pair. Direction (income vs expense) is taken from how the
  //    rows actually use each subcategory — the RPCs reject an income
  //    transaction filed under an expense category and vice versa.
  const subcategoryDirections = new Map()

  for (const row of rows) {
    const kind = classifyRow(row)
    if (kind !== ROW_KINDS.INCOME && kind !== ROW_KINDS.EXPENSE) continue

    const parent = row.Category?.trim()
    const child = row['Sub-Category']?.trim()
    if (!parent) continue

    const key = `${parent}/${child}`
    if (!subcategoryDirections.has(key)) {
      subcategoryDirections.set(key, { parent, child, income: 0, expense: 0 })
    }
    subcategoryDirections.get(key)[kind] += 1
  }

  // A parent whose children point in both directions (CxP: "pagos" is income,
  // "Deudas pagadas" is expense) cannot be one category — a parent carries a
  // single reporting_type. Split it, keeping the majority direction on the
  // original name.
  const parentDirections = new Map()
  for (const entry of subcategoryDirections.values()) {
    if (!parentDirections.has(entry.parent)) {
      parentDirections.set(entry.parent, { income: 0, expense: 0 })
    }
    parentDirections.get(entry.parent).income += entry.income
    parentDirections.get(entry.parent).expense += entry.expense
  }

  const splitSuffix = map.splitParentSuffix ?? { income: ' (ingresos)', expense: ' (gastos)' }
  const existingCategoryKey = (name, parentId) =>
    `${parentId ?? 'root'}::${name.trim().toLowerCase()}`
  const existingCategoryByKey = new Map(
    existingCategories.map((category) => [
      existingCategoryKey(category.name, category.parent_category_id),
      category,
    ])
  )
  const existingRootByName = new Map(
    existingCategories
      .filter((category) => !category.parent_category_id)
      .map((category) => [category.name.trim().toLowerCase(), category])
  )

  const parentPlans = new Map()
  const resolveParent = (parentName, direction) => {
    const counts = parentDirections.get(parentName) ?? { income: 0, expense: 0 }
    const isMixed = counts.income > 0 && counts.expense > 0
    const majority = counts.income >= counts.expense ? 'income' : 'expense'
    const targetName =
      isMixed && direction !== majority ? `${parentName}${splitSuffix[direction]}` : parentName
    const override = categoryMap[parentName]?.name
    const finalName = isMixed && direction !== majority ? targetName : override ?? targetName
    const key = `${finalName}::${direction}`

    if (!parentPlans.has(key)) {
      parentPlans.set(key, {
        sourceName: parentName,
        name: finalName,
        reporting_type: direction,
        category_type: direction,
        parent: null,
        split: isMixed,
        existingId: existingRootByName.get(finalName.trim().toLowerCase())?.id ?? null,
        transactionCount: 0,
      })
    }

    return parentPlans.get(key)
  }

  const childPlans = new Map()

  for (const entry of subcategoryDirections.values()) {
    const direction = entry.income >= entry.expense ? 'income' : 'expense'
    const parentPlan = resolveParent(entry.parent, direction)
    parentPlan.transactionCount += entry.income + entry.expense

    if (!entry.child) continue

    const override = categoryMap[`${entry.parent}/${entry.child}`]?.name
    const childName = override ?? entry.child
    const key = `${entry.parent}/${entry.child}`

    childPlans.set(key, {
      sourceKey: key,
      name: childName,
      reporting_type: direction,
      category_type: direction,
      parentKey: `${parentPlan.name}::${direction}`,
      parentName: parentPlan.name,
      transactionCount: entry.income + entry.expense,
      existingId:
        (parentPlan.existingId
          ? existingCategoryByKey.get(existingCategoryKey(childName, parentPlan.existingId))?.id
          : null) ?? null,
    })
  }

  // 3. Rows → transactions.
  const rateFor = (currency, isoDate) => {
    if (currency === baseCurrency) return 1
    const table = fxRates[currency]
    if (!table) return null
    const year = isoDate?.slice(0, 4)
    const month = isoDate?.slice(0, 7)

    return table[month] ?? table[year] ?? table.default ?? null
  }

  const transactions = []
  const openings = []
  const tagsUsed = new Set()
  const crossCurrencySuggestions = {}
  const currencyMismatchPolicy = map.currencyMismatchPolicy ?? 'convert'
  // A cross-currency transfer has two real amounts and AndroMoney exports only
  // one. The other can be estimated from the rate table, but an estimate here
  // is a wrong balance on a real account — so by default it has to be confirmed
  // in the map file rather than guessed silently.
  const confirmCrossCurrency = map.confirmCrossCurrencyTransfers !== false

  for (const row of rows) {
    const kind = classifyRow(row)
    const uid = row.uid?.trim()

    if (skipUids.has(uid)) {
      note(row, 'Skipped by skipUids in the map file.')
      continue
    }

    if (kind === ROW_KINDS.OPENING) {
      const account = accountBySourceName.get(row['Income(Transfer In)']?.trim())
      const amount = parseAndroAmount(row.Amount)
      if (!account) {
        note(row, 'Opening balance for an unknown account.')
      } else if (amount) {
        openings.push({ uid, account, amount, currency: account.currency_code })
      }
      continue
    }

    if (kind === ROW_KINDS.UNKNOWN) {
      note(row, 'Row has neither a source nor a destination account.')
      continue
    }

    const transactionDate = parseAndroDate(row.Date)
    const rawAmount = parseAndroAmount(row.Amount)
    const rowCurrency = row.Currency?.trim().toUpperCase() || baseCurrency

    if (!transactionDate) {
      note(row, `Unreadable date "${row.Date}".`)
      continue
    }

    if (rawAmount === null) {
      note(row, `Unreadable amount "${row.Amount}".`)
      continue
    }

    if (rawAmount === 0) {
      // AndroMoney keeps 0-amount rows as reminders of things that never
      // happened (a refunded deposit, a cancelled order). The ledger rejects
      // them and they carry no financial meaning.
      note(row, 'Amount is 0 — nothing to post.')
      continue
    }

    if (rawAmount < 0) {
      note(
        row,
        'Negative amount — AndroMoney stored a reversal on the opposite side. ' +
          'Enter it by hand, or map it through skipUids once you decide the category.'
      )
      continue
    }

    const description =
      row.Note?.trim() || row['Sub-Category']?.trim() || row.Category?.trim() || 'Imported'
    const payee = row['Payee/Payer']?.trim() || null
    const project = row.Project?.trim() || null
    const time = map.importTime === false ? null : parseAndroTime(row.Time)
    const tags = []

    if (project && map.projectsAsTags !== false) {
      tags.push(project)
      tagsUsed.add(project)
    }

    if (kind === ROW_KINDS.TRANSFER) {
      const fromAccount = accountBySourceName.get(row['Expense(Transfer Out)']?.trim())
      const toAccount = accountBySourceName.get(row['Income(Transfer In)']?.trim())

      if (!fromAccount || !toAccount) {
        note(row, 'Transfer references an unknown account.')
        continue
      }

      if (fromAccount.sourceName === toAccount.sourceName) {
        note(row, 'Transfer between the same account.')
        continue
      }

      const sameCurrency = fromAccount.currency_code === toAccount.currency_code
      let fromAmount = rawAmount
      let toAmount = null
      let estimated = false

      if (!sameCurrency) {
        const override = crossCurrency[uid]
        const fromRate = rateFor(fromAccount.currency_code, transactionDate)
        const toRate = rateFor(toAccount.currency_code, transactionDate)

        // The single Amount column is denominated in `Currency`, which may be
        // either leg. The other leg has to be supplied or estimated.
        if (override?.fromAmount != null && override?.toAmount != null) {
          fromAmount = Number(override.fromAmount)
          toAmount = Number(override.toAmount)
        } else if (rowCurrency === toAccount.currency_code) {
          toAmount = rawAmount
          if (override?.fromAmount != null) {
            fromAmount = Number(override.fromAmount)
          } else {
            fromAmount = fromRate && toRate ? round4((rawAmount * toRate) / fromRate) : null
            estimated = true
          }
        } else {
          fromAmount = rawAmount
          if (override?.toAmount != null) {
            toAmount = Number(override.toAmount)
          } else {
            toAmount = fromRate && toRate ? round4((rawAmount * fromRate) / toRate) : null
            estimated = true
          }
        }

        if (!fromAmount || !toAmount) {
          note(
            row,
            `Cross-currency transfer ${fromAccount.currency_code}→${toAccount.currency_code} ` +
              'needs both legs, and no FX rate is configured to estimate the missing one. ' +
              `Add fxRates, or set crossCurrencyTransfers["${uid}"].`
          )
          continue
        }

        if (estimated) {
          crossCurrencySuggestions[uid] = {
            _date: transactionDate,
            _note: description,
            _route: `${fromAccount.name} (${fromAccount.currency_code}) → ${toAccount.name} (${toAccount.currency_code})`,
            fromAmount: round4(fromAmount),
            toAmount: round4(toAmount),
          }

          if (confirmCrossCurrency) {
            note(
              row,
              `Cross-currency transfer ${fromAccount.currency_code}→${toAccount.currency_code}: ` +
                'AndroMoney exported only one leg. Confirm the other in crossCurrencyTransfers ' +
                '(the plan report prints a paste-ready block), or set ' +
                '"confirmCrossCurrencyTransfers": false to accept the estimates.'
            )
            continue
          }

          note(
            row,
            `Cross-currency transfer leg estimated from the rate table ` +
              `(${fromAmount} ${fromAccount.currency_code} → ${toAmount} ${toAccount.currency_code}). Imported.`
          )
        }
      }

      const rate = rateFor(fromAccount.currency_code, transactionDate)

      if (rate === null) {
        note(row, `No FX rate configured for ${fromAccount.currency_code}.`)
        continue
      }

      transactions.push({
        uid,
        line: row.__line,
        kind: 'transfer',
        transactionDate,
        transactionTime: time,
        fromAccount,
        toAccount,
        amount: round4(fromAmount),
        toAmount: toAmount === null ? null : round4(toAmount),
        exchangeRateToBase: rate,
        description,
        notes: null,
        tags,
        raw: row,
      })
      continue
    }

    const accountName =
      kind === ROW_KINDS.EXPENSE
        ? row['Expense(Transfer Out)']?.trim()
        : row['Income(Transfer In)']?.trim()
    const account = accountBySourceName.get(accountName)

    if (!account) {
      note(row, `Unknown account "${accountName}".`)
      continue
    }

    const categoryKey = `${row.Category?.trim()}/${row['Sub-Category']?.trim()}`
    const childPlan = childPlans.get(categoryKey)
    const parentDirection = subcategoryDirections.get(categoryKey)
    const direction = parentDirection
      ? parentDirection.income >= parentDirection.expense
        ? 'income'
        : 'expense'
      : kind

    if (direction !== kind) {
      note(row, `Row direction (${kind}) disagrees with its category's direction (${direction}).`)
      continue
    }

    let amount = rawAmount

    if (rowCurrency !== account.currency_code) {
      if (currencyMismatchPolicy === 'skip') {
        note(row, `Row currency ${rowCurrency} differs from account currency ${account.currency_code}.`)
        continue
      }
      if (currencyMismatchPolicy === 'convert') {
        const rowRate = rateFor(rowCurrency, transactionDate)
        const accountRate = rateFor(account.currency_code, transactionDate)
        if (!rowRate || !accountRate) {
          note(
            row,
            `Row currency ${rowCurrency} differs from account currency ` +
              `${account.currency_code} and no FX rate is configured for the conversion.`
          )
          continue
        }
        amount = round4((rawAmount * rowRate) / accountRate)
        note(
          row,
          `Converted ${rawAmount} ${rowCurrency} → ${amount} ${account.currency_code} ` +
            '(row currency differed from the account currency). Imported.'
        )
      }
    }

    const rate = rateFor(account.currency_code, transactionDate)

    if (rate === null) {
      note(row, `No FX rate configured for ${account.currency_code}.`)
      continue
    }

    transactions.push({
      uid,
      line: row.__line,
      kind: direction,
      transactionDate,
      transactionTime: time,
      account,
      categoryKey,
      categoryPlan: childPlan ?? null,
      amount: round4(amount),
      exchangeRateToBase: rate,
      description,
      payee,
      notes: null,
      tags,
      raw: row,
    })
  }

  const firstTransactionDate = transactions
    .map((transaction) => transaction.transactionDate)
    .sort()[0]

  return {
    baseCurrency,
    firstTransactionDate,
    accounts,
    crossCurrencySuggestions,
    parentCategories: [...parentPlans.values()],
    childCategories: [...childPlans.values()],
    tags: [...tagsUsed].sort(),
    transactions,
    openings,
    problems,
    summary: {
      csvRows: rows.length,
      importable: transactions.length,
      income: transactions.filter((t) => t.kind === 'income').length,
      expense: transactions.filter((t) => t.kind === 'expense').length,
      transfer: transactions.filter((t) => t.kind === 'transfer').length,
      openingBalances: openings.length,
      skipped: problems.filter((p) => !p.reason.endsWith('Imported.')).length,
      accountsToCreate: accounts.filter((a) => !a.existingId).length,
      categoriesToCreate:
        [...parentPlans.values()].filter((c) => !c.existingId).length +
        [...childPlans.values()].filter((c) => !c.existingId).length,
    },
  }
}

export function round4(value) {
  return Math.round(value * 10000) / 10000
}
