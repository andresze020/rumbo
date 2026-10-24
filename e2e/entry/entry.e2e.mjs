// Browser scenarios for the transaction entry dialog (`npm run e2e:entry`).
//
// Each scenario pins down something a device run on a phone found broken in
// the "premium transaction entry" sprint (docs/alpha/sprint-transaction-entry-
// premium.md), so a later change that brings it back fails here instead of on
// someone's phone. They drive the real form against `mock-supabase.mjs`
// through the `/e2e/entry` harness page; `run.mjs` starts both.
//
// Usage: node e2e/entry/entry.e2e.mjs [baseUrl]   (run.mjs passes it)

import assert from 'node:assert/strict'
import fs from 'node:fs'

const BASE = process.argv[2] ?? 'http://localhost:3110'
const LOG = process.env.LOG ?? 'e2e/entry/.mock-supabase.log'

async function loadPlaywright() {
  try {
    return await import('playwright')
  } catch {
    // Not a project dependency (see docs/testing.md). CI installs it with
    // `npm install --no-save`; elsewhere point PLAYWRIGHT_MODULE at a copy.
    if (process.env.PLAYWRIGHT_MODULE) return await import(process.env.PLAYWRIGHT_MODULE)
    throw new Error('Playwright is not installed. Run: npm install --no-save playwright')
  }
}
const { chromium } = await loadPlaywright()

// ── Helpers ────────────────────────────────────────────────────────────────

const b64url = (value) => Buffer.from(value).toString('base64url')

/** A session cookie the app's Supabase SSR client accepts; the mock trusts it. */
function sessionCookie() {
  const exp = Math.floor(Date.now() / 1000) + 3600
  const claims = { sub: 'u1', exp, role: 'authenticated', aud: 'authenticated', email: 'qa@example.com' }
  const jwt = `${b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${b64url(JSON.stringify(claims))}.sig`
  const session = {
    access_token: jwt,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: exp,
    refresh_token: 'r',
    user: { id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'qa@example.com' },
  }
  // The cookie name follows the project ref, the first label of the URL host.
  return { name: 'sb-127-auth-token', value: 'base64-' + b64url(JSON.stringify(session)), domain: 'localhost', path: '/' }
}

function writes() {
  if (!fs.existsSync(LOG)) return []
  return fs
    .readFileSync(LOG, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .filter((entry) => entry.kind === 'rpc' && entry.fn === 'create_manual_transaction')
}

const browser = await chromium.launch()

async function phone({ width = 412, height = 741 } = {}) {
  const context = await browser.newContext({
    viewport: { width, height },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
    colorScheme: 'dark',
  })
  await context.addCookies([sessionCookie()])
  const page = await context.newPage()
  return { context, page }
}

async function openForm(page) {
  await page.goto(`${BASE}/e2e/entry`)
  await page.tap('#open-entry')
  await page.waitForSelector('#amount', { timeout: 30_000 })
  await page.waitForTimeout(500)
}

/** Amount → category → account → payee, the fill-fast chain's mandatory path. */
async function fillChain(page, { amount = '12', account = /^Checking/ } = {}) {
  await page.locator('#amount').fill(amount)
  await page.locator('#amount').press('Enter')
  await page.waitForTimeout(400)
  for (const name of [/Groceries/, account, /High Point/]) {
    await page.getByRole('button', { name }).first().tap()
    await page.waitForTimeout(400)
  }
}

const sheetTitle = (page) =>
  page.evaluate(() => document.querySelector('[role=dialog] [role=dialog] h2')?.textContent ?? null)

const formState = (page) =>
  page.evaluate(() => {
    const scroller = document.querySelector('[role=dialog] [class*=overflow-y-auto]')
    const form = scroller.querySelector('[data-entry-form]')
    const close = document.querySelector('[data-entry-close]').getBoundingClientRect()
    const rows = [...scroller.querySelectorAll('[data-entry-row] > button')].map((b) => b.getBoundingClientRect().height)
    return {
      scrollTop: scroller.scrollTop,
      scrollable: scroller.scrollHeight > scroller.clientHeight + 1,
      formOverflow: form.scrollHeight - scroller.clientHeight,
      closeTop: close.top,
      minRow: Math.min(...rows),
      active: document.activeElement?.id || document.activeElement?.tagName,
      description: document.querySelector('input[type=hidden][name=description]')?.value ?? null,
      notes: document.querySelector('input[type=hidden][name=notes]')?.value ?? null,
      rate: document.querySelector('input[type=hidden][name=exchange_rate_to_base]')?.value ?? null,
    }
  })

// ── Scenarios ──────────────────────────────────────────────────────────────

const scenarios = []
const scenario = (name, fn) => scenarios.push({ name, fn })

scenario('opens on one screen, amount focused, X in view', async () => {
  const { context, page } = await phone()
  await openForm(page)
  const state = await formState(page)
  assert.equal(state.scrollable, false, 'the form scrolls on open')
  assert.ok(state.closeTop >= 0 && state.closeTop < 60, `X at ${state.closeTop}px`)
  assert.equal(state.active, 'amount', 'the amount is not focused on open')
  await context.close()
})

scenario('the first open after an idle page is instant: the form data was prefetched', async () => {
  const { context, page } = await phone()
  await page.goto(`${BASE}/e2e/entry`)
  await page.waitForTimeout(5_000)
  // Watch for the "Loading form…" skeleton from before the tap: a cold open
  // shows it for as long as the data takes, a prefetched one never does.
  await page.evaluate(() => {
    window.__sawSkeleton = false
    new MutationObserver(() => {
      if (document.querySelector('[data-entry-skeleton]'))
        window.__sawSkeleton = true
    }).observe(document.body, { childList: true, subtree: true })
  })
  await page.tap('#open-entry')
  await page.waitForSelector('#amount', { timeout: 30_000 })
  assert.equal(await page.evaluate(() => window.__sawSkeleton), false, 'the first open showed the loading skeleton')
  await context.close()
})

scenario('the chain opens Description on its own screen; Enter moves on to Tags', async () => {
  const { context, page } = await phone()
  await openForm(page)
  await fillChain(page)
  assert.equal(await sheetTitle(page), 'Description')
  assert.equal(await page.evaluate(() => document.activeElement?.tagName), 'TEXTAREA')
  await page.keyboard.type('Coffee with Ana')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(400)
  assert.equal(await sheetTitle(page), 'Tags')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  const state = await formState(page)
  assert.equal(state.description, 'Coffee with Ana')
  assert.equal(state.scrollTop, 0, 'the form behind moved')
  await context.close()
})

scenario('Description takes no line breaks; Notes keeps them', async () => {
  const { context, page } = await phone()
  await openForm(page)
  await page.getByRole('button', { name: /^Description/ }).first().tap()
  await page.waitForTimeout(300)
  await page.evaluate(() => {
    const field = document.querySelector('[role=dialog] [role=dialog] textarea')
    const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
    set.call(field, 'one\ntwo')
    field.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await page.getByRole('button', { name: /^Done$/ }).first().tap()
  await page.waitForTimeout(300)
  // Done hands the chain on to the first required field still empty (the
  // category, on an empty form); back to the form for Notes.
  if (await sheetTitle(page)) await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: /^Notes/ }).first().tap()
  await page.waitForTimeout(300)
  await page.keyboard.type('line 1')
  await page.keyboard.press('Enter')
  await page.keyboard.type('line 2')
  await page.getByRole('button', { name: /^Done$/ }).first().tap()
  await page.waitForTimeout(300)
  const state = await formState(page)
  assert.equal(state.description, 'one two')
  assert.equal(state.notes, 'line 1\nline 2')
  await context.close()
})

scenario('two "Add next" in a row: two writes, ×2 pill, next draft at the top with the amount focused', async () => {
  const { context, page } = await phone()
  await openForm(page)
  const before = writes().length
  await fillChain(page)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  for (let i = 0; i < 2; i++) {
    if (i > 0) await page.locator('#amount').fill('7')
    await page.getByRole('button', { name: /add next/i }).first().tap()
    await page.waitForFunction(() => document.querySelector('#amount')?.value === '', null, { timeout: 15_000 })
    await page.waitForTimeout(400)
  }
  assert.equal(writes().length - before, 2)
  const pill = await page.evaluate(() => document.querySelector('[data-entry-amount]')?.textContent ?? '')
  assert.match(pill, /×2/)
  const state = await formState(page)
  assert.equal(state.scrollTop, 0)
  assert.equal(state.active, 'amount')
  await context.close()
})

scenario('a rejected save keeps the dialog and the draft', async () => {
  const { context, page } = await phone()
  await openForm(page)
  await fillChain(page, { amount: '999' })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  const before = writes().length
  await page.getByRole('button', { name: /^Create transaction$/ }).first().tap()
  await page.waitForSelector('[role=dialog] [role=alert]', { timeout: 15_000 })
  assert.equal(await page.locator('#amount').inputValue(), '999')
  assert.equal(writes().length - before, 1, 'the rejected attempt is the only write')
  await context.close()
})

scenario('a double tap on Create saves once', async () => {
  const { context, page } = await phone()
  await openForm(page)
  await fillChain(page)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  const before = writes().length
  // Two clicks in the same task: the second lands before React has rendered
  // the first one's pending state, which is the double tap that mattered.
  await page
    .getByRole('button', { name: /^Create transaction$/ })
    .first()
    .evaluate((button) => {
      button.click()
      button.click()
    })
  await page.waitForTimeout(2_500)
  assert.equal(writes().length - before, 1)
  await context.close()
})

scenario('the exchange rate opens on its own screen and the row shows it rounded', async () => {
  const { context, page } = await phone()
  await openForm(page)
  await fillChain(page, { amount: '50000', account: /Bancolombia/ })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: /Exchange rate/ }).first().tap()
  await page.waitForTimeout(300)
  assert.equal(await sheetTitle(page), 'Exchange rate')
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'user_rate')
  await page.locator('#user_rate').fill('2271.224242')
  await page.getByRole('button', { name: /^Done$/ }).first().tap()
  await page.waitForTimeout(300)
  const row = await page.getByRole('button', { name: /Exchange rate/ }).first().textContent()
  assert.match(row, /1 CAD = 2,271\.22 COP/)
  const state = await formState(page)
  assert.ok(Math.abs(Number(state.rate) - 1 / 2271.224242) < 1e-12, `saved rate ${state.rate}`)
  await context.close()
})

for (const [width, height] of [[412, 741], [360, 640]]) {
  scenario(`a foreign-currency entry still fits one screen at ${width}×${height}, rows ≥ 36px`, async () => {
    const { context, page } = await phone({ width, height })
    await openForm(page)
    await fillChain(page, { amount: '25', account: /Bancolombia/ })
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)
    const state = await formState(page)
    assert.equal(state.scrollable, false, `overflows by ${state.formOverflow}px`)
    assert.ok(state.minRow >= 36, `a row is ${state.minRow}px tall`)
    await context.close()
  })
}

scenario('a transfer amount moves above the keyboard without moving the X', async () => {
  const { context, page } = await phone()
  await openForm(page)
  await page.locator('[role=dialog]').getByText(/^Transfer$/).first().tap()
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: /Select source/ }).first().tap()
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: /^Checking/ }).first().tap()
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: /Bancolombia/ }).first().tap()
  await page.waitForTimeout(600)
  await page.evaluate(() => document.activeElement?.blur())
  await page.locator('#to_amount').tap()
  await page.waitForTimeout(500)
  const { fieldTop, closeTop } = await page.evaluate(() => ({
    fieldTop: document.getElementById('to_amount').getBoundingClientRect().top,
    closeTop: document.querySelector('[data-entry-close]').getBoundingClientRect().top,
  }))
  assert.ok(fieldTop < 200, `the received amount sits at ${fieldTop}px`)
  assert.ok(closeTop >= 0 && closeTop < 60, `X at ${closeTop}px`)
  await context.close()
})

async function startTransfer(page, destination) {
  await page.locator('[role=dialog]').getByText(/^Transfer$/).first().tap()
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: /Select source/ }).first().tap()
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: /^Checking/ }).first().tap()
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: destination }).first().tap()
  await page.waitForTimeout(600)
  await page.evaluate(() => document.activeElement?.blur())
}

for (const [width, height] of [[412, 741], [360, 640]]) {
  scenario(`a same-currency transfer with its fee fits one screen at ${width}×${height}`, async () => {
    const { context, page } = await phone({ width, height })
    await openForm(page)
    await startTransfer(page, /^Visa/)
    const state = await formState(page)
    assert.equal(state.scrollable, false, `overflows by ${state.formOverflow}px`)
    assert.ok(state.minRow >= 36, `a row is ${state.minRow}px tall`)
    await context.close()
  })
}

scenario('the transfer fee opens on its own screen and travels in the form', async () => {
  const { context, page } = await phone()
  await openForm(page)
  await startTransfer(page, /^Visa/)
  await page.getByRole('button', { name: /^Fee|Transfer fee/ }).first().tap()
  await page.waitForTimeout(300)
  assert.ok(await sheetTitle(page), 'no fee screen')
  await page.keyboard.type('2')
  await page.getByRole('button', { name: /^Done$/ }).first().tap()
  await page.waitForTimeout(300)
  const fee = await page.evaluate(() => document.querySelector('input[type=hidden][name=fee_amount]')?.value)
  assert.equal(fee, '2')
  const row = await page.getByRole('button', { name: /^Fee|Transfer fee/ }).first().textContent()
  assert.match(row, /2\.00/)
  // No fee-like category in the fixtures: the row says why Save is waiting,
  // and the hint still fits the screen.
  assert.match(row, /Choose a category/)
  assert.equal((await formState(page)).scrollable, false, 'the hint pushed the form past one screen')
  await context.close()
})

scenario('a cross-currency transfer fits one screen at 360×640', async () => {
  const { context, page } = await phone({ width: 360, height: 640 })
  await openForm(page)
  await startTransfer(page, /Bancolombia/)
  const state = await formState(page)
  assert.equal(state.scrollable, false, `overflows by ${state.formOverflow}px`)
  await context.close()
})

for (const kind of ['expense', 'transfer']) {
  scenario(`editing a${kind === 'expense' ? 'n expense' : ' transfer'} opens the same full-screen sheet, on one screen`, async () => {
    const { context, page } = await phone()
    await page.goto(`${BASE}/e2e/entry?edit=${kind}`)
    await page.waitForSelector('[data-entry-close]', { timeout: 30_000 })
    await page.waitForTimeout(600)
    const sheet = await page.evaluate(() => {
      const box = document.querySelector('[data-slot=dialog-content]').getBoundingClientRect()
      return { top: box.top, height: box.height, viewport: window.innerHeight, title: document.querySelector('[data-slot=dialog-title]')?.textContent }
    })
    assert.equal(Math.round(sheet.top), 0, 'not full screen')
    assert.equal(Math.round(sheet.height), sheet.viewport, 'not full screen')
    assert.match(sheet.title ?? '', /Edit (transaction|transfer)/)
    const state = await formState(page)
    assert.equal(state.scrollable, false, `overflows by ${state.formOverflow}px`)
    await page.getByRole('button', { name: /^Description/ }).first().tap()
    await page.waitForTimeout(300)
    assert.equal(await sheetTitle(page), 'Description')
    await context.close()
  })
}

scenario('desktop: a rejected save keeps the description and notes', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  await context.addCookies([sessionCookie()])
  const page = await context.newPage()
  await page.goto(`${BASE}/e2e/entry`)
  await page.click('#open-entry')
  await page.waitForSelector('#amount', { timeout: 30_000 })
  await page.locator('#amount').fill('999')
  await page.locator('[role=dialog] button', { hasText: /Select category/ }).first().click()
  await page.getByRole('option', { name: /Groceries/ }).or(page.getByRole('button', { name: /Groceries/ })).first().click()
  await page.waitForTimeout(300)
  await page.keyboard.press('Escape').catch(() => {})
  const account = page.locator('[role=dialog] button', { hasText: /Select account/ }).first()
  if (await account.count()) {
    await account.click()
    await page.getByRole('option', { name: /^Checking/ }).or(page.getByRole('button', { name: /^Checking/ })).first().click()
    await page.waitForTimeout(300)
  }
  await page.locator('#description').fill('Kept after an error')
  const more = page.getByRole('button', { name: /More details/ }).first()
  if (await more.count()) await more.click()
  await page.locator('#notes').fill('Notes too')
  await page.getByRole('button', { name: /^Create transaction$/ }).first().click()
  await page.waitForSelector('[role=dialog] [role=alert]', { timeout: 15_000 })
  await page.waitForTimeout(300)
  assert.equal(await page.locator('#description').inputValue(), 'Kept after an error')
  assert.equal(await page.locator('#notes').inputValue(), 'Notes too')
  await context.close()
})

scenario('desktop: a centred dialog that a backdrop click still closes', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  await context.addCookies([sessionCookie()])
  const page = await context.newPage()
  await page.goto(`${BASE}/e2e/entry`)
  await page.click('#open-entry')
  await page.waitForSelector('#amount', { timeout: 30_000 })
  const box = await page.evaluate(() => document.querySelector('[data-slot=dialog-content]').getBoundingClientRect().toJSON())
  assert.ok(box.left > 200 && box.width < 700, `dialog box ${JSON.stringify(box)}`)
  await page.mouse.click(20, 400)
  await page.waitForTimeout(600)
  assert.equal(await page.locator('[data-slot=dialog-content]').count(), 0, 'the backdrop click did not close it')
  await context.close()
})

// ── Run ────────────────────────────────────────────────────────────────────

let failed = 0
for (const { name, fn } of scenarios) {
  const started = Date.now()
  try {
    await fn()
    console.log(`  ✓ ${name} (${Date.now() - started} ms)`)
  } catch (error) {
    failed += 1
    console.log(`  ✗ ${name}\n      ${String(error?.message ?? error).split('\n').join('\n      ')}`)
  }
}
await browser.close()
console.log(failed ? `\n${failed} of ${scenarios.length} scenarios failed` : `\nAll ${scenarios.length} scenarios passed`)
process.exit(failed ? 1 : 0)
