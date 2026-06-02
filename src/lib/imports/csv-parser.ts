import type { CsvRow } from './types'

export type ParsedCsv = {
  headers: string[]
  rows: CsvRow[]
}

function parseCsvLine(line: string) {
  const values: string[] = []
  let currentValue = ''
  let inQuotes = false

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]
    const nextCharacter = line[index + 1]

    if (character === '"' && inQuotes && nextCharacter === '"') {
      currentValue += '"'
      index += 1
    } else if (character === '"') {
      inQuotes = !inQuotes
    } else if (character === ',' && !inQuotes) {
      values.push(currentValue.trim())
      currentValue = ''
    } else {
      currentValue += character
    }
  }

  values.push(currentValue.trim())

  return values
}

function splitCsvRows(csvText: string) {
  const rows: string[] = []
  let currentRow = ''
  let inQuotes = false

  for (let index = 0; index < csvText.length; index += 1) {
    const character = csvText[index]
    const nextCharacter = csvText[index + 1]

    if (character === '"' && inQuotes && nextCharacter === '"') {
      currentRow += character
      currentRow += nextCharacter
      index += 1
    } else if (character === '"') {
      inQuotes = !inQuotes
      currentRow += character
    } else if ((character === '\n' || character === '\r') && !inQuotes) {
      if (character === '\r' && nextCharacter === '\n') {
        index += 1
      }

      rows.push(currentRow)
      currentRow = ''
    } else {
      currentRow += character
    }
  }

  if (currentRow.length > 0) {
    rows.push(currentRow)
  }

  return rows.filter((row) => row.trim().length > 0)
}

export function parseCsv(csvText: string): ParsedCsv {
  const csvRows = splitCsvRows(csvText)

  if (!csvRows.length) {
    return { headers: [], rows: [] }
  }

  const headers = parseCsvLine(csvRows[0]).map((header, index) => {
    const trimmedHeader = header.trim()

    return trimmedHeader || `Column ${index + 1}`
  })
  const rows = csvRows.slice(1).map((row) => {
    const values = parseCsvLine(row)

    return Object.fromEntries(
      headers.map((header, index) => [header, values[index] ?? ''])
    )
  })

  return { headers, rows }
}

export function guessCsvMapping(headers: string[]) {
  const normalizedHeaders = new Map(
    headers.map((header) => [
      header
        .toLowerCase()
        .replaceAll(/[^a-z0-9]/g, ''),
      header,
    ])
  )

  function findHeader(candidates: string[]) {
    for (const candidate of candidates) {
      const header = normalizedHeaders.get(candidate)

      if (header) {
        return header
      }
    }

    return ''
  }

  return {
    transaction_date: findHeader(['date', 'transactiondate', 'posteddate']),
    amount: findHeader(['amount', 'transactionamount', 'value']),
    description: findHeader(['description', 'memo', 'details', 'name']),
    account: findHeader(['account', 'accountname']),
    category: findHeader(['category', 'categoryname']),
    merchant_name: findHeader(['merchant', 'merchantname', 'payee']),
    currency: findHeader(['currency', 'currencycode']),
    notes: findHeader(['notes', 'note']),
    transaction_type: findHeader(['type', 'transactiontype']),
  }
}
