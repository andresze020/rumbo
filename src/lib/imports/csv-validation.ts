import type {
  CsvMapping,
  CsvRow,
  ImportAccount,
  ImportCategory,
  ImportCurrency,
  MappedImportRow,
} from './types'
import { findMatchingRule, type CategorizationRule } from '@/lib/rules/match'

function normalize(value: string) {
  return value.trim().toLowerCase()
}

function normalizeLookup(value: string) {
  return normalize(value).replaceAll(/\s+/g, ' ')
}

function getCategoryPath(
  category: { name: string; parent_category_id: string | null },
  categoriesById: Map<string, { name: string }>
) {
  const parentName = category.parent_category_id
    ? categoriesById.get(category.parent_category_id)?.name
    : null

  return parentName ? `${parentName} / ${category.name}` : category.name
}

function parseAmount(value: string) {
  const cleanedValue = value
    .trim()
    .replaceAll(',', '')
    .replaceAll('$', '')
    .replaceAll('US$', '')
    .replaceAll('CAD$', '')
  const isParenthesizedNegative =
    cleanedValue.startsWith('(') && cleanedValue.endsWith(')')
  const normalizedValue = isParenthesizedNegative
    ? `-${cleanedValue.slice(1, -1)}`
    : cleanedValue
  const amount = Number(normalizedValue)

  return Number.isFinite(amount) ? amount : null
}

function parseDate(value: string) {
  const trimmedValue = value.trim()

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmedValue)) {
    return trimmedValue
  }

  const slashDate = trimmedValue.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)

  if (slashDate) {
    const month = Number(slashDate[1])
    const day = Number(slashDate[2])
    const year = Number(slashDate[3])
    const parsedDate = new Date(Date.UTC(year, month - 1, day))

    if (
      parsedDate.getUTCFullYear() === year &&
      parsedDate.getUTCMonth() === month - 1 &&
      parsedDate.getUTCDate() === day
    ) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(
        2,
        '0'
      )}`
    }
  }

  return null
}

function normalizeTransactionType(
  value: string
): 'income' | 'expense' | 'transfer' | null {
  const normalizedValue = normalize(value)

  if (['income', 'credit', 'deposit'].includes(normalizedValue)) {
    return 'income'
  }

  if (['expense', 'debit', 'withdrawal', 'payment', 'purchase'].includes(normalizedValue)) {
    return 'expense'
  }

  if (['transfer', 'xfer'].includes(normalizedValue)) {
    return 'transfer'
  }

  return null
}

function getMappedValue(row: CsvRow, columnName: string) {
  return columnName ? row[columnName]?.trim() ?? '' : ''
}

export function buildValidatedRows({
  rows,
  mapping,
  targetAccountId,
  accounts,
  categories,
  currencies,
  rules = [],
}: {
  rows: CsvRow[]
  mapping: CsvMapping
  targetAccountId: string
  accounts: ImportAccount[]
  categories: ImportCategory[]
  currencies: ImportCurrency[]
  // BR-010: active categorization rules — auto-fill a row's category when none
  // is mapped/found in the CSV.
  rules?: CategorizationRule[]
}) {
  const accountsById = new Map(accounts.map((account) => [account.id, account]))
  const accountsByName = new Map<string, ImportAccount>()
  const categoriesById = new Map(categories.map((category) => [category.id, category]))
  const categoriesByName = new Map<string, ImportCategory>()
  const currencyCodes = new Set(currencies.map((currency) => currency.code))
  const seenRowKeys = new Set<string>()

  for (const account of accounts) {
    accountsByName.set(normalizeLookup(account.name), account)
    accountsByName.set(
      normalizeLookup(
        [account.name, account.institution_name, account.currency_code]
          .filter(Boolean)
          .join(' · ')
      ),
      account
    )
  }

  for (const category of categories) {
    categoriesByName.set(normalizeLookup(category.name), category)
    categoriesByName.set(
      normalizeLookup(getCategoryPath(category, categoriesById)),
      category
    )
  }

  return rows.map((row, index): MappedImportRow => {
    const errors: string[] = []
    const warnings: string[] = []
    const rowNumber = index + 2
    const rawDate = getMappedValue(row, mapping.transaction_date)
    const rawAmount = getMappedValue(row, mapping.amount)
    const rawDescription = getMappedValue(row, mapping.description)
    const rawAccount = getMappedValue(row, mapping.account)
    const rawCategory = getMappedValue(row, mapping.category)
    const rawCurrency = getMappedValue(row, mapping.currency).toUpperCase()
    const rawType = getMappedValue(row, mapping.transaction_type)
    const amount = parseAmount(rawAmount)
    const transactionDate = parseDate(rawDate)
    let transactionType: 'income' | 'expense' | 'transfer' | null = rawType
      ? normalizeTransactionType(rawType)
      : null
    const account =
      rawAccount && accountsByName.has(normalizeLookup(rawAccount))
        ? accountsByName.get(normalizeLookup(rawAccount))
        : targetAccountId
          ? accountsById.get(targetAccountId)
          : undefined
    let category =
      rawCategory && categoriesByName.has(normalizeLookup(rawCategory))
        ? categoriesByName.get(normalizeLookup(rawCategory))
        : undefined

    // BR-010: no category came from the CSV → try the household's rules against
    // this row (description / merchant / amount / account name). First matching
    // rule (by priority) wins; the normal reporting-type checks below still run.
    let ruleApplied = false
    if (!category && rules.length) {
      const matched = findMatchingRule(rules, {
        description: rawDescription || null,
        merchantName: getMappedValue(row, mapping.merchant_name) || null,
        amount,
        accountName: account?.name ?? null,
      })
      if (matched) {
        const ruleCategory = categoriesById.get(matched.categoryId)
        if (ruleCategory) {
          category = ruleCategory
          ruleApplied = true
        }
      }
    }

    if (!transactionDate) {
      errors.push('Date is required and must be YYYY-MM-DD or MM/DD/YYYY.')
    }

    if (amount === null) {
      errors.push('Amount is required and must be numeric.')
    } else if (amount === 0) {
      errors.push('Amount cannot be 0.')
    }

    if (!transactionType && amount !== null) {
      transactionType = amount > 0 ? 'income' : 'expense'
    }

    if (!transactionType) {
      errors.push('Transaction type could not be inferred.')
    } else if (transactionType === 'transfer') {
      errors.push('Transfer rows are not supported in CSV import yet.')
    }

    if (!rawDescription) {
      errors.push('Description is required.')
    }

    if (!account) {
      errors.push('Account is required or mapped account was not found.')
    }

    if (!category) {
      errors.push('Category is required and must match an active household category.')
    } else if (category.is_archived) {
      errors.push('Category is archived.')
    } else if (
      transactionType === 'income' &&
      category.reporting_type !== 'income'
    ) {
      errors.push('Income rows require an income category.')
    } else if (
      transactionType === 'expense' &&
      !['expense', 'debt_interest'].includes(category.reporting_type)
    ) {
      errors.push('Expense rows require an expense category.')
    }

    if (ruleApplied && category) {
      warnings.push(
        `Category set to "${getCategoryPath(category, categoriesById)}" by a rule.`
      )
    }

    if (rawCurrency && !currencyCodes.has(rawCurrency)) {
      errors.push('Currency code is not active.')
    }

    if (rawCurrency && account && rawCurrency !== account.currency_code) {
      warnings.push('CSV currency differs from the selected account currency.')
    }

    const duplicateKey =
      transactionDate && amount !== null && account
        ? [
            transactionDate,
            account.id,
            normalizeLookup(rawDescription),
            Math.abs(amount).toFixed(2),
          ].join('|')
        : null
    const isDuplicateInFile =
      duplicateKey !== null && seenRowKeys.has(duplicateKey)

    if (duplicateKey) {
      seenRowKeys.add(duplicateKey)
    }

    if (isDuplicateInFile) {
      warnings.push('Possible duplicate in this CSV file.')
    }

    return {
      rowNumber,
      rawData: row,
      mappedData: {
        transaction_date: transactionDate ?? rawDate,
        amount: amount === null ? rawAmount : String(Math.abs(amount)),
        description: rawDescription,
        account_id: account?.id ?? null,
        category_id: category?.id ?? null,
        merchant_name: getMappedValue(row, mapping.merchant_name) || null,
        currency_code: rawCurrency || (account?.currency_code ?? null),
        notes: getMappedValue(row, mapping.notes) || null,
        transaction_type: transactionType,
      },
      status: errors.length
        ? 'invalid'
        : isDuplicateInFile
          ? 'duplicate'
          : 'valid',
      errors,
      warnings,
    }
  })
}
