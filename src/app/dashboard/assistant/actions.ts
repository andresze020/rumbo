'use server'

import { z } from 'zod'
import type Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { getAnthropicClient, ASSISTANT_MODEL } from '@/lib/ai/client'
import { ASSISTANT_TOOLS, executeAssistantTool } from '@/lib/ai/tools'
import { buildAnalysisSystemPrompt, buildTransactionDraftSystemPrompt } from '@/lib/ai/prompts'

const MAX_TOOL_ROUNDS = 6
const MAX_HISTORY_MESSAGES = 20

export type AssistantChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

type HouseholdContext = {
  householdId: string
  baseCurrency: string
  categories: { id: string; name: string; category_type: string; parent_category_id: string | null }[]
}

async function resolveHouseholdContext(): Promise<
  | { ok: true; supabase: Awaited<ReturnType<typeof createClient>>; context: HouseholdContext }
  | { ok: false; error: string }
> {
  const supabase = await createClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return { ok: false, error: 'Your session expired. Please sign in again.' }
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('default_household_id')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError || !profile?.default_household_id) {
    return { ok: false, error: 'Could not load your household.' }
  }

  const householdId = profile.default_household_id as string

  const { data: household, error: householdError } = await supabase
    .from('households')
    .select('id, base_currency')
    .eq('id', householdId)
    .maybeSingle()

  if (householdError || !household) {
    return { ok: false, error: 'Could not load your household.' }
  }

  const { data: categories, error: categoriesError } = await supabase
    .from('categories')
    .select('id, name, category_type, parent_category_id')
    .eq('household_id', householdId)
    .is('deleted_at', null)
    .eq('is_archived', false)

  if (categoriesError) {
    return { ok: false, error: 'Could not load your categories.' }
  }

  return {
    ok: true,
    supabase,
    context: {
      householdId,
      baseCurrency: household.base_currency,
      categories: categories ?? [],
    },
  }
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

function friendlyAssistantError(error: unknown) {
  if (error instanceof Error && error.message.includes('ANTHROPIC_API_KEY')) {
    return 'The AI assistant is not configured yet. Add an ANTHROPIC_API_KEY to enable it.'
  }
  return 'The assistant could not process your request right now. Please try again in a moment.'
}

export async function sendAssistantMessageAction(
  history: AssistantChatMessage[]
): Promise<{ reply: string } | { error: string }> {
  const recentHistory = history.slice(-MAX_HISTORY_MESSAGES)

  if (recentHistory.length === 0 || recentHistory[recentHistory.length - 1].role !== 'user') {
    return { error: 'Send a message to the assistant first.' }
  }

  const resolved = await resolveHouseholdContext()
  if (!resolved.ok) return { error: resolved.error }
  const { supabase, context } = resolved

  const messages: Anthropic.MessageParam[] = recentHistory.map((message) => ({
    role: message.role,
    content: message.content,
  }))

  try {
    const anthropic = getAnthropicClient()
    const system = buildAnalysisSystemPrompt({ baseCurrency: context.baseCurrency, today: today() })

    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
      const response = await anthropic.messages.create({
        model: ASSISTANT_MODEL,
        max_tokens: 1024,
        system,
        tools: ASSISTANT_TOOLS,
        messages,
      })

      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
      )

      if (response.stop_reason !== 'tool_use' || toolUseBlocks.length === 0) {
        const text = response.content
          .filter((block): block is Anthropic.TextBlock => block.type === 'text')
          .map((block) => block.text)
          .join('\n')
          .trim()

        return { reply: text || "I don't have an answer for that right now." }
      }

      messages.push({ role: 'assistant', content: response.content })

      const toolResults: Anthropic.ToolResultBlockParam[] = []
      for (const toolUse of toolUseBlocks) {
        try {
          const result = await executeAssistantTool(
            supabase,
            context.householdId,
            toolUse.name,
            (toolUse.input ?? {}) as Record<string, unknown>
          )
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: JSON.stringify(result ?? null),
          })
        } catch (toolError) {
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            is_error: true,
            content: toolError instanceof Error ? toolError.message : 'Tool execution failed.',
          })
        }
      }

      messages.push({ role: 'user', content: toolResults })
    }

    return { reply: "I gathered some data but couldn't put together a final answer — could you rephrase your question?" }
  } catch (error) {
    return { error: friendlyAssistantError(error) }
  }
}

const transactionDraftSchema = z.object({
  transaction_type: z.enum(['income', 'expense']),
  amount: z.number().positive(),
  transaction_date: z.string(),
  merchant_name: z.string().nullable(),
  description: z.string().nullable(),
  suggested_category_id: z.string().nullable(),
  suggested_category_name: z.string().nullable(),
  confidence_note: z.string().nullable(),
})

export type TransactionDraft = z.infer<typeof transactionDraftSchema>

const RECORD_DRAFT_TOOL: Anthropic.Tool = {
  name: 'record_transaction_draft',
  description: 'Record the structured transaction data extracted from the input.',
  input_schema: {
    type: 'object',
    properties: {
      transaction_type: { type: 'string', enum: ['income', 'expense'] },
      amount: { type: 'number', description: 'Positive amount in the currency shown on the input.' },
      transaction_date: { type: 'string', description: 'Date in YYYY-MM-DD format.' },
      merchant_name: { type: ['string', 'null'], description: 'Merchant or counterparty, or null.' },
      description: { type: ['string', 'null'], description: 'Short description of the transaction, or null.' },
      suggested_category_id: { type: ['string', 'null'], description: 'Best matching category id from the provided list, or null.' },
      suggested_category_name: { type: ['string', 'null'], description: 'Name of the suggested category, or null.' },
      confidence_note: { type: ['string', 'null'], description: 'Brief note about uncertainty, or null if confident.' },
    },
    required: [
      'transaction_type',
      'amount',
      'transaction_date',
      'merchant_name',
      'description',
      'suggested_category_id',
      'suggested_category_name',
      'confidence_note',
    ],
  },
}

type DraftInput =
  | { kind: 'image'; mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'; base64: string }
  | { kind: 'text'; text: string }

async function extractTransactionDraft(
  input: DraftInput
): Promise<{ draft: TransactionDraft } | { error: string }> {
  const resolved = await resolveHouseholdContext()
  if (!resolved.ok) return { error: resolved.error }
  const { context } = resolved

  const system = buildTransactionDraftSystemPrompt({
    baseCurrency: context.baseCurrency,
    today: today(),
    categories: context.categories,
  })

  const userContent: Anthropic.ContentBlockParam[] =
    input.kind === 'image'
      ? [
          { type: 'image', source: { type: 'base64', media_type: input.mediaType, data: input.base64 } },
          { type: 'text', text: 'Extract the transaction from this receipt photo.' },
        ]
      : [{ type: 'text', text: `Extract the transaction from this voice note transcript:\n\n"${input.text}"` }]

  try {
    const anthropic = getAnthropicClient()
    const response = await anthropic.messages.create({
      model: ASSISTANT_MODEL,
      max_tokens: 1024,
      system,
      tools: [RECORD_DRAFT_TOOL],
      tool_choice: { type: 'tool', name: 'record_transaction_draft' },
      messages: [{ role: 'user', content: userContent }],
    })

    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
    )

    if (!toolUse) {
      return { error: "The assistant couldn't read that input. Try a clearer photo or recording." }
    }

    const parsed = transactionDraftSchema.safeParse(toolUse.input)
    if (!parsed.success) {
      return { error: "The assistant couldn't extract a valid transaction from that input." }
    }

    return { draft: parsed.data }
  } catch (error) {
    return { error: friendlyAssistantError(error) }
  }
}

const MAX_IMAGE_BASE64_LENGTH = 6_000_000 // ~4.5MB decoded, comfortably under Anthropic's per-image limit

export async function parseTransactionFromPhotoAction(
  base64: string,
  mediaType: string
): Promise<{ draft: TransactionDraft } | { error: string }> {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const
  if (!allowedTypes.includes(mediaType as (typeof allowedTypes)[number])) {
    return { error: 'Unsupported image type. Use JPEG, PNG, WEBP, or GIF.' }
  }
  if (!base64 || base64.length > MAX_IMAGE_BASE64_LENGTH) {
    return { error: 'That image is too large. Try a smaller photo.' }
  }

  return extractTransactionDraft({
    kind: 'image',
    mediaType: mediaType as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif',
    base64,
  })
}

export async function parseTransactionFromTranscriptAction(
  transcript: string
): Promise<{ draft: TransactionDraft } | { error: string }> {
  const trimmed = transcript.trim()
  if (!trimmed) {
    return { error: 'Record or type what you want to log first.' }
  }
  if (trimmed.length > 2000) {
    return { error: 'That note is too long to process.' }
  }

  return extractTransactionDraft({ kind: 'text', text: trimmed })
}
