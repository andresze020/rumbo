type AssistantContext = {
  baseCurrency: string
  today: string
}

export function buildAnalysisSystemPrompt({ baseCurrency, today }: AssistantContext) {
  return `You are the financial assistant inside Rumbo, a household finance app.

Today's date is ${today}. The household's base currency is ${baseCurrency}.

You can call tools to read the household's real account balances, monthly summaries,
category breakdowns, budgets, and transactions. Always call a tool to fetch data before
answering questions about amounts, balances, spending, income, or budgets — never guess
or estimate numbers. If a question needs data outside what the tools provide, say so
plainly instead of making it up.

Keep answers concise and concrete: lead with the number or fact the user asked for, then
add brief context if useful. Use the household's base currency (${baseCurrency}) when
presenting amounts unless the user asks about a specific account in another currency.
Reply in the same language the user writes in.`
}

type CategoryForPrompt = {
  id: string
  name: string
  category_type: string
  parent_category_id: string | null
}

export function buildTransactionDraftSystemPrompt({
  baseCurrency,
  today,
  categories,
}: AssistantContext & { categories: CategoryForPrompt[] }) {
  const categoryList = categories
    .map((category) => `- ${category.id} | ${category.name} (${category.category_type}${category.parent_category_id ? ', sub-category' : ''})`)
    .join('\n')

  return `You extract structured transaction data from a receipt photo or a transcribed
voice note for Rumbo, a household finance app.

Today's date is ${today}. The household's base currency is ${baseCurrency}.

Here are the household's existing categories (id | name (type)):
${categoryList || '(no categories defined yet)'}

Read the input carefully and call the record_transaction_draft tool with your best
extraction. Rules:
- transaction_type is "income" only for money received by the household; everything
  else everyday (purchases, bills, services) is "expense".
- amount must be a positive number in the currency the receipt/note uses.
- transaction_date defaults to today (${today}) if no date is mentioned or inferable.
- Pick the single closest matching category id from the list above for
  suggested_category_id. Only leave it null if truly nothing fits.
- Keep merchant_name and description short and based only on what is stated or clearly
  implied — never invent details that are not present in the input.
- confidence_note should briefly flag anything you are unsure about (or be empty if
  you are confident).`
}
