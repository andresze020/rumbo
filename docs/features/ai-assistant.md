# AI Assistant

## Status
**Implemented — merged in v0.19.0.**
Available in all dashboard pages as a floating drawer. No database schema changes required.

---

## Context

Users frequently need quick answers about their finances ("¿cuánto gasté en restaurantes este mes?", "¿estoy dentro del presupuesto?") without navigating between pages. They also receive paper receipts and expense notifications that are tedious to log manually.

The AI assistant addresses both needs:
1. **Financial Q&A** — answers questions grounded in real household data (balances, spending, budgets, transaction history).
2. **Transaction capture** — extracts structured transaction drafts from receipt photos or voice notes and pre-fills the transaction form for review.

---

## Entry Point

The assistant is accessible from every dashboard page via a floating action button (Bot icon `🤖`) positioned above the `+` add-transaction FAB in the bottom-right corner.

Clicking the button opens a **right-side Sheet panel** — the user stays on their current page while the conversation takes place in the drawer. No navigation away is required.

---

## Architecture

### Model
- **Claude claude-sonnet-4-6** via the Anthropic SDK (`@anthropic-ai/sdk`)
- API key configured via `ANTHROPIC_API_KEY` in `.env.local`

### Modes

| Mode | Trigger | How it works |
|---|---|---|
| Financial Q&A | Text message in the chat | Agentic loop: Claude calls read-only tools to fetch data, then answers |
| Receipt capture | "Add from receipt photo" button | Single tool-forced call with image input → transaction draft |
| Voice capture | "Add from voice note" button | Records audio, transcribes to text, same as receipt capture path |

### Agentic loop (Q&A)
1. User message + conversation history sent to Claude with a set of read-only tools.
2. Claude calls one or more tools to fetch real household data.
3. Tool results are appended to the message thread and Claude is called again.
4. Loop repeats up to **6 rounds** (`MAX_TOOL_ROUNDS`).
5. When Claude stops requesting tools, the final text reply is returned to the UI.

### Security
- `householdId` is resolved **server-side** from the authenticated Supabase session — the model never receives or supplies it.
- All tool executors scope every query to the resolved `householdId`.
- Supabase RLS policies additionally enforce `is_household_member` at the database layer.
- The assistant has **read-only** access. It cannot create, update, or delete any data directly.

---

## Available Tools (Q&A mode)

| Tool | What it returns | Backing RPC / table |
|---|---|---|
| `get_account_balances` | Posted, pending, and projected balance for every account (in account currency and base currency) | `get_account_balances` RPC |
| `get_monthly_summary` | Total income, expenses, savings, and savings rate for a calendar month | `get_monthly_dashboard_summary` RPC |
| `get_monthly_expenses_by_category` | Expense breakdown by category for a month (amount + transaction count) | `get_monthly_expenses_by_category` RPC |
| `get_monthly_budget_details` | Planned vs. actual per category, with variance | `get_monthly_budget_details` RPC |
| `search_transactions` | Transaction list with optional filters: date range, type, free-text search | `transactions` table + `transaction_allocations` |

All tools are scoped to the authenticated household and enforce read-only access.

---

## Transaction Capture

When a user attaches a receipt photo or submits a voice note transcript, a **separate extraction call** is made to Claude with a `record_transaction_draft` tool forced as the only allowed output.

The extraction prompt includes:
- Today's date and household base currency
- The household's full category list (id + name + type) to enable category suggestion

The model returns a structured `TransactionDraft`:

```ts
type TransactionDraft = {
  transaction_type: 'income' | 'expense'
  amount: number
  transaction_date: string          // YYYY-MM-DD
  merchant_name: string | null
  description: string | null
  suggested_category_id: string | null
  suggested_category_name: string | null
  confidence_note: string | null
}
```

The draft is shown as a card in the chat with a "Review & save" button that opens the transaction form pre-filled with the extracted values. The user reviews and can adjust any field before saving.

---

## Key Files

| File | Purpose |
|---|---|
| `src/components/assistant-drawer.tsx` | FAB button + Sheet panel, lazy-loads context on open |
| `src/app/dashboard/assistant/assistant-chat.tsx` | Full chat UI — bubbles, voice composer, photo input, draft card, transaction form dialog |
| `src/app/dashboard/assistant/actions.ts` | Server actions: `sendAssistantMessageAction`, `parseTransactionFromPhotoAction`, `parseTransactionFromTranscriptAction`, `getAssistantContextAction` |
| `src/app/dashboard/assistant/voice-note-composer.tsx` | In-browser audio recorder + transcription UI |
| `src/app/dashboard/assistant/page.tsx` | Standalone page (kept for direct URL access; not linked from nav) |
| `src/lib/ai/client.ts` | Anthropic SDK client (lazy singleton, reads `ANTHROPIC_API_KEY`) |
| `src/lib/ai/tools.ts` | Tool definitions + executors for the agentic loop |
| `src/lib/ai/prompts.ts` | System prompts for Q&A mode and extraction mode |

---

## Configuration

```env
# .env.local
ANTHROPIC_API_KEY=sk-ant-api03-...
```

The client is initialized lazily — the key is only required when the assistant is first used. If the key is missing, the assistant returns a clear configuration error instead of a generic failure.

---

## Conversation Limits

| Limit | Value | Reason |
|---|---|---|
| Max tool rounds per message | 6 | Prevents runaway agentic loops |
| Max history messages sent | 20 | Keeps context window cost bounded |
| Max image size (base64) | ~4.5 MB decoded | Anthropic per-image limit |
| Max voice transcript length | 2,000 chars | Reasonable voice note cap |

---

## Prompt Behavior

- **Language:** Claude replies in the same language the user writes in (Spanish or English).
- **Q&A:** Always calls a tool to fetch real data before answering — never estimates or invents numbers.
- **Extraction:** Only uses information explicitly present in the input — does not invent merchant names, dates, or amounts.
- **Amounts:** Presented in the household's base currency unless the user asks about a specific account in another currency.

---

## Known Limitations

| Limitation | Notes |
|---|---|
| Read-only | The assistant cannot create or edit transactions directly; it can only pre-fill a draft for user review. |
| No write tools | Budget adjustments, account edits, etc. are out of scope. |
| No multi-turn extraction | Each photo/voice capture is a fresh single-call extraction — no follow-up corrections within the same capture. |
| No streaming | Replies appear all at once after the full agentic loop completes (no token-by-token streaming). |
| Voice transcription | Depends on browser `SpeechRecognition` API; not supported in all browsers (works in Chrome/Edge). |

---

## Future Improvements

| Idea | Priority |
|---|---|
| Streaming responses | Reduces perceived latency for longer answers |
| Write tools (create draft transaction from chat) | Would remove the "Review & save" step for confident captures |
| Conversation persistence (save history to DB) | Sessions currently reset on drawer close |
| More tools: net worth trend, debt progress, category comparison across months | Expands Q&A coverage |
| Caching of `getAssistantContextAction` result | Avoids re-fetching accounts/categories on every drawer open |
