import {
  Banknote,
  CreditCard,
  Landmark,
  PiggyBank,
  Scale,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from 'lucide-react'

export type AccountVisual = {
  Icon: LucideIcon
  label: string
  /** Tinted avatar surface — calm, muted, dark-mode aware. */
  surface: string
  /** Icon color paired with `surface`. */
  icon: string
}

/**
 * Visual treatment per account type. Colors are intentionally muted (50/950
 * surfaces) so the list stays calm while still being scannable. Full literal
 * class strings keep Tailwind's JIT happy.
 */
const ACCOUNT_TYPE_VISUALS: Record<string, AccountVisual> = {
  cash: {
    Icon: Banknote,
    label: 'Cash',
    surface: 'bg-emerald-50 dark:bg-emerald-950/40',
    icon: 'text-emerald-600 dark:text-emerald-400',
  },
  checking: {
    Icon: Landmark,
    label: 'Checking',
    surface: 'bg-sky-50 dark:bg-sky-950/40',
    icon: 'text-sky-600 dark:text-sky-400',
  },
  savings: {
    Icon: PiggyBank,
    label: 'Savings',
    surface: 'bg-violet-50 dark:bg-violet-950/40',
    icon: 'text-violet-600 dark:text-violet-400',
  },
  credit_card: {
    Icon: CreditCard,
    label: 'Credit card',
    surface: 'bg-amber-50 dark:bg-amber-950/40',
    icon: 'text-amber-600 dark:text-amber-400',
  },
  debt: {
    Icon: Scale,
    label: 'Debt',
    surface: 'bg-rose-50 dark:bg-rose-950/40',
    icon: 'text-rose-600 dark:text-rose-400',
  },
  investment: {
    Icon: TrendingUp,
    label: 'Investment',
    surface: 'bg-teal-50 dark:bg-teal-950/40',
    icon: 'text-teal-600 dark:text-teal-400',
  },
  other: {
    Icon: Wallet,
    label: 'Other',
    surface: 'bg-muted',
    icon: 'text-muted-foreground',
  },
}

const FALLBACK: AccountVisual = ACCOUNT_TYPE_VISUALS.other

export function getAccountVisual(accountType: string): AccountVisual {
  return ACCOUNT_TYPE_VISUALS[accountType] ?? FALLBACK
}

export function isLiabilityClass(accountClass: string) {
  return accountClass === 'liability'
}
