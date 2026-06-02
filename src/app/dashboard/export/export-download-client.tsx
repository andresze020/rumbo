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

type ExportKind = 'accounts' | 'categories' | 'transactions'

type ExportStatus = {
  error: string | null
  lastExported: ExportKind | null
  loading: ExportKind | null
}

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

function getFilename(response: Response, exportType: ExportKind) {
  const disposition = response.headers.get('content-disposition') ?? ''
  const match = disposition.match(/filename="([^"]+)"/)

  return match?.[1] ?? `app-finanzas-${exportType}.csv`
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
      const response = await fetch(`/dashboard/export/download?type=${exportType}`)

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
      link.download = getFilename(response, exportType)
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

  return (
    <div className="space-y-4">
      {status.error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {status.error}
        </div>
      ) : null}

      {status.lastExported ? (
        <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
          CSV export prepared.
        </div>
      ) : null}

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
                {status.loading === option.type ? 'Exporting' : 'Download CSV'}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
