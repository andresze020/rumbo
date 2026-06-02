export type CsvCell = boolean | number | string | null | undefined

export type CsvColumn<T> = {
  header: string
  value: (row: T) => CsvCell
}

function escapeCsvCell(value: CsvCell) {
  if (value === null || value === undefined) {
    return ''
  }

  const text = String(value)
  const escapedText = text.replaceAll('"', '""')

  return /[",\r\n]/.test(escapedText) ? `"${escapedText}"` : escapedText
}

export function buildCsv<T>(columns: CsvColumn<T>[], rows: T[]) {
  const headerRow = columns.map((column) => escapeCsvCell(column.header))
  const dataRows = rows.map((row) =>
    columns.map((column) => escapeCsvCell(column.value(row)))
  )

  return [headerRow, ...dataRows].map((cells) => cells.join(',')).join('\r\n')
}

export function todayDateStamp() {
  return new Date().toISOString().slice(0, 10)
}
