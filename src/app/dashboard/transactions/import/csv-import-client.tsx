'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { createCsvImportAction } from './actions'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'
import { Callout } from '@/components/callout'
import { SubmitButton } from '@/components/submit-button'
import { parseCsv, guessCsvMapping } from '@/lib/imports/csv-parser'
import { buildValidatedRows } from '@/lib/imports/csv-validation'
import type {
  CsvMapping,
  CsvRow,
  ImportAccount,
  ImportCategory,
  ImportCurrency,
} from '@/lib/imports/types'

type CsvImportClientProps = {
  householdName: string
  baseCurrency: string
  accounts: ImportAccount[]
  categories: ImportCategory[]
  currencies: ImportCurrency[]
  errorMessage: string | null
  imported: boolean
  batchId: string | null
}

const emptyMapping: CsvMapping = {
  transaction_date: '',
  amount: '',
  description: '',
  account: '',
  category: '',
  merchant_name: '',
  currency: '',
  notes: '',
  transaction_type: '',
}

const targetFields: Array<{
  key: keyof CsvMapping
  label: string
  required?: boolean
}> = [
  { key: 'transaction_date', label: 'Transaction date', required: true },
  { key: 'amount', label: 'Amount', required: true },
  { key: 'description', label: 'Description', required: true },
  { key: 'account', label: 'Account' },
  { key: 'category', label: 'Category' },
  { key: 'merchant_name', label: 'Merchant' },
  { key: 'currency', label: 'Currency' },
  { key: 'notes', label: 'Notes' },
  { key: 'transaction_type', label: 'Transaction type' },
]

function getAccountLabel(account: ImportAccount) {
  return [account.name, account.institution_name || null, account.currency_code]
    .filter(Boolean)
    .join(' · ')
}

async function sha256(text: string) {
  const bytes = new TextEncoder().encode(text)
  const hashBuffer = await crypto.subtle.digest('SHA-256', bytes)
  const hashArray = Array.from(new Uint8Array(hashBuffer))

  return hashArray.map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function formatRowCount(count: number) {
  return `${count} row${count === 1 ? '' : 's'}`
}

function formatColumnCount(count: number) {
  return `${count} column${count === 1 ? '' : 's'}`
}

export function CsvImportClient({
  householdName,
  baseCurrency,
  accounts,
  categories,
  currencies,
  errorMessage,
  imported,
  batchId,
}: CsvImportClientProps) {
  const [fileName, setFileName] = useState('')
  const [fileHash, setFileHash] = useState('')
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<CsvRow[]>([])
  const [mapping, setMapping] = useState<CsvMapping>(emptyMapping)
  const [targetAccountId, setTargetAccountId] = useState('')
  const [fileError, setFileError] = useState<string | null>(null)
  const previewRows = useMemo(
    () =>
      buildValidatedRows({
        rows,
        mapping,
        targetAccountId,
        accounts,
        categories,
        currencies,
      }),
    [accounts, categories, currencies, mapping, rows, targetAccountId]
  )
  const validRows = previewRows.filter((row) => row.status === 'valid')
  const invalidRows = previewRows.filter((row) => row.status === 'invalid')
  const duplicateRows = previewRows.filter((row) => row.status === 'duplicate')
  const hasNonBaseAccounts = accounts.some(
    (account) => account.currency_code !== baseCurrency
  )
  const canImport =
    Boolean(fileName) &&
    Boolean(mapping.transaction_date) &&
    Boolean(mapping.amount) &&
    Boolean(mapping.description) &&
    (Boolean(mapping.account) || Boolean(targetAccountId)) &&
    validRows.length > 0
  const rowsJson = JSON.stringify(
    previewRows.map((row) => ({
      rowNumber: row.rowNumber,
      rawData: row.rawData,
      mappedData: row.mappedData,
    }))
  )

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]

    setFileError(null)
    setFileName('')
    setFileHash('')
    setHeaders([])
    setRows([])
    setMapping(emptyMapping)

    if (!file) {
      return
    }

    if (!file.name.toLowerCase().endsWith('.csv')) {
      setFileError('Select a .csv file.')
      return
    }

    const text = await file.text()
    const parsedCsv = parseCsv(text)

    if (!parsedCsv.headers.length || !parsedCsv.rows.length) {
      setFileError('CSV must include headers and at least one data row.')
      return
    }

    setFileName(file.name)
    setFileHash(await sha256(text))
    setHeaders(parsedCsv.headers)
    setRows(parsedCsv.rows)
    setMapping({ ...emptyMapping, ...guessCsvMapping(parsedCsv.headers) })
  }

  function updateMapping(field: keyof CsvMapping, columnName: string) {
    setMapping((currentMapping) => ({
      ...currentMapping,
      [field]: columnName,
    }))
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        eyebrow={householdName}
        title="Import CSV"
        description="Upload, map, preview, and confirm transaction imports."
        actions={
          <Link
            href="/dashboard/transactions"
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            Back to transactions
          </Link>
        }
      />

      {errorMessage ? <Callout variant="error">{errorMessage}</Callout> : null}

      {imported ? (
        <Callout variant="success">
          CSV import completed.
          {batchId ? <span className="ml-1">Batch: {batchId}</span> : null}
        </Callout>
      ) : null}

      {!accounts.length ? (
        <Callout variant="error">
          Create an active account before importing transactions.
        </Callout>
      ) : null}

      {!categories.length ? (
        <Callout variant="error">
          Create active income and expense categories before importing.
        </Callout>
      ) : null}

      {hasNonBaseAccounts ? (
        <Callout>
          Non-{baseCurrency} account rows use saved exchange rates for the row
          date. Rows without a usable rate are kept in the import log as
          invalid instead of being converted at 1:1.
        </Callout>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>1. Upload CSV</CardTitle>
          <CardDescription>
            CSV files must include a header row. Base currency: {baseCurrency}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="csv_file">CSV file</Label>
            <Input
              id="csv_file"
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileChange}
            />
          </div>

          {fileError ? <Callout variant="error">{fileError}</Callout> : null}

          {fileName ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">File</p>
                <p className="mt-1 font-medium">{fileName}</p>
              </div>
              <div className="rounded-lg bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">Rows</p>
                <p className="mt-1 font-medium">{formatRowCount(rows.length)}</p>
              </div>
              <div className="rounded-lg bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">Columns</p>
                <p className="mt-1 font-medium">
                  {formatColumnCount(headers.length)}
                </p>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {!headers.length ? (
        <EmptyState
          title="No CSV preview yet"
          description="Choose a CSV file with a header row to unlock column mapping, validation, and import confirmation."
        />
      ) : null}

      {headers.length ? (
        <Card>
          <CardHeader>
            <CardTitle>2. Map columns</CardTitle>
            <CardDescription>
              Required fields are date, amount, and description. Select a default
              account when the CSV has no account column.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {targetFields.map((field) => (
                <div key={field.key} className="space-y-2">
                  <Label htmlFor={`mapping_${field.key}`}>
                    {field.label}
                    {field.required ? ' *' : ''}
                  </Label>
                  <select
                    id={`mapping_${field.key}`}
                    value={mapping[field.key]}
                    onChange={(event) =>
                      updateMapping(field.key, event.target.value)
                    }
                    className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <option value="">Not mapped</option>
                    {headers.map((header) => (
                      <option key={header} value={header}>
                        {header}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <Label htmlFor="target_account_id">Default target account</Label>
              <select
                id="target_account_id"
                value={targetAccountId}
                onChange={(event) => setTargetAccountId(event.target.value)}
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="">No default account</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {getAccountLabel(account)}
                  </option>
                ))}
              </select>
              {!mapping.account && !targetAccountId ? (
                <p className="text-sm text-muted-foreground">
                  Required when Account is not mapped from the CSV.
                </p>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2">
              {headers.map((header) => (
                <Badge key={header} variant="outline">
                  {header}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {headers.length ? (
        <Card>
          <CardHeader>
            <CardTitle>3. Preview and validate</CardTitle>
            <CardDescription>
              Invalid and duplicate rows are preserved in the import log but are
              not converted into transactions.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">Valid</p>
                <p className="mt-1 text-lg font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                  {validRows.length}
                </p>
              </div>
              <div className="rounded-lg bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">Invalid</p>
                <p className={`mt-1 text-lg font-semibold tabular-nums ${invalidRows.length > 0 ? 'text-red-600 dark:text-red-400' : ''}`}>
                  {invalidRows.length}
                </p>
              </div>
              <div className="rounded-lg bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">Duplicates</p>
                <p className={`mt-1 text-lg font-semibold tabular-nums ${duplicateRows.length > 0 ? 'text-amber-600 dark:text-amber-400' : ''}`}>
                  {duplicateRows.length}
                </p>
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[48rem] text-sm">
                <thead className="bg-muted/50 text-left">
                  <tr>
                    <th className="px-3 py-2 font-medium">Row</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Date</th>
                    <th className="px-3 py-2 font-medium">Description</th>
                    <th className="px-3 py-2 font-medium">Amount</th>
                    <th className="px-3 py-2 font-medium">Type</th>
                    <th className="px-3 py-2 font-medium">Messages</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {previewRows.slice(0, 50).map((row) => (
                    <tr key={row.rowNumber}>
                      <td className="px-3 py-2">{row.rowNumber}</td>
                      <td className="px-3 py-2">
                        <Badge
                          variant={
                            row.status === 'valid'
                              ? 'secondary'
                              : row.status === 'duplicate'
                                ? 'outline'
                                : 'destructive'
                          }
                        >
                          {row.status}
                        </Badge>
                      </td>
                      <td className="px-3 py-2">
                        {row.mappedData.transaction_date || '-'}
                      </td>
                      <td className="px-3 py-2">
                        {row.mappedData.description || '-'}
                      </td>
                      <td className="px-3 py-2">
                        {row.mappedData.amount || '-'}
                      </td>
                      <td className="px-3 py-2">
                        {row.mappedData.transaction_type || '-'}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {[...row.errors, ...row.warnings].join(' ') || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {previewRows.length > 50 ? (
              <p className="text-sm text-muted-foreground">
                Showing first 50 rows of {previewRows.length}.
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {headers.length ? (
        <Card>
          <CardHeader>
            <CardTitle>4. Confirm import</CardTitle>
            <CardDescription>
              Confirm to create one import batch, all import rows, and posted
              ledger transactions for valid rows.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={createCsvImportAction} className="space-y-4">
              <input type="hidden" name="file_name" value={fileName} />
              <input type="hidden" name="file_hash" value={fileHash} />
              <input
                type="hidden"
                name="target_account_id"
                value={targetAccountId}
              />
              <input
                type="hidden"
                name="mapping_json"
                value={JSON.stringify(mapping)}
              />
              <input type="hidden" name="rows_json" value={rowsJson} />

              <SubmitButton
                type="submit"
                disabled={!canImport || !accounts.length || !categories.length}
                pendingText="Importing rows"
              >
                Import valid rows
              </SubmitButton>

              {!canImport ? (
                <p className="text-sm text-muted-foreground">
                  Complete required mappings, select an account if needed, and
                  make sure at least one row is valid.
                </p>
              ) : null}
            </form>
          </CardContent>
        </Card>
      ) : null}
    </main>
  )
}
