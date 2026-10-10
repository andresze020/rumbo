import { describe, expect, it } from 'vitest'
import { buildValidatedRows } from './csv-validation'
import { markPrivateAccounts } from '@/lib/privacy/account-label'
import type { CsvMapping } from './types'

const mapping: CsvMapping = {
  transaction_date: 'Date',
  amount: 'Amount',
  description: 'Description',
  account: 'Account',
  category: '',
  merchant_name: '',
  currency: '',
  notes: '',
  transaction_type: '',
}

// HH-3: the import page hands the client the accounts with a private one's
// display name locked (PRV-2). A CSV names the account as stored.
const accounts = markPrivateAccounts(
  [
    { id: 'joint', name: 'Joint', currency_code: 'USD', institution_name: null },
    { id: 'wallet', name: 'Wallet', currency_code: 'USD', institution_name: 'Bank' },
  ],
  new Set(['wallet'])
)

function accountIdFor(account: string, rules: Parameters<typeof buildValidatedRows>[0]['rules'] = []) {
  const [row] = buildValidatedRows({
    rows: [{ Date: '2026-10-01', Amount: '-12.50', Description: 'Coffee', Account: account }],
    mapping,
    targetAccountId: 'joint',
    accounts,
    categories: [],
    currencies: [{ code: 'USD' }],
    rules,
  })
  return row.mappedData.account_id
}

describe('buildValidatedRows with a private account', () => {
  it('matches the stored name, not the locked display name', () => {
    expect(accountIdFor('Wallet')).toBe('wallet')
  })
  it("matches Rumbo's own export label (name · bank · currency)", () => {
    expect(accountIdFor('Wallet · Bank · USD')).toBe('wallet')
  })
})
