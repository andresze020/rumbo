import Anthropic from '@anthropic-ai/sdk'

/**
 * The cheapest model Anthropic offers: $1 / $5 per million tokens in/out,
 * against $3 / $15 for Sonnet 5.
 *
 * Three constraints come with it, all verified against the Models API rather
 * than assumed:
 * - 200K context and a 64K output cap, not the 1M / 128K of the Sonnet and
 *   Opus tiers. `MAX_HISTORY_MESSAGES` keeps the assistant far below that.
 * - It supports `image_input`, so reading a receipt photo still works.
 * - No adaptive thinking and no `output_config.effort` — sending `effort` is an
 *   error on this model. Thinking is off unless a request explicitly asks for
 *   it with `{type: 'enabled', budget_tokens: N}`, which none of ours do.
 *
 * The undated alias on purpose: it tracks the current snapshot instead of
 * pinning to one that can be retired out from under us.
 */
export const ASSISTANT_MODEL = 'claude-haiku-4-5'

let client: Anthropic | null = null

/** Lazily creates the Anthropic client so the API key is only required when the assistant is actually used. */
export function getAnthropicClient() {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      throw new Error(
        'ANTHROPIC_API_KEY is not configured. Add it to your environment to enable the AI assistant.'
      )
    }
    client = new Anthropic({ apiKey })
  }
  return client
}
