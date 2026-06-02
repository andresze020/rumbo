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
