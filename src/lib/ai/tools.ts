import type Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

/**
 * Read-only tools the assistant can call to ground its answers in the
 * household's real data. Every executor scopes its query to `householdId`,
 * which is resolved server-side from the authenticated session — the model
 * never supplies it, so it cannot read another household's data. The
 * underlying RPCs additionally enforce `is_household_member` via RLS.
 */
export const ASSISTANT_TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_account_balances',
    description:
      'Get the current posted, pending, and projected balances for every account in the household, in both the account currency and the household base currency.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_monthly_summary',
    description:
      'Get total income, expenses, savings, and savings rate for a given calendar month. Use this for questions like "how much did I earn/spend/save in <month>".',
    input_schema: {
      type: 'object',
      properties: {
        month: {
          type: 'string',
          description: 'Any date (YYYY-MM-DD) within the target month, e.g. "2026-06-01" for June 2026.',
        },
      },
      required: ['month'],
    },
  },
  {
    name: 'get_monthly_expenses_by_category',
    description:
      'Get the expense breakdown by category for a given calendar month, including amounts in the base currency and transaction counts. Use this for questions about where the money went or which category had the most spending.',
    input_schema: {
      type: 'object',
      properties: {
        month: {
          type: 'string',
          description: 'Any date (YYYY-MM-DD) within the target month, e.g. "2026-06-01" for June 2026.',
        },
      },
      required: ['month'],
    },
  },
  {
    name: 'get_monthly_budget_details',
    description:
      'Get planned vs. actual amounts per category for a given budget month, including variance. Use this for questions about whether the household is on budget or over/under in a category.',
    input_schema: {
      type: 'object',
      properties: {
        month: {
          type: 'string',
          description: 'Any date (YYYY-MM-DD) within the target budget month, e.g. "2026-06-01" for June 2026.',
        },
      },
      required: ['month'],
    },
  },
  {
    name: 'search_transactions',
    description:
      'Search the household transaction list with optional filters. Use this to find specific transactions, recent activity, or to answer questions that need transaction-level detail rather than aggregates.',
    input_schema: {
      type: 'object',
      properties: {
        from_date: { type: 'string', description: 'Start date (YYYY-MM-DD), inclusive.' },
        to_date: { type: 'string', description: 'End date (YYYY-MM-DD), inclusive.' },
        transaction_type: {
          type: 'string',
          enum: ['income', 'expense', 'transfer'],
          description: 'Filter by transaction type.',
        },
        search_text: {
          type: 'string',
          description: 'Free-text match against the transaction description or merchant name.',
        },
        limit: {
          type: 'integer',
          description: 'Maximum number of transactions to return (default 20, max 50).',
        },
      },
      required: [],
    },
  },
]

function clampLimit(limit: unknown) {
  const parsed = typeof limit === 'number' ? limit : Number(limit)
  if (!Number.isFinite(parsed) || parsed <= 0) return 20
  return Math.min(Math.trunc(parsed), 50)
}

/** Executes a tool call by name, scoping every query to the resolved household. */
export async function executeAssistantTool(
  supabase: SupabaseServerClient,
  householdId: string,
  toolName: string,
  toolInput: Record<string, unknown>
): Promise<unknown> {
  switch (toolName) {
    case 'get_account_balances': {
      const { data, error } = await supabase.rpc('get_account_balances', {
        p_household_id: householdId,
      })
      if (error) throw error
      return data
    }

    case 'get_monthly_summary': {
      const { data, error } = await supabase.rpc('get_monthly_dashboard_summary', {
        p_household_id: householdId,
        p_month: String(toolInput.month ?? ''),
      })
      if (error) throw error
      return data
    }

    case 'get_monthly_expenses_by_category': {
      const { data, error } = await supabase.rpc('get_monthly_expenses_by_category', {
        p_household_id: householdId,
        p_month: String(toolInput.month ?? ''),
      })
      if (error) throw error
      return data
    }

    case 'get_monthly_budget_details': {
      const { data, error } = await supabase.rpc('get_monthly_budget_details', {
        p_household_id: householdId,
        p_budget_month: String(toolInput.month ?? ''),
      })
      if (error) throw error
      return data
    }

    case 'search_transactions': {
      let query = supabase
        .from('transactions')
        .select(
          'id, transaction_date, transaction_type, status, description, merchant_name, transaction_allocations(amount_base_currency, categories(name))'
        )
        .eq('household_id', householdId)
        .is('deleted_at', null)
        .order('transaction_date', { ascending: false })
        .limit(clampLimit(toolInput.limit))

      if (typeof toolInput.from_date === 'string' && toolInput.from_date) {
        query = query.gte('transaction_date', toolInput.from_date)
      }
      if (typeof toolInput.to_date === 'string' && toolInput.to_date) {
        query = query.lte('transaction_date', toolInput.to_date)
      }
      if (typeof toolInput.transaction_type === 'string' && toolInput.transaction_type) {
        query = query.eq('transaction_type', toolInput.transaction_type)
      }
      if (typeof toolInput.search_text === 'string' && toolInput.search_text.trim()) {
        // Strip characters with special meaning in the PostgREST or() filter
        // syntax (commas separate conditions, parentheses group them) so the
        // term can only ever act as a plain substring match.
        const term = toolInput.search_text.trim().replace(/[,()\\%_]/g, ' ').trim()
        if (term) {
          query = query.or(`description.ilike.%${term}%,merchant_name.ilike.%${term}%`)
        }
      }

      const { data, error } = await query
      if (error) throw error
      return data
    }

    default:
      throw new Error(`Unknown assistant tool: ${toolName}`)
  }
}
