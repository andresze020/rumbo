'use client'

import { useId, useRef, useState, useTransition } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Callout } from '@/components/callout'
import { formatCurrency } from '@/lib/format'
import {
  TransactionForm,
  type TransactionFormAccount,
  type TransactionFormCategory,
} from '@/app/dashboard/transactions/transaction-form'
import { type PayeeOption } from '@/app/dashboard/transactions/payee-picker'
import {
  parseTransactionFromPhotoAction,
  parseTransactionFromTranscriptAction,
  sendAssistantMessageAction,
  type AssistantChatMessage,
  type TransactionDraft,
} from './actions'
import { VoiceNoteComposer } from './voice-note-composer'

type ChatItem =
  | { id: string; kind: 'user-text'; content: string }
  | { id: string; kind: 'assistant-text'; content: string }
  | { id: string; kind: 'user-capture'; label: string }
  | { id: string; kind: 'draft'; sourceLabel: string; draft: TransactionDraft }
  | { id: string; kind: 'notice'; variant: 'error' | 'info'; content: string }

type AssistantChatProps = {
  baseCurrency: string
  accounts: TransactionFormAccount[]
  categories: TransactionFormCategory[]
  payees: PayeeOption[]
  returnTo?: string
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10)
}

function newId() {
  return Math.random().toString(36).slice(2)
}

function fileToBase64(file: File): Promise<{ base64: string; mediaType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read that file.'))
    reader.onload = () => {
      const result = String(reader.result ?? '')
      const [, base64 = ''] = result.split(',', 2)
      resolve({ base64, mediaType: file.type })
    }
    reader.readAsDataURL(file)
  })
}

export function AssistantChat({ baseCurrency, accounts, categories, payees, returnTo }: AssistantChatProps) {
  const inputId = useId()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [items, setItems] = useState<ChatItem[]>([])
  const [history, setHistory] = useState<AssistantChatMessage[]>([])
  const [input, setInput] = useState('')
  const [showVoiceComposer, setShowVoiceComposer] = useState(false)
  const [reviewDraft, setReviewDraft] = useState<TransactionDraft | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  function appendItem(item: ChatItem) {
    setItems((current) => [...current, item])
  }

  function handleSend() {
    const text = input.trim()
    if (!text || pending) return

    setInput('')
    appendItem({ id: newId(), kind: 'user-text', content: text })
    const nextHistory: AssistantChatMessage[] = [...history, { role: 'user', content: text }]
    setHistory(nextHistory)

    startTransition(async () => {
      const result = await sendAssistantMessageAction(nextHistory)
      if ('error' in result) {
        appendItem({ id: newId(), kind: 'notice', variant: 'error', content: result.error })
        return
      }
      appendItem({ id: newId(), kind: 'assistant-text', content: result.reply })
      setHistory((current) => [...current, { role: 'assistant', content: result.reply }])
    })
  }

  function handlePickPhoto() {
    fileInputRef.current?.click()
  }

  async function handlePhotoSelected(file: File | undefined) {
    if (!file) return
    appendItem({ id: newId(), kind: 'user-capture', label: `📷 ${file.name || 'Receipt photo'}` })

    let payload: { base64: string; mediaType: string }
    try {
      payload = await fileToBase64(file)
    } catch {
      appendItem({ id: newId(), kind: 'notice', variant: 'error', content: 'Could not read that photo.' })
      return
    }

    startTransition(async () => {
      const result = await parseTransactionFromPhotoAction(payload.base64, payload.mediaType)
      if ('error' in result) {
        appendItem({ id: newId(), kind: 'notice', variant: 'error', content: result.error })
        return
      }
      appendItem({ id: newId(), kind: 'draft', sourceLabel: 'From your receipt photo', draft: result.draft })
    })
  }

  function handleTranscriptSubmit(transcript: string) {
    setShowVoiceComposer(false)
    appendItem({ id: newId(), kind: 'user-capture', label: `🎤 “${transcript}”` })

    startTransition(async () => {
      const result = await parseTransactionFromTranscriptAction(transcript)
      if ('error' in result) {
        appendItem({ id: newId(), kind: 'notice', variant: 'error', content: result.error })
        return
      }
      appendItem({ id: newId(), kind: 'draft', sourceLabel: 'From your voice note', draft: result.draft })
    })
  }

  function openDraftReview(draft: TransactionDraft) {
    setReviewDraft(draft)
    setDialogOpen(true)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex min-h-[16rem] flex-col gap-3 rounded-xl border border-border/70 bg-card/40 p-4">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Ask things like “How much did I spend on groceries this month?” or “Am I over budget on
            anything?”. You can also attach a receipt photo or a voice note to log a transaction.
          </p>
        ) : (
          items.map((item) => (
            <ChatBubble
              key={item.id}
              item={item}
              baseCurrency={baseCurrency}
              onReviewDraft={openDraftReview}
            />
          ))
        )}
        {pending ? <p className="text-xs text-muted-foreground">Thinking…</p> : null}
      </div>

      {showVoiceComposer ? (
        <VoiceNoteComposer
          onCancel={() => setShowVoiceComposer(false)}
          onSubmit={handleTranscriptSubmit}
        />
      ) : null}

      <div className="flex flex-col gap-2 rounded-xl border border-border/70 bg-card/40 p-3">
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={handlePickPhoto} disabled={pending}>
            📷 Add from receipt photo
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowVoiceComposer((v) => !v)}
            disabled={pending}
          >
            🎤 Add from voice note
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              void handlePhotoSelected(file)
            }}
          />
        </div>

        <div className="flex items-end gap-2">
          <Textarea
            id={inputId}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                handleSend()
              }
            }}
            placeholder="Ask about your finances…"
            rows={2}
            className="flex-1"
            disabled={pending}
          />
          <Button type="button" onClick={handleSend} disabled={pending || !input.trim()}>
            Send
          </Button>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="overflow-y-auto max-h-[90dvh] sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Review transaction</DialogTitle>
            <DialogDescription>
              The assistant prefilled this from your input — check the details and adjust anything
              before saving.
            </DialogDescription>
          </DialogHeader>
          {reviewDraft ? (
            accounts.length === 0 ? (
              <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                Create an account first before adding transactions.
              </p>
            ) : (
              <TransactionForm
                accounts={accounts}
                baseCurrency={baseCurrency}
                categories={categories}
                payees={payees}
                defaultDate={reviewDraft.transaction_date || todayIsoDate()}
                defaultType={reviewDraft.transaction_type}
                defaultAmount={String(reviewDraft.amount)}
                defaultCategoryId={reviewDraft.suggested_category_id ?? undefined}
                defaultDescription={reviewDraft.description ?? undefined}
                defaultMerchantName={reviewDraft.merchant_name ?? undefined}
                returnTo={returnTo ?? '/dashboard/assistant'}
                onCancel={() => setDialogOpen(false)}
              />
            )
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ChatBubble({
  item,
  baseCurrency,
  onReviewDraft,
}: {
  item: ChatItem
  baseCurrency: string
  onReviewDraft: (draft: TransactionDraft) => void
}) {
  switch (item.kind) {
    case 'user-text':
      return (
        <div className="ml-auto max-w-[85%] rounded-xl rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground">
          {item.content}
        </div>
      )
    case 'user-capture':
      return (
        <div className="ml-auto max-w-[85%] rounded-xl rounded-br-sm bg-primary/80 px-3 py-2 text-sm text-primary-foreground">
          {item.label}
        </div>
      )
    case 'assistant-text':
      return (
        <div className="mr-auto max-w-[85%] whitespace-pre-wrap rounded-xl rounded-bl-sm border border-border/70 bg-background px-3 py-2 text-sm">
          {item.content}
        </div>
      )
    case 'notice':
      return (
        <Callout variant={item.variant === 'error' ? 'error' : 'info'} className="max-w-[90%]">
          {item.content}
        </Callout>
      )
    case 'draft':
      return (
        <DraftCard
          sourceLabel={item.sourceLabel}
          draft={item.draft}
          baseCurrency={baseCurrency}
          onReview={onReviewDraft}
        />
      )
    default:
      return null
  }
}

function DraftCard({
  sourceLabel,
  draft,
  baseCurrency,
  onReview,
}: {
  sourceLabel: string
  draft: TransactionDraft
  baseCurrency: string
  onReview: (draft: TransactionDraft) => void
}) {
  return (
    <div className="mr-auto w-full max-w-[90%] space-y-2 rounded-xl rounded-bl-sm border border-border/70 bg-background px-4 py-3 text-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{sourceLabel}</p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
        <dt className="text-muted-foreground">Type</dt>
        <dd className="capitalize">{draft.transaction_type}</dd>
        <dt className="text-muted-foreground">Amount</dt>
        <dd className="tabular-nums">{formatCurrency(draft.amount, baseCurrency)}</dd>
        <dt className="text-muted-foreground">Date</dt>
        <dd>{draft.transaction_date}</dd>
        {draft.merchant_name ? (
          <>
            <dt className="text-muted-foreground">Merchant</dt>
            <dd>{draft.merchant_name}</dd>
          </>
        ) : null}
        {draft.suggested_category_name ? (
          <>
            <dt className="text-muted-foreground">Suggested category</dt>
            <dd>{draft.suggested_category_name}</dd>
          </>
        ) : null}
      </dl>
      {draft.confidence_note ? (
        <p className="text-xs text-muted-foreground">Note: {draft.confidence_note}</p>
      ) : null}
      <Button type="button" size="sm" onClick={() => onReview(draft)}>
        Review &amp; save
      </Button>
    </div>
  )
}
