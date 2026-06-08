import Anthropic from '@anthropic-ai/sdk'

export const ASSISTANT_MODEL = 'claude-sonnet-4-6'

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
