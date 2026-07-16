'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useToast } from '@/components/toast-provider'

type ArchiveToastProps = {
  /** Server action to call on "Undo" — the same action used to archive/restore. */
  action: (formData: FormData) => void | Promise<void>
  /** Hidden field name the action expects for the entity id, e.g. "account_id". */
  idField: string
  archivedMessage: string
  restoredMessage: string
  undoLabel: string
}

type PendingUndo = {
  id: string
  showArchived: boolean
}

/**
 * Watches for `?archived=1&archived_id=...` / `?unarchived=1` set by an
 * archive/restore server-action redirect, shows a toast (with an "Undo"
 * action when archiving), and strips the flags from the URL. Undo submits a
 * hidden form calling the same action with is_archived=false — the entity id
 * is captured into state on mount so it survives the URL cleanup that
 * follows immediately after.
 */
export function ArchiveToast({
  action,
  idField,
  archivedMessage,
  restoredMessage,
  undoLabel,
}: ArchiveToastProps) {
  const { toast } = useToast()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const hasRun = useRef(false)
  const formRef = useRef<HTMLFormElement>(null)
  const [pendingUndo, setPendingUndo] = useState<PendingUndo | null>(null)

  useEffect(() => {
    if (hasRun.current) return

    const archived = searchParams.get('archived') === '1'
    const unarchived = searchParams.get('unarchived') === '1'
    if (!archived && !unarchived) return
    hasRun.current = true

    const frame = window.requestAnimationFrame(() => {
      if (archived) {
        const entityId = searchParams.get('archived_id')
        const showArchived = searchParams.get('showArchived') === 'true'
        if (entityId) setPendingUndo({ id: entityId, showArchived })

        toast({
          message: archivedMessage,
          action: entityId
            ? { label: undoLabel, onClick: () => formRef.current?.requestSubmit() }
            : undefined,
        })
      } else {
        toast({ message: restoredMessage })
      }

      const params = new URLSearchParams(searchParams.toString())
      params.delete('archived')
      params.delete('unarchived')
      params.delete('archived_id')
      router.replace(params.size ? `${pathname}?${params.toString()}` : pathname, { scroll: false })
    })

    return () => window.cancelAnimationFrame(frame)
    // Run once on mount to consume the redirect flags from the URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!pendingUndo) return null

  return (
    <form ref={formRef} action={action} hidden>
      <input type="hidden" name={idField} value={pendingUndo.id} />
      <input type="hidden" name="is_archived" value="false" />
      <input type="hidden" name="show_archived" value={pendingUndo.showArchived ? 'true' : 'false'} />
    </form>
  )
}
