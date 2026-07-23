'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { X } from 'lucide-react'
import {
  createCsvImportAction,
  deleteCsvPresetAction,
  revertCsvImportAction,
  saveCsvPresetAction,
} from './actions'
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
import { ArchiveConfirmButton } from '@/components/archive-confirm-button'
import { parseCsv, guessCsvMapping } from '@/lib/imports/csv-parser'
import { buildValidatedRows } from '@/lib/imports/csv-validation'
import type {
  CsvMapping,
  CsvRow,
  ImportAccount,
  ImportBatch,
  ImportCategory,
  ImportCurrency,
  ImportPreset,
} from '@/lib/imports/types'
import { nativeSelectCls } from '@/lib/form-styles'

type CsvImportClientProps = {
  householdName: string
  baseCurrency: string
  accounts: ImportAccount[]
  categories: ImportCategory[]
  currencies: ImportCurrency[]
  presets: ImportPreset[]
  batches: ImportBatch[]
  errorMessage: string | null
  imported: boolean
  batchId: string | null
  presetSaved: boolean
  presetDeleted: boolean
  revertedCount: number | null
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

function formatBatchDate(value: string) {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString('en-CA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function CsvImportClient({
  householdName,
  baseCurrency,
  accounts,
  categories,
  currencies,
  presets,
  batches,
  errorMessage,
  imported,
  batchId,
  presetSaved,
  presetDeleted,
  revertedCount,
}: CsvImportClientProps) {
  const [fileName, setFileName] = useState('')
  const [fileHash, setFileHash] = useState('')
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<CsvRow[]>([])
  const [mapping, setMapping] = useState<CsvMapping>(emptyMapping)
  const [targetAccountId, setTargetAccountId] = useState('')
  const [presetName, setPresetName] = useState('')
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

  // Load a saved preset onto the current file: keep only mapped columns that
  // actually exist in this CSV's headers (so a preset built for one export
  // doesn't map phantom columns onto another), and only reuse the default
  // account if it still exists.
  function applyPreset(presetId: string) {
    const preset = presets.find((p) => p.id === presetId)
    if (!preset) return
    const applied: CsvMapping = { ...emptyMapping }
    for (const key of Object.keys(emptyMapping) as (keyof CsvMapping)[]) {
      const column = preset.mapping[key]
      applied[key] = column && headers.includes(column) ? column : ''
    }
    setMapping(applied)
    setTargetAccountId(
      preset.targetAccountId && accounts.some((a) => a.id === preset.targetAccountId)
        ? preset.targetAccountId
        : ''
    )
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

      {presetSaved ? (
        <Callout variant="success">Mapping saved. It&apos;s ready to reuse next time.</Callout>
      ) : null}
      {presetDeleted ? (
        <Callout variant="success">Saved mapping deleted.</Callout>
      ) : null}
      {revertedCount !== null ? (
        <Callout variant="success">
          Import reverted — {revertedCount} transaction{revertedCount === 1 ? '' : 's'} removed.
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
                    className={nativeSelectCls}
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
                className={nativeSelectCls}
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

            {/* ── BR-024: saved column-mapping presets ─────────────────── */}
            <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
              <div>
                <p className="text-sm font-medium">Saved mappings</p>
                <p className="text-xs text-muted-foreground">
                  Reuse a column mapping for a recurring bank export.
                </p>
              </div>

              {presets.length ? (
                <div className="flex flex-wrap gap-2">
                  {presets.map((preset) => (
                    <span
                      key={preset.id}
                      className="inline-flex items-center gap-1 rounded-full border bg-background py-0.5 pl-3 pr-1 text-xs"
                    >
                      <button
                        type="button"
                        onClick={() => applyPreset(preset.id)}
                        className="font-medium hover:text-primary"
                      >
                        {preset.name}
                      </button>
                      <form action={deleteCsvPresetAction}>
                        <input type="hidden" name="preset_id" value={preset.id} />
                        <button
                          type="submit"
                          aria-label={`Delete saved mapping ${preset.name}`}
                          className="flex size-5 items-center justify-center rounded-full text-muted-foreground hover:text-destructive"
                        >
                          <X className="size-3" aria-hidden="true" />
                        </button>
                      </form>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No saved mappings yet.</p>
              )}

              <form
                action={saveCsvPresetAction}
                className="flex flex-wrap items-end gap-2"
              >
                <input type="hidden" name="mapping_json" value={JSON.stringify(mapping)} />
                <input
                  type="hidden"
                  name="target_account_id"
                  value={targetAccountId}
                />
                <div className="min-w-0 flex-1 space-y-1">
                  <Label htmlFor="preset_name">Save current mapping as</Label>
                  <Input
                    id="preset_name"
                    name="preset_name"
                    value={presetName}
                    onChange={(event) => setPresetName(event.target.value)}
                    placeholder="e.g. Chase checking export"
                    maxLength={80}
                  />
                </div>
                <SubmitButton
                  type="submit"
                  variant="outline"
                  disabled={!presetName.trim() || !mapping.transaction_date}
                  pendingText="Saving…"
                >
                  Save mapping
                </SubmitButton>
              </form>
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

      {/* ── BR-024: import history + revert ──────────────────────────── */}
      {batches.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Import history</CardTitle>
            <CardDescription>
              Revert a past import to remove the transactions it created. Reverted
              rows are soft-deleted (kept for audit) and drop out of balances and
              reports.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {batches.map((batch) => {
              const isReverted = batch.status === 'reverted'
              return (
                <div
                  key={batch.id}
                  className="flex flex-wrap items-center gap-3 rounded-lg border p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{batch.fileName}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatBatchDate(batch.createdAt)} · {batch.importedCount} imported
                      {batch.invalidRows ? ` · ${batch.invalidRows} invalid` : ''}
                      {batch.duplicateRows ? ` · ${batch.duplicateRows} duplicate` : ''}
                    </p>
                  </div>
                  {isReverted ? (
                    <Badge variant="outline">
                      Reverted
                      {batch.revertedCount !== null ? ` · ${batch.revertedCount}` : ''}
                    </Badge>
                  ) : batch.importedCount > 0 ? (
                    <ArchiveConfirmButton
                      action={revertCsvImportAction}
                      hiddenFields={{ batch_id: batch.id }}
                      triggerLabel="Revert"
                      pendingLabel="Reverting…"
                      title="Revert this import?"
                      description={`This removes the ${batch.importedCount} transaction${
                        batch.importedCount === 1 ? '' : 's'
                      } created by "${batch.fileName}". They're soft-deleted (kept for audit) and drop out of balances and reports.`}
                      cancelLabel="Cancel"
                      confirmLabel="Revert import"
                    />
                  ) : (
                    <Badge variant="outline">No transactions</Badge>
                  )}
                </div>
              )
            })}
          </CardContent>
        </Card>
      ) : null}
    </main>
  )
}
