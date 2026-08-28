#!/usr/bin/env node
// ============================================================
// Rumbo — andromoney-import.mjs
// One-off migration of a full AndroMoney history into a household.
//
// The in-app CSV importer (/dashboard/transactions/import) deliberately does
// not cover this: it imports one account at a time, refuses transfer rows, and
// needs every account and category to exist first. An AndroMoney export is the
// opposite — every account in one file, transfers inline, and its own category
// tree. So this script does the setup (accounts, opening balances, category
// tree, tags) and then posts every row through the same RPCs the UI uses:
// create_manual_transaction / create_transfer_transaction / create_opening_balance.
// The ledger invariants therefore hold exactly as they do for manual entry —
// nothing is written straight into transaction_entries.
//
// It authenticates as YOU (email + password, anon key), so RLS applies
// normally; there is no service-role bypass.
//
// Every posted transaction is attached to an `import_batches` row, which means
// the whole import shows up under Import history and can be undone with one
// click (or with `revert` below). Re-running skips rows already imported,
// keyed on AndroMoney's own `uid`, so an interrupted run resumes safely.
//
// Usage:
//   node --env-file=.env.local scripts/andromoney-import.mjs plan   --csv AndroMoney.csv --map andromoney-map.json
//   node --env-file=.env.local scripts/andromoney-import.mjs apply  --csv AndroMoney.csv --map andromoney-map.json
//   node --env-file=.env.local scripts/andromoney-import.mjs revert --batch <uuid>
//
// `plan` writes the map file if it does not exist yet: edit it (account types,
// FX rates, cross-currency transfer legs), re-run `plan` until the report looks
// right, then `apply`.
//
// Env: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
//      APP_FINANZAS_EMAIL, APP_FINANZAS_PASSWORD
// ============================================================

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { createClient } from '@supabase/supabase-js'
import {
  parseAndroMoneyCsv,
  buildPlan,
  guessAccountShape,
  classifyRow,
  ROW_KINDS,
} from './andromoney-parse.mjs'

const BATCH_SOURCE = 'andromoney'
const PAGE_SIZE = 1000
// Deliberately small: a transaction is posted first and recorded in
// `import_rows` (the resume key) a moment later, so a crash in between can
// duplicate at most this many rows on the next run.
const WRITE_CHUNK = 25
const DEFAULT_CONCURRENCY = 5

// ── CLI plumbing ────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const [command, ...rest] = argv
  const options = {}

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index]
    if (!token.startsWith('--')) continue
    const key = token.slice(2)
    const next = rest[index + 1]
    if (!next || next.startsWith('--')) {
      options[key] = true
    } else {
      options[key] = next
      index += 1
    }
  }

  return { command, options }
}

function fail(message) {
  console.error(`\n✖ ${message}\n`)
  process.exit(1)
}

function log(message = '') {
  console.log(message)
}

/** Node's --env-file is the happy path; this is the fallback when it is absent. */
function loadEnvFallback() {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) return

  for (const candidate of ['.env.local', '.env']) {
    if (!existsSync(candidate)) continue
    for (const line of readFileSync(candidate, 'utf8').split('\n')) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (!match) continue
      const value = match[2].replace(/^['"]|['"]$/g, '')
      if (!process.env[match[1]]) process.env[match[1]] = value
    }
  }
}

async function connect() {
  loadEnvFallback()

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

  if (!url || !key) {
    fail(
      'NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are missing. ' +
        'Run with `node --env-file=.env.local …`.'
    )
  }

  const email = process.env.APP_FINANZAS_EMAIL ?? (await ask('Rumbo email: '))
  const password = process.env.APP_FINANZAS_PASSWORD ?? (await ask('Password: '))

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: true },
  })

  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) fail(`Could not sign in: ${error.message}`)

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('default_household_id')
    .eq('id', data.user.id)
    .maybeSingle()

  if (profileError) fail(`Could not read your profile: ${profileError.message}`)
  if (!profile?.default_household_id) fail('Your profile has no default household. Finish onboarding first.')

  const householdId = profile.default_household_id

  const { data: household, error: householdError } = await supabase
    .from('households')
    .select('id, name, base_currency')
    .eq('id', householdId)
    .single()

  if (householdError) fail(`Could not read the household: ${householdError.message}`)

  return { supabase, userId: data.user.id, householdId, household }
}

async function ask(question) {
  const rl = createInterface({ input: stdin, output: stdout })
  const answer = await rl.question(question)
  rl.close()

  return answer.trim()
}

/** Run `worker` over `items`, at most `limit` in flight, results in input order. */
async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length)
  let next = 0

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      for (;;) {
        const index = next
        next += 1
        if (index >= items.length) return
        results[index] = await worker(items[index], index)
      }
    })
  )

  return results
}

function chunk(items, size) {
  const chunks = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }

  return chunks
}

/** PostgREST caps a select at 1000 rows; walk the whole table. */
async function selectAll(query) {
  const rows = []
  let from = 0

  for (;;) {
    const { data, error } = await query.range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(error.message)
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  return rows
}

// ── Map file ────────────────────────────────────────────────────────────────

/**
 * Write a starter map file pre-filled from the CSV itself, so the only thing
 * left to do is correct the guesses (account types, FX rates) rather than type
 * 26 accounts by hand.
 */
function buildStarterMap({ rows, baseCurrency }) {
  const accountCurrencies = new Map()
  const currencies = new Set()

  for (const row of rows) {
    const kind = classifyRow(row)
    const names =
      kind === ROW_KINDS.OPENING
        ? [row['Income(Transfer In)']?.trim()]
        : [row['Expense(Transfer Out)']?.trim(), row['Income(Transfer In)']?.trim()]
    const currency = row.Currency?.trim().toUpperCase()
    if (currency) currencies.add(currency)

    for (const name of names) {
      if (!name) continue
      if (!accountCurrencies.has(name)) accountCurrencies.set(name, new Map())
      const counts = accountCurrencies.get(name)
      counts.set(currency, (counts.get(currency) ?? 0) + 1)
    }
  }

  const accounts = {}
  for (const [name, counts] of [...accountCurrencies.entries()].sort()) {
    const dominant = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0]
    accounts[name] = { name, ...guessAccountShape(name), currency_code: dominant }
  }

  const fxRates = {}
  for (const currency of currencies) {
    if (currency === baseCurrency) continue
    // Deliberately a single placeholder: a wrong rate is silently wrong money,
    // so this must be a conscious edit, not a default that looks authoritative.
    fxRates[currency] = { default: null }
  }

  return {
    _README: [
      'Edit this file, re-run `plan`, repeat until the report is clean, then `apply`.',
      'accounts: the name/type/class/currency each AndroMoney account becomes in Rumbo.',
      'fxRates: value of 1 unit of that currency in the household base currency ' +
        `(${baseCurrency}). Per-year ("2024") and per-month ("2024-03") keys override "default".`,
      'crossCurrencyTransfers: AndroMoney stores one amount for a two-currency transfer. ' +
        'Give the missing leg here, keyed by the row uid (plan lists the ones it needs).',
      'categories: rename a category on the way in, e.g. "Food/Mecato": { "name": "Snacks" }.',
      'skipUids: uids to leave out of the import entirely.',
    ],
    baseCurrency,
    openingBalanceDate: null,
    projectsAsTags: true,
    importTime: true,
    currencyMismatchPolicy: 'convert',
    accounts,
    categories: {},
    fxRates,
    textFixes: {},
    crossCurrencyTransfers: {},
    skipUids: [],
  }
}

function readMap(path) {
  if (!path || !existsSync(path)) return {}

  try {
    const map = JSON.parse(readFileSync(path, 'utf8'))
    // A null rate means "not decided yet" — strip it so buildPlan reports the
    // rows as blocked instead of quietly treating null as a usable rate.
    for (const table of Object.values(map.fxRates ?? {})) {
      for (const [key, value] of Object.entries(table)) {
        if (value === null) delete table[key]
      }
    }

    return map
  } catch (error) {
    fail(`Could not read the map file ${path}: ${error.message}`)
  }
}

// ── plan ────────────────────────────────────────────────────────────────────

async function commandPlan(options) {
  const csvPath = options.csv ?? fail('--csv is required')
  const mapPath = options.map ?? 'andromoney-map.json'

  const { supabase, householdId, household } = await connect()
  const map = readMap(mapPath)
  const parsed = parseAndroMoneyCsv(readFileSync(csvPath), { textFixes: map.textFixes })

  for (const warning of parsed.warnings) log(`⚠ ${warning}`)

  if (!existsSync(mapPath)) {
    writeFileSync(
      mapPath,
      `${JSON.stringify(buildStarterMap({ rows: parsed.rows, baseCurrency: household.base_currency }), null, 2)}\n`
    )
    log(`\n📝 Wrote a starter map to ${mapPath}. Edit it (FX rates are empty on purpose) and re-run.\n`)
  }

  const existing = await loadExisting(supabase, householdId)
  const plan = buildPlan({
    rows: parsed.rows,
    map: readMap(mapPath),
    existing: { ...existing, baseCurrency: household.base_currency },
  })
  const imported = await loadImportedUids(supabase, householdId)

  printPlan({ plan, household, existing, imported, mapPath })

  const outPath = options.out ?? 'andromoney-plan.json'
  writeFileSync(
    outPath,
    `${JSON.stringify(
      {
        summary: plan.summary,
        accounts: plan.accounts,
        parentCategories: plan.parentCategories,
        childCategories: plan.childCategories,
        tags: plan.tags,
        crossCurrencyTransfers: plan.crossCurrencySuggestions,
        problems: plan.problems,
      },
      null,
      2
    )}\n`
  )
  log(`\nFull plan (including every skipped row) written to ${outPath}.`)
}

function printPlan({ plan, household, existing, imported, mapPath }) {
  const { summary } = plan

  log(`\n═══ AndroMoney → Rumbo · plan ═══`)
  log(`Household        : ${household.name} (base ${household.base_currency})`)
  log(`Already imported : ${imported.size} AndroMoney rows (they will be skipped)`)
  log(`\nCSV rows         : ${summary.csvRows}`)
  log(`  income         : ${summary.income}`)
  log(`  expense        : ${summary.expense}`)
  log(`  transfer       : ${summary.transfer}`)
  log(`  opening balance: ${summary.openingBalances}`)
  log(`  not importable : ${summary.skipped}`)

  log(`\n── Accounts (${plan.accounts.length}) ──`)
  for (const account of plan.accounts.sort((a, b) => b.transactionCount - a.transactionCount)) {
    const state = account.existingId ? 'exists' : 'CREATE'
    const opening = account.openingBalance ? ` · opening ${account.openingBalance}` : ''
    log(
      `  [${state}] ${account.name.padEnd(24)} ${account.currency_code} ` +
        `${account.account_type}/${account.account_class} · ${account.transactionCount} rows${opening}`
    )
  }

  log(`\n── Categories (${plan.parentCategories.length} parents, ${plan.childCategories.length} children) ──`)
  for (const parent of plan.parentCategories.sort((a, b) => a.name.localeCompare(b.name))) {
    log(`  [${parent.existingId ? 'exists' : 'CREATE'}] ${parent.name} (${parent.reporting_type})${parent.split ? '  ← split: AndroMoney used this name for both directions' : ''}`)
    for (const child of plan.childCategories.filter((c) => c.parentName === parent.name && c.reporting_type === parent.reporting_type)) {
      log(`      [${child.existingId ? 'exists' : 'CREATE'}] ${child.name} · ${child.transactionCount} rows`)
    }
  }

  if (plan.tags.length) {
    const existingTags = new Set(existing.tags.map((tag) => tag.name.toLowerCase()))
    log(`\n── Tags from the Project column (${plan.tags.length}) ──`)
    log(`  ${plan.tags.map((tag) => (existingTags.has(tag.toLowerCase()) ? tag : `${tag}*`)).join(', ')}`)
    log(`  (* = will be created)`)
  }

  const blocking = plan.problems.filter((problem) => !problem.reason.endsWith('Imported.'))
  const notices = plan.problems.filter((problem) => problem.reason.endsWith('Imported.'))

  if (notices.length) {
    log(`\n── Imported with a caveat (${notices.length}) ──`)
    for (const problem of notices.slice(0, 20)) {
      log(`  line ${problem.line}: ${problem.reason}`)
    }
  }

  if (blocking.length) {
    const byReason = new Map()
    for (const problem of blocking) {
      const key = problem.reason.split('.')[0]
      byReason.set(key, [...(byReason.get(key) ?? []), problem])
    }

    log(`\n── Not importable (${blocking.length}) ──`)
    for (const [reason, items] of byReason) {
      log(`  ${items.length}× ${reason}`)
      for (const item of items.slice(0, 5)) {
        log(`      line ${item.line} · ${item.date} · ${item.amount} ${item.currency} · ${item.category} · ${item.note}`)
      }
      if (items.length > 5) log(`      … and ${items.length - 5} more (see the plan JSON)`)
    }
  }

  if (Object.keys(plan.crossCurrencySuggestions).length) {
    log(`\n── Cross-currency transfers needing confirmation ──`)
    log('AndroMoney exports one amount per transfer, so the other leg below is an')
    log('estimate from your rate table. Check each against the real bank movement,')
    log(`then paste this into the "crossCurrencyTransfers" key of ${mapPath}:`)
    log(`\n${JSON.stringify(plan.crossCurrencySuggestions, null, 2)}`)
  }

  log(`\n── Next ──`)
  log(`  1. Edit ${mapPath} until this report is what you want.`)
  log(`  2. node --env-file=.env.local scripts/andromoney-import.mjs apply --csv <csv> --map ${mapPath}`)
}

function dayBefore(isoDate) {
  if (!isoDate) return null
  const date = new Date(`${isoDate}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() - 1)

  return date.toISOString().slice(0, 10)
}

// ── Existing household data ─────────────────────────────────────────────────

async function loadExisting(supabase, householdId) {
  const accounts = await selectAll(
    supabase
      .from('accounts')
      .select('id, name, currency_code, account_type, account_class, is_archived')
      .eq('household_id', householdId)
      .is('deleted_at', null)
      .order('name')
  )
  const categories = await selectAll(
    supabase
      .from('categories')
      .select('id, name, parent_category_id, reporting_type, category_type, is_archived')
      .eq('household_id', householdId)
      .is('deleted_at', null)
      .order('name')
  )
  const tags = await selectAll(
    supabase.from('tags').select('id, name').eq('household_id', householdId).order('name')
  )

  return { accounts, categories, tags }
}

/** AndroMoney uids already posted, so a re-run resumes instead of duplicating. */
async function loadImportedUids(supabase, householdId) {
  const batches = await selectAll(
    supabase
      .from('import_batches')
      .select('id, metadata, status')
      .eq('household_id', householdId)
      .is('deleted_at', null)
      .order('created_at')
  )
  const ids = batches
    .filter((batch) => batch.metadata?.source === BATCH_SOURCE && batch.status !== 'reverted')
    .map((batch) => batch.id)

  if (!ids.length) return new Set()

  const rows = await selectAll(
    supabase
      .from('import_rows')
      .select('raw_data')
      .eq('household_id', householdId)
      .in('import_batch_id', ids)
      .eq('validation_status', 'imported')
      .order('row_number')
  )

  return new Set(rows.map((row) => row.raw_data?.uid).filter(Boolean))
}

// ── apply ───────────────────────────────────────────────────────────────────

async function commandApply(options) {
  const csvPath = options.csv ?? fail('--csv is required')
  const mapPath = options.map ?? 'andromoney-map.json'
  const limit = options.limit ? Number(options.limit) : null
  const concurrency = options.concurrency ? Number(options.concurrency) : DEFAULT_CONCURRENCY

  const { supabase, userId, householdId, household } = await connect()
  const map = readMap(mapPath)
  const parsed = parseAndroMoneyCsv(readFileSync(csvPath), { textFixes: map.textFixes })
  const existing = await loadExisting(supabase, householdId)
  const plan = buildPlan({
    rows: parsed.rows,
    map,
    existing: { ...existing, baseCurrency: household.base_currency },
  })
  const imported = await loadImportedUids(supabase, householdId)

  // Oldest first, so a running balance builds up the way it happened — and so
  // --limit gives you the start of the history rather than an arbitrary slice.
  const pending = plan.transactions
    .filter((transaction) => !imported.has(transaction.uid))
    .sort((a, b) => a.transactionDate.localeCompare(b.transactionDate) || a.line - b.line)
  const todo = limit ? pending.slice(0, limit) : pending

  log(`\nHousehold : ${household.name} (base ${household.base_currency})`)
  log(`To create : ${plan.summary.accountsToCreate} accounts, ${plan.summary.categoriesToCreate} categories`)
  log(`To post   : ${todo.length} transactions (${imported.size} already imported, ${plan.summary.skipped} not importable)`)

  if (!options.yes) {
    const answer = await ask('\nProceed? (yes/no) ')
    if (answer.toLowerCase() !== 'yes') fail('Aborted.')
  }

  // AndroMoney's INIT_AMOUNT rows carry its "no date" sentinel (10100101), so
  // the opening balances are dated the day before the first real transaction.
  const openingBalanceDate =
    map.openingBalanceDate ?? dayBefore(plan.firstTransactionDate) ?? undefined

  // 1. Accounts.
  const accountIds = new Map()
  for (const account of plan.accounts) {
    if (account.existingId) {
      accountIds.set(account.sourceName, account.existingId)
      continue
    }

    const { data, error } = await supabase
      .from('accounts')
      .insert({
        household_id: householdId,
        name: account.name,
        account_type: account.account_type,
        account_class: account.account_class,
        currency_code: account.currency_code,
        opening_balance_date: openingBalanceDate,
        created_by: userId,
        notes: `Imported from AndroMoney (${account.sourceName}).`,
      })
      .select('id')
      .single()

    if (error) fail(`Could not create account "${account.name}": ${error.message}`)
    accountIds.set(account.sourceName, data.id)
    log(`  + account ${account.name}`)
  }

  // 2. Opening balances (only for accounts this run created — re-running must
  //    not stack a second opening balance onto an account that already has one).
  for (const opening of plan.openings) {
    if (opening.account.existingId) continue
    const accountId = accountIds.get(opening.account.sourceName)
    if (!accountId || !opening.amount) continue

    const rate =
      opening.account.currency_code === household.base_currency
        ? 1
        : (map.fxRates?.[opening.account.currency_code]?.default ?? null)

    if (rate === null) {
      log(`  ! opening balance for ${opening.account.name} skipped: no FX rate configured`)
      continue
    }

    const { error } = await supabase.rpc('create_opening_balance', {
      p_household_id: householdId,
      p_account_id: accountId,
      p_opening_balance_amount: opening.amount,
      p_opening_balance_date: openingBalanceDate ?? null,
      p_exchange_rate_to_base: rate,
      p_notes: 'Imported from AndroMoney (INIT_AMOUNT).',
    })

    if (error) fail(`Could not set the opening balance for ${opening.account.name}: ${error.message}`)
    log(`  + opening balance ${opening.account.name} ${opening.amount}`)
  }

  // 3. Categories — parents first, then children (a child needs its parent id).
  const parentIds = new Map()
  for (const parent of plan.parentCategories) {
    if (parent.existingId) {
      parentIds.set(`${parent.name}::${parent.reporting_type}`, parent.existingId)
      continue
    }

    const { data, error } = await supabase
      .from('categories')
      .insert({
        household_id: householdId,
        name: parent.name,
        category_type: parent.category_type,
        reporting_type: parent.reporting_type,
        parent_category_id: null,
        created_by: userId,
      })
      .select('id')
      .single()

    if (error) fail(`Could not create category "${parent.name}": ${error.message}`)
    parentIds.set(`${parent.name}::${parent.reporting_type}`, data.id)
    log(`  + category ${parent.name}`)
  }

  const categoryIds = new Map()
  for (const child of plan.childCategories) {
    const parentId = parentIds.get(child.parentKey)

    if (child.existingId) {
      categoryIds.set(child.sourceKey, child.existingId)
      continue
    }

    const { data, error } = await supabase
      .from('categories')
      .insert({
        household_id: householdId,
        name: child.name,
        category_type: child.category_type,
        reporting_type: child.reporting_type,
        parent_category_id: parentId ?? null,
        created_by: userId,
      })
      .select('id')
      .single()

    if (error) fail(`Could not create category "${child.parentName} / ${child.name}": ${error.message}`)
    categoryIds.set(child.sourceKey, data.id)
  }

  // A row whose AndroMoney category had no subcategory posts against the parent.
  const parentIdBySourceName = new Map()
  for (const parent of plan.parentCategories) {
    parentIdBySourceName.set(
      `${parent.sourceName}::${parent.reporting_type}`,
      parentIds.get(`${parent.name}::${parent.reporting_type}`)
    )
  }

  // 4. Tags.
  const tagIds = new Map(existing.tags.map((tag) => [tag.name.toLowerCase(), tag.id]))
  for (const name of plan.tags) {
    if (tagIds.has(name.toLowerCase())) continue
    const { data, error } = await supabase
      .from('tags')
      .insert({ household_id: householdId, name })
      .select('id')
      .single()

    if (error) fail(`Could not create tag "${name}": ${error.message}`)
    tagIds.set(name.toLowerCase(), data.id)
  }

  if (!todo.length) {
    log('\nNothing left to post. Done.')
    return
  }

  // 5. The batch every posted transaction hangs off, so Import history can undo it.
  const { data: batch, error: batchError } = await supabase
    .from('import_batches')
    .insert({
      household_id: householdId,
      uploaded_by: userId,
      file_name: csvPath.split(/[\\/]/).pop(),
      source_type: 'csv_generic',
      status: 'imported',
      total_rows: parsed.rows.length,
      valid_rows: todo.length,
      invalid_rows: plan.summary.skipped,
      metadata: { source: BATCH_SOURCE, map: mapPath, started_at: new Date().toISOString() },
    })
    .select('id')
    .single()

  if (batchError) fail(`Could not open the import batch: ${batchError.message}`)

  log(`\nImport batch ${batch.id}\n`)

  // 6. Post (already ordered oldest-first above).
  const ordered = todo
  const failures = []
  let done = 0

  async function postOne(transaction) {
    if (transaction.kind === 'transfer') {
      return supabase.rpc('create_transfer_transaction', {
        p_household_id: householdId,
        p_from_account_id: accountIds.get(transaction.fromAccount.sourceName),
        p_to_account_id: accountIds.get(transaction.toAccount.sourceName),
        p_amount: transaction.amount,
        p_transaction_date: transaction.transactionDate,
        p_description: transaction.description,
        p_notes: null,
        p_status: 'posted',
        p_exchange_rate_to_base: transaction.exchangeRateToBase,
        p_to_amount: transaction.toAmount,
      })
    }

    const categoryId =
      categoryIds.get(transaction.categoryKey) ??
      parentIdBySourceName.get(`${transaction.raw.Category?.trim()}::${transaction.kind}`)

    if (!categoryId) {
      return { data: null, error: { message: `No category resolved for ${transaction.categoryKey}` } }
    }

    return supabase.rpc('create_manual_transaction', {
      p_household_id: householdId,
      p_transaction_type: transaction.kind,
      p_transaction_date: transaction.transactionDate,
      p_account_id: accountIds.get(transaction.account.sourceName),
      p_category_id: categoryId,
      p_amount: transaction.amount,
      p_description: transaction.description,
      p_merchant_name: null,
      p_notes: null,
      p_status: 'posted',
      p_exchange_rate_to_base: transaction.exchangeRateToBase,
      p_payee_name: transaction.payee,
    })
  }

  for (const batchOfRows of chunk(ordered, WRITE_CHUNK)) {
    const results = await mapWithConcurrency(batchOfRows, concurrency, postOne)
    const posted = []

    batchOfRows.forEach((transaction, index) => {
      const { data, error } = results[index]
      if (error || !data) {
        failures.push({ transaction, message: error?.message ?? 'no id returned' })
      } else {
        posted.push({ transaction, transactionId: data })
      }
    })

    // Record the chunk before posting the next one: `import_rows` is what makes
    // a re-run resume rather than duplicate.
    await linkChunk({ supabase, householdId, batchId: batch.id, posted, tagIds, concurrency })

    done += batchOfRows.length
    stdout.write(`\r  posted ${done}/${ordered.length} (${failures.length} failed)   `)
  }

  stdout.write('\n')

  const { error: closeError } = await supabase
    .from('import_batches')
    .update({
      status: failures.length ? 'partial' : 'imported',
      imported_transactions_count: ordered.length - failures.length,
      invalid_rows: plan.summary.skipped + failures.length,
    })
    .eq('id', batch.id)

  if (closeError) log(`⚠ Could not update the batch counters: ${closeError.message}`)

  log(`\n✔ Imported ${ordered.length - failures.length} transactions into batch ${batch.id}.`)

  if (failures.length) {
    const failuresPath = 'andromoney-failures.json'
    writeFileSync(
      failuresPath,
      `${JSON.stringify(
        failures.map((failure) => ({
          line: failure.transaction.line,
          uid: failure.transaction.uid,
          date: failure.transaction.transactionDate,
          amount: failure.transaction.amount,
          description: failure.transaction.description,
          message: failure.message,
        })),
        null,
        2
      )}\n`
    )
    log(`⚠ ${failures.length} rows failed — details in ${failuresPath}. Re-running apply retries only those.`)
  }

  log(`\nUndo everything: node --env-file=.env.local scripts/andromoney-import.mjs revert --batch ${batch.id}`)
}

/**
 * Attach a chunk of freshly posted transactions to the batch: one import_rows
 * row each (keyed on the AndroMoney uid — that is what makes a re-run resume),
 * the batch/row back-links plus the optional time-of-day, and the tags.
 */
async function linkChunk({ supabase, householdId, batchId, posted, tagIds, concurrency = 1 }) {
  if (!posted.length) return

  const { data: importRows, error: importRowsError } = await supabase
    .from('import_rows')
    .insert(
      posted.map(({ transaction, transactionId }) => ({
        household_id: householdId,
        import_batch_id: batchId,
        row_number: transaction.line,
        raw_data: { ...transaction.raw, __line: undefined, uid: transaction.uid },
        mapped_data: {
          transaction_date: transaction.transactionDate,
          amount: transaction.amount,
          kind: transaction.kind,
          description: transaction.description,
        },
        validation_status: 'imported',
        created_transaction_id: transactionId,
      }))
    )
    .select('id, created_transaction_id')

  if (importRowsError) fail(`Could not record the imported rows: ${importRowsError.message}`)

  const importRowByTransaction = new Map(
    importRows.map((row) => [row.created_transaction_id, row.id])
  )

  const updates = await mapWithConcurrency(posted, concurrency, ({ transaction, transactionId }) =>
    supabase
      .from('transactions')
      .update({
        import_batch_id: batchId,
        import_row_id: importRowByTransaction.get(transactionId) ?? null,
        ...(transaction.transactionTime ? { transaction_time: transaction.transactionTime } : {}),
      })
      .eq('household_id', householdId)
      .eq('id', transactionId)
  )

  const updateError = updates.find((result) => result.error)?.error
  if (updateError) fail(`Could not link a transaction to the batch: ${updateError.message}`)

  const links = posted.flatMap(({ transaction, transactionId }) =>
    transaction.tags
      .map((name) => tagIds.get(name.toLowerCase()))
      .filter(Boolean)
      .map((tagId) => ({ household_id: householdId, transaction_id: transactionId, tag_id: tagId }))
  )

  if (links.length) {
    const { error } = await supabase.from('transaction_tags').upsert(links, {
      onConflict: 'transaction_id,tag_id',
      ignoreDuplicates: true,
    })
    if (error) fail(`Could not attach tags: ${error.message}`)
  }
}

// ── revert ──────────────────────────────────────────────────────────────────

async function commandRevert(options) {
  const batchId = options.batch ?? fail('--batch <uuid> is required')
  const { supabase } = await connect()

  const { data, error } = await supabase.rpc('revert_csv_import', { p_batch_id: batchId })

  if (error) fail(`Could not revert: ${error.message}`)

  log(`\n✔ Reverted ${data} transactions (soft-deleted; the ledger rows are kept).`)
}

// ── main ────────────────────────────────────────────────────────────────────

const { command, options } = parseArgs(process.argv.slice(2))

switch (command) {
  case 'plan':
    await commandPlan(options)
    break
  case 'apply':
    await commandApply(options)
    break
  case 'revert':
    await commandRevert(options)
    break
  default:
    log(`
AndroMoney → Rumbo

  plan    --csv <file> [--map andromoney-map.json] [--out andromoney-plan.json]
  apply   --csv <file> [--map andromoney-map.json] [--limit N] [--concurrency 5] [--yes]
  revert  --batch <uuid>

Run with: node --env-file=.env.local scripts/andromoney-import.mjs plan --csv AndroMoney.csv
`)
    process.exit(command ? 1 : 0)
}
