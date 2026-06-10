/**
 * Plain-language explanations for finance terms used across the UI.
 * Single source of truth for `InfoTooltip` content.
 */
export const GLOSSARY = {
  netWorth:
    "What you own minus what you owe — all your accounts and debts combined.",
  projectedNetWorth:
    "What your net worth would look like if every pending transaction were completed.",
  savingsRate:
    "The share of your income you kept instead of spending this month.",
  liabilities:
    "Money you owe — credit cards, loans, and other debts.",
  exchangeRate:
    "How many units of this currency equal 1 unit of your household's main currency.",
  openingBalance:
    "The balance of this account on the day you started tracking it in App Finanzas.",
  allocations:
    "How your spending is grouped for budgets and reports.",
  transfer:
    "Moving money between your own accounts — it doesn't count as income or spending.",
} as const

export type GlossaryTerm = keyof typeof GLOSSARY
