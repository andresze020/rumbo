import { PageLoading } from '@/components/page-loading'

export default function CsvImportLoading() {
  return (
    <PageLoading
      title="Import CSV"
      description="Loading accounts, categories, and import options."
    />
  )
}
