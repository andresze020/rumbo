import { deflateRawSync } from 'node:zlib'
import type { CsvCell, CsvColumn } from './csv'

/**
 * Minimal `.xlsx` writer (BR-041).
 *
 * An xlsx file is a ZIP of a handful of XML parts. Node ships DEFLATE in
 * `node:zlib`, so the whole format fits in ~150 lines here — cheaper than
 * adding a spreadsheet dependency to the serverless bundle, and it keeps full
 * control over the one thing the ticket actually cares about: numbers must
 * land in the sheet as numbers, not as text.
 *
 * Deliberately not supported (nothing in the export needs it): multiple sheets,
 * formatting, formulas, shared strings, ZIP64. One sheet, inline strings.
 */

const SHEET_PATH = 'xl/worksheets/sheet1.xml'

/**
 * Strings that are unambiguously a decimal number are written as numeric cells.
 * Postgres returns `numeric` columns as strings over the wire, so without this
 * every amount would arrive in Excel as text and refuse to sum.
 *
 * The pattern is deliberately strict: no leading zeros (so a "0123" card
 * suffix stays text), no thousands separators, no exponents, and dates like
 * `2026-07-28` never match. Columns that must stay text regardless can opt out
 * with `type: 'text'`.
 */
const DECIMAL_STRING = /^-?(0|[1-9]\d*)(\.\d+)?$/

function isNumericString(value: string) {
  return DECIMAL_STRING.test(value) && Number.isFinite(Number(value))
}

/** XML 1.0 forbids most control characters outright — drop them, escape the rest. */
function escapeXml(value: string) {
  let escaped = ''
  for (const char of value) {
    const code = char.charCodeAt(0)
    // Drop C0 controls: XML 1.0 allows only tab (9), newline (10) and CR (13).
    if (code < 0x20 && code !== 9 && code !== 10 && code !== 13) continue
    if (char === '&') escaped += '&amp;'
    else if (char === '<') escaped += '&lt;'
    else if (char === '>') escaped += '&gt;'
    else escaped += char
  }
  return escaped
}

/** 0 → A, 25 → Z, 26 → AA … */
function columnName(index: number) {
  let name = ''
  let n = index
  while (n >= 0) {
    name = String.fromCharCode(65 + (n % 26)) + name
    n = Math.floor(n / 26) - 1
  }
  return name
}

function cellXml(reference: string, value: CsvCell, forceText: boolean) {
  if (value === null || value === undefined || value === '') {
    return ''
  }
  if (typeof value === 'boolean') {
    return `<c r="${reference}" t="b"><v>${value ? 1 : 0}</v></c>`
  }
  if (typeof value === 'number') {
    return Number.isFinite(value)
      ? `<c r="${reference}"><v>${value}</v></c>`
      : `<c r="${reference}" t="inlineStr"><is><t>${escapeXml(String(value))}</t></is></c>`
  }
  if (!forceText && isNumericString(value)) {
    return `<c r="${reference}"><v>${value}</v></c>`
  }
  return `<c r="${reference}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`
}

function buildSheetXml<T>(columns: XlsxColumn<T>[], rows: T[]) {
  const parts: string[] = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>',
    `<row r="1">${columns
      .map((column, index) => cellXml(`${columnName(index)}1`, column.header, true))
      .join('')}</row>`,
  ]

  rows.forEach((row, rowIndex) => {
    const reference = rowIndex + 2
    const cells = columns
      .map((column, index) =>
        cellXml(`${columnName(index)}${reference}`, column.value(row), column.type === 'text')
      )
      .join('')
    parts.push(`<row r="${reference}">${cells}</row>`)
  })

  parts.push('</sheetData></worksheet>')
  return parts.join('')
}

// ── ZIP container ────────────────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let bit = 0; bit < 8; bit++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[i] = c
  }
  return table
})()

function crc32(buffer: Buffer) {
  let crc = -1
  for (let i = 0; i < buffer.length; i++) {
    crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ -1) >>> 0
}

type ZipEntry = { name: string; content: Buffer }

/**
 * Writes a ZIP archive with every entry DEFLATE-compressed. Sizes and CRCs are
 * known before the header is written, so no data descriptors are needed.
 * Timestamps are fixed (1980-01-01) to keep the output byte-stable.
 */
function zip(entries: ZipEntry[]) {
  const localChunks: Buffer[] = []
  const centralChunks: Buffer[] = []
  let offset = 0

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8')
    const compressed = deflateRawSync(entry.content)
    const checksum = crc32(entry.content)

    const localHeader = Buffer.alloc(30)
    localHeader.writeUInt32LE(0x04034b50, 0)
    localHeader.writeUInt16LE(20, 4) // version needed
    localHeader.writeUInt16LE(0, 6) // flags
    localHeader.writeUInt16LE(8, 8) // method: deflate
    localHeader.writeUInt16LE(0, 10) // time
    localHeader.writeUInt16LE(33, 12) // date: 1980-01-01
    localHeader.writeUInt32LE(checksum, 14)
    localHeader.writeUInt32LE(compressed.length, 18)
    localHeader.writeUInt32LE(entry.content.length, 22)
    localHeader.writeUInt16LE(name.length, 26)
    localHeader.writeUInt16LE(0, 28) // extra length
    localChunks.push(localHeader, name, compressed)

    const centralHeader = Buffer.alloc(46)
    centralHeader.writeUInt32LE(0x02014b50, 0)
    centralHeader.writeUInt16LE(20, 4) // version made by
    centralHeader.writeUInt16LE(20, 6) // version needed
    centralHeader.writeUInt16LE(0, 8) // flags
    centralHeader.writeUInt16LE(8, 10) // method
    centralHeader.writeUInt16LE(0, 12) // time
    centralHeader.writeUInt16LE(33, 14) // date
    centralHeader.writeUInt32LE(checksum, 16)
    centralHeader.writeUInt32LE(compressed.length, 20)
    centralHeader.writeUInt32LE(entry.content.length, 24)
    centralHeader.writeUInt16LE(name.length, 28)
    centralHeader.writeUInt16LE(0, 30) // extra length
    centralHeader.writeUInt16LE(0, 32) // comment length
    centralHeader.writeUInt16LE(0, 34) // disk number
    centralHeader.writeUInt16LE(0, 36) // internal attributes
    centralHeader.writeUInt32LE(0, 38) // external attributes
    centralHeader.writeUInt32LE(offset, 42)
    centralChunks.push(centralHeader, name)

    offset += localHeader.length + name.length + compressed.length
  }

  const central = Buffer.concat(centralChunks)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(0, 4) // this disk
  end.writeUInt16LE(0, 6) // disk with central directory
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(central.length, 12)
  end.writeUInt32LE(offset, 16)
  end.writeUInt16LE(0, 20) // comment length

  return Buffer.concat([...localChunks, central, end])
}

// ── Public API ───────────────────────────────────────────────────────────────

export type XlsxColumn<T> = CsvColumn<T> & {
  /** Force a text cell for values that merely look numeric (card suffixes, codes). */
  type?: 'text'
}

/** Sheet names can't contain []:*?/\ and are capped at 31 characters. */
function safeSheetName(name: string) {
  const cleaned = name.replace(/[[\]:*?/\\]/g, ' ').trim()
  return (cleaned || 'Sheet1').slice(0, 31)
}

export function buildXlsx<T>({
  sheetName,
  columns,
  rows,
}: {
  sheetName: string
  columns: XlsxColumn<T>[]
  rows: T[]
}) {
  const utf8 = (xml: string) => Buffer.from(xml, 'utf8')

  return zip([
    {
      name: '[Content_Types].xml',
      content: utf8(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
          '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
          '<Default Extension="xml" ContentType="application/xml"/>' +
          '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
          '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
          `<Override PartName="/${SHEET_PATH}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
          '</Types>'
      ),
    },
    {
      name: '_rels/.rels',
      content: utf8(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
          '</Relationships>'
      ),
    },
    {
      name: 'xl/workbook.xml',
      content: utf8(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
          'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
          `<sheets><sheet name="${escapeXml(safeSheetName(sheetName))}" sheetId="1" r:id="rId1"/></sheets>` +
          '</workbook>'
      ),
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      content: utf8(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
          '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
          '</Relationships>'
      ),
    },
    {
      // Excel expects a style table even when nothing is styled; the two fills
      // are the minimum it accepts without offering to "repair" the file.
      name: 'xl/styles.xml',
      content: utf8(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
          '<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>' +
          '<fills count="2"><fill><patternFill patternType="none"/></fill>' +
          '<fill><patternFill patternType="gray125"/></fill></fills>' +
          '<borders count="1"><border/></borders>' +
          '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
          '<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>' +
          '</styleSheet>'
      ),
    },
    { name: SHEET_PATH, content: utf8(buildSheetXml(columns, rows)) },
  ])
}
