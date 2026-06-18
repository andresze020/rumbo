import type { LucideIcon } from 'lucide-react'
import {
  ArrowLeftRight,
  BarChart3,
  Calculator,
  CalendarCheck,
  CreditCard,
  Download,
  LayoutDashboard,
  LineChart,
  ListChecks,
  MessageCircle,
  PiggyBank,
  Repeat,
  Scale,
  Settings,
  Shield,
  Tag,
  Target,
  TrendingUp,
  Upload,
  Users,
  Wallet,
  Waves,
  Zap,
} from 'lucide-react'
import type { TranslationKey } from '@/lib/i18n/translate'

export type Phase = 'alpha' | 'beta' | 'soon' | 'pro'

export type NavItem = {
  href: string
  labelKey: TranslationKey
  icon: LucideIcon
  phase: Phase
  /** Required for locked items — text shown on the coming-soon page. */
  descriptionKey?: TranslationKey
}

export type NavGroup = {
  titleKey: TranslationKey
  items: NavItem[]
}

export const navGroups: NavGroup[] = [
  {
    titleKey: 'nav.groupOverview',
    items: [
      { href: '/dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard, phase: 'alpha' },
      { href: '/dashboard/net-worth', labelKey: 'nav.netWorth', icon: TrendingUp, phase: 'alpha' },
      {
        href: '/dashboard/month-review',
        labelKey: 'nav.monthReview',
        icon: CalendarCheck,
        phase: 'alpha',
      },
    ],
  },
  {
    titleKey: 'nav.groupMoney',
    items: [
      { href: '/dashboard/transactions', labelKey: 'nav.transactions', icon: ArrowLeftRight, phase: 'alpha' },
      { href: '/dashboard/accounts', labelKey: 'nav.accounts', icon: Wallet, phase: 'alpha' },
      { href: '/dashboard/categories', labelKey: 'nav.categories', icon: Tag, phase: 'alpha' },
      { href: '/dashboard/transactions/import', labelKey: 'nav.importCsv', icon: Upload, phase: 'alpha' },
    ],
  },
  {
    titleKey: 'nav.groupPlanning',
    items: [
      { href: '/dashboard/budgets', labelKey: 'nav.budgets', icon: Target, phase: 'alpha' },
      { href: '/dashboard/goals', labelKey: 'nav.goals', icon: PiggyBank, phase: 'alpha' },
      { href: '/dashboard/debts', labelKey: 'nav.debts', icon: Scale, phase: 'alpha' },
      {
        href: '/dashboard/debt-planner',
        labelKey: 'nav.debtPlanner',
        icon: Calculator,
        phase: 'alpha',
      },
      { href: '/dashboard/recurring', labelKey: 'nav.recurring', icon: Repeat, phase: 'alpha' },
    ],
  },
  {
    titleKey: 'nav.groupAnalysis',
    items: [
      {
        href: '/dashboard/reports',
        labelKey: 'nav.reports',
        icon: BarChart3,
        phase: 'alpha',
      },
      {
        href: '/dashboard/trends',
        labelKey: 'nav.trends',
        icon: LineChart,
        phase: 'alpha',
      },
      {
        href: '/dashboard/cash-flow',
        labelKey: 'nav.cashFlow',
        icon: Waves,
        phase: 'alpha',
      },
    ],
  },
  {
    titleKey: 'nav.groupAutomation',
    items: [
      {
        href: '/dashboard/coming-soon/rules',
        labelKey: 'nav.rules',
        icon: Zap,
        phase: 'soon',
        descriptionKey: 'comingSoon.descriptions.rules',
      },
      {
        href: '/dashboard/coming-soon/review-queue',
        labelKey: 'nav.reviewQueue',
        icon: ListChecks,
        phase: 'soon',
        descriptionKey: 'comingSoon.descriptions.reviewQueue',
      },
      {
        href: '/dashboard/coming-soon/assistant',
        labelKey: 'nav.aiAssistant',
        icon: MessageCircle,
        phase: 'soon',
        descriptionKey: 'comingSoon.descriptions.aiAssistant',
      },
    ],
  },
  {
    titleKey: 'nav.groupSettings',
    items: [
      { href: '/dashboard/settings', labelKey: 'nav.settings', icon: Settings, phase: 'alpha' },
      { href: '/dashboard/export', labelKey: 'nav.export', icon: Download, phase: 'alpha' },
      {
        href: '/dashboard/coming-soon/household',
        labelKey: 'nav.household',
        icon: Users,
        phase: 'soon',
        descriptionKey: 'comingSoon.descriptions.household',
      },
      {
        href: '/dashboard/coming-soon/privacy',
        labelKey: 'nav.privacy',
        icon: Shield,
        phase: 'soon',
        descriptionKey: 'comingSoon.descriptions.privacy',
      },
      {
        href: '/dashboard/coming-soon/plan-billing',
        labelKey: 'nav.planBilling',
        icon: CreditCard,
        phase: 'pro',
        descriptionKey: 'comingSoon.descriptions.planBilling',
      },
    ],
  },
]

export const PHASE_LABEL_KEY: Record<Exclude<Phase, 'alpha'>, TranslationKey> = {
  beta: 'nav.phaseBeta',
  soon: 'nav.phaseSoon',
  pro: 'nav.phasePro',
}

/** Looks up a locked nav item by its coming-soon route segment, e.g. `goals` -> `/dashboard/coming-soon/goals`. */
export function findNavItemByFeature(feature: string): NavItem | undefined {
  const href = `/dashboard/coming-soon/${feature}`
  return navGroups.flatMap((group) => group.items).find((item) => item.href === href)
}
