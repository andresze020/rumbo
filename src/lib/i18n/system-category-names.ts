import type { Locale } from '@/lib/i18n/dictionaries'

const es: Record<string, string> = {
  Salary: 'Salario',
  'Side Income': 'Ingresos adicionales',
  'Interest Income': 'Ingresos por intereses',
  Refunds: 'Reembolsos',
  'Other Income': 'Otros ingresos',
  Rent: 'Alquiler',
  Groceries: 'Mercado',
  Restaurants: 'Restaurantes',
  Transportation: 'Transporte',
  Insurance: 'Seguros',
  Utilities: 'Servicios públicos',
  Internet: 'Internet',
  Mobile: 'Telefonía móvil',
  Health: 'Salud',
  Pets: 'Mascotas',
  Travel: 'Viajes',
  Shopping: 'Compras',
  Entertainment: 'Entretenimiento',
  Subscriptions: 'Suscripciones',
  Fees: 'Comisiones',
  'Other Expense': 'Otros gastos',
  'Debt Principal': 'Capital de deuda',
  'Debt Interest': 'Intereses de deuda',
  Savings: 'Ahorros',
  Investments: 'Inversiones',
  Transfers: 'Transferencias',
  Adjustments: 'Ajustes',
}

const fr: Record<string, string> = {
  Salary: 'Salaire',
  'Side Income': 'Revenus supplémentaires',
  'Interest Income': 'Revenus d’intérêts',
  Refunds: 'Remboursements',
  'Other Income': 'Autres revenus',
  Rent: 'Loyer',
  Groceries: 'Épicerie',
  Restaurants: 'Restaurants',
  Transportation: 'Transport',
  Insurance: 'Assurances',
  Utilities: 'Services publics',
  Internet: 'Internet',
  Mobile: 'Téléphonie mobile',
  Health: 'Santé',
  Pets: 'Animaux',
  Travel: 'Voyages',
  Shopping: 'Achats',
  Entertainment: 'Divertissement',
  Subscriptions: 'Abonnements',
  Fees: 'Frais',
  'Other Expense': 'Autres dépenses',
  'Debt Principal': 'Capital de la dette',
  'Debt Interest': 'Intérêts sur la dette',
  Savings: 'Épargne',
  Investments: 'Placements',
  Transfers: 'Virements',
  Adjustments: 'Ajustements',
}

const en = Object.fromEntries(Object.keys(es).map((name) => [name, name]))

export const systemCategoryTranslations: Record<Locale, Record<string, string>> = {
  en,
  es,
  fr,
}

export function localizeSystemCategoryName(
  name: string,
  isSystem: boolean,
  locale: Locale
) {
  return isSystem ? systemCategoryTranslations[locale][name] ?? name : name
}
