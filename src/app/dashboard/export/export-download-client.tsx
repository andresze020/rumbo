'use client'

import { useState } from 'react'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { cn } from '@/lib/utils'

type ExportKind = 'accounts' | 'categories' | 'transactions'
/** BR-041: CSV for tooling, .xlsx for people who just open the file. */
type ExportFormat = 'csv' | 'xlsx'

type ExportStatus = {
  error: string | null
  lastExported: ExportKind | null
  loading: ExportKind | null
}

const formatOptions: Array<{
  format: ExportFormat
  label: string
  description: string
}> = [
  {
    format: 'xlsx',
    label: 'Excel (.xlsx)',
    description: 'Opens directly in Excel, Sheets or LibreOffice.',
  },
  {
    format: 'csv',
    label: 'CSV',
    description: 'Plain text, best for importing into other tools.',
  },
]

const exportOptions: Array<{
  type: ExportKind
  title: string
  description: string
}> = [
  {
    type: 'transactions',
    title: 'Transactions',
    description: 'Ledger rows, entries, allocations, and import references.',
  },
  {
    type: 'accounts',
    title: 'Accounts',
    description: 'Account metadata with current posted and projected balances.',
  },
  {
    type: 'categories',
    title: 'Categories',
    description: 'Category hierarchy, reporting type, and budget/report flags.',
  },
]

function getFilename(response: Response, exportType: ExportKind, format: ExportFormat) {
  const disposition = response.headers.get('content-disposition') ?? ''
  const match = disposition.match(/filename="([^"]+)"/)

  return match?.[1] ?? `rumbo-${exportType}.${format}`
}

async function getErrorMessage(response: Response) {
  try {
    const body = (await response.json()) as { error?: string }

    return body.error ?? 'Export failed. Please try again.'
  } catch {
    return 'Export failed. Please try again.'
  }
}

export function ExportDownloadClient() {
  const [format, setFormat] = useState<ExportFormat>('xlsx')
  const [status, setStatus] = useState<ExportStatus>({
    error: null,
    lastExported: null,
    loading: null,
  })

  async function downloadExport(exportType: ExportKind) {
    setStatus({
      error: null,
      lastExported: null,
      loading: exportType,
    })

    try {
      const response = await fetch(
        `/dashboard/export/download?type=${exportType}&format=${format}`
      )

      if (!response.ok) {
        setStatus({
          error: await getErrorMessage(response),
          lastExported: null,
          loading: null,
        })
        return
      }

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')

      link.href = url
      link.download = getFilename(response, exportType, format)
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)

      setStatus({
        error: null,
        lastExported: exportType,
        loading: null,
      })
    } catch {
      setStatus({
        error: 'Export failed. Please try again.',
        lastExported: null,
        loading: null,
      })
    }
  }

  const downloadLabel = format === 'xlsx' ? 'Download Excel' : 'Download CSV'

  return (
    <div className="space-y-4">
      {status.error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {status.error}
        </div>
      ) : null}

      {status.lastExported ? (
        <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
          Export prepared.
        </div>
      ) : null}

      <div className="space-y-2">
        <p className="text-sm font-medium">File format</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          {formatOptions.map((option) => (
            <button
              key={option.format}
              type="button"
              aria-pressed={format === option.format}
              onClick={() => setFormat(option.format)}
              className={cn(
                'flex-1 rounded-lg border px-3 py-2 text-left transition-colors',
                format === option.format
                  ? 'border-primary bg-primary/10'
                  : 'border-border hover:bg-muted'
              )}
            >
              <span className="block text-sm font-medium">{option.label}</span>
              <span className="block text-xs text-muted-foreground">
                {option.description}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {exportOptions.map((option) => (
          <Card key={option.type}>
            <CardHeader>
              <CardTitle>{option.title}</CardTitle>
              <CardDescription>{option.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                type="button"
                className="w-full"
                disabled={Boolean(status.loading)}
                onClick={() => downloadExport(option.type)}
              >
                <Download />
                {status.loading === option.type ? 'Exporting' : downloadLabel}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
