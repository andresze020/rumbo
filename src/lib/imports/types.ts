export type CsvRow = Record<string, string>

export type CsvMapping = {
  transaction_date: string
  amount: string
  description: string
  account: string
  category: string
  merchant_name: string
  currency: string
  notes: string
  transaction_type: string
}

export type ImportAccount = {
  id: string
  name: string
  currency_code: string
  institution_name: string | null
}

export type ImportCategory = {
  id: string
  name: string
  category_type: string
  reporting_type: string
  parent_category_id: string | null
  is_archived: boolean
  exclude_from_reports: boolean
}

export type ImportCurrency = {
  code: string
}

// BR-024: a saved column-mapping preset (name + partial CsvMapping + default
// account) the user can reload on a future import.
export type ImportPreset = {
  id: string
  name: string
  mapping: Partial<CsvMapping>
  targetAccountId: string
}

// BR-024: a past import batch shown in the "Import history" / revert section.
export type ImportBatch = {
  id: string
  fileName: string
  status: string
  totalRows: number
  importedCount: number
  invalidRows: number
  duplicateRows: number
  createdAt: string
  /** Set once the batch has been reverted (number of transactions removed). */
  revertedCount: number | null
}

export type MappedImportRow = {
  rowNumber: number
  rawData: CsvRow
  mappedData: {
    transaction_date: string
    amount: string
    description: string
    account_id: string | null
    category_id: string | null
    merchant_name: string | null
    currency_code: string | null
    notes: string | null
    transaction_type: 'income' | 'expense' | 'transfer' | null
  }
  status: 'valid' | 'invalid' | 'duplicate'
  errors: string[]
  warnings: string[]
}
