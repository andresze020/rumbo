# Sprint Log — Rumbo

Append-only record of closed sprints. One entry per sprint, newest at the top.
Maintained at sprint close by the `app-finanzas-state-sync` skill.

History before this log (Sprints 2.x–12.x) lives in `docs/alpha/` and
`docs/alpha-readiness-checklist.md`. Start logging here going forward.

<!-- Template:
## Sprint <X.Y> — <short name>  (<YYYY-MM-DD>)
- Goal:
- Shipped:
- Migrations added:
- Tables changed:
- Follow-ups / known gaps:
-->

## Mobile chrome: from chasing the viewport to an app shell (2026-08-24 → 2026-08-29)
- Goal: make the mobile top bar and bottom nav hold still on a real phone.
  Twenty-one commits, PRs #48-#61, merged straight onto `main` rather than
  through one sprint branch — each one was a fix shipped to a device to be
  re-tested, not a planned slice. Recorded here as a single entry because they
  are one investigation.
- Shipped:
  - **The app shell (#61)** — the fix that actually held. The dashboard is a
    box exactly one viewport tall (`h-dvh overflow-hidden`) that does not
    scroll; `MobileNav` and `MobileBottomNav` are ordinary flex rows inside it
    and `<main id="app-scroll">` is the only scrolling box. A bar that is not
    inside the scroller cannot be moved by the scroller, on any engine, with
    nothing measured and nothing to keep in sync. `dvh` so the shell tracks a
    browser toolbar opening and closing; `overscroll-contain` so a bounce at
    either end is not handed to the document behind it. Verified in headless
    Chromium against the real compiled Tailwind: across the whole scroll range
    the top bar holds 0..56 and the nav holds 635..700 flush with the viewport
    bottom while the scroller moves 0 -> 2445, and `window.scrollY` stays 0.
  - **`src/lib/app-scroll.ts`** — the document no longer scrolls, so
    `window.scrollY` and a `scroll` listener on `window` are both dead in the
    dashboard. Two things had to be repointed at the new scroller: the
    assistant FAB's hide-while-scrolling, which would have heard nothing, and
    the reset-to-top on route change, since the router's scroll restoration
    drives the document and every screen would have inherited the last one's
    position.
  - **Install hint inside `main` (#60)** — it was a sibling *above* `main`, so
    it started at y=0 and wore the fixed top bar; on a notched phone the bar is
    ~59px taller and the card was covered almost entirely. Kept above
    `ScreenTransition` so it does not replay the arrival animation on every
    route change.
  - **Inward clamp at scale 1 (#59)** — Safari pins `fixed` to the visual
    viewport while `getBoundingClientRect` keeps answering with the layout
    position, so the probes read 0 for chrome Safari had already placed
    correctly, and a toolbar collapse then translated both bars *down* by the
    offset. A correction may now pull chrome onto the screen, never push it
    off. Zoom untouched: panning a pinch-zoomed page genuinely has to follow
    the visual viewport both ways.
  - **The rename to Rumbo (#58)** — `package.json`, `public/manifest.json`,
    README, AGENTS.md, `.claude/CLAUDE.md`, the scripts, the AI prompts, the
    glossary and the i18n dictionaries.
  - **#48-#57, the attempts that did not hold** — keeping the nav on the screen
    edge while the toolbar moves (#48), an on-device viewport readout (#49),
    pinning to the real containing block (#50), re-measuring on layout changes
    (#51), trimming the pinned bars to the visible width (#52), clamping the
    page shell (#53), then the document (#55), letting the dashboard cards
    shrink (#56), and restoring one-finger scrolling after `overflow-x` on the
    root took it away (#57). The width clamps and the card fixes stand; the bar
    pinning they were built around does not.
- Migrations added: none.
- Tables changed: none.
- Follow-ups / known gaps:
  - **None of it has been checked on a real iPhone.** The device report that
    started this was an iPhone; the fix is verified only in headless Chromium.
    Recorded in `docs/pending-work.md` §4.
  - PR #54 was left open and conflicted, superseded by #55-#57 and then by #61.
  - `.vv-pin-top` was left with no consumers, and the temporary on-device
    readout from #49 was left mounted in production. Both cleaned up on
    2026-09-02 along with this entry, which is the sprint close these PRs never
    got.

## Zoom overlays, dashboard activity, and sprint-closing cleanup (2026-08-22)
- Goal: close the two mobile-UI gaps the viewport-pinning sprint (2026-08-21)
  deliberately deferred — modal overlays under pinch zoom (P4) and dashboard
  text truncation (P3) — ship the text-size setting that sprint also scoped
  out, and clear three more P3 rows sitting in `docs/pending-work.md` §3: CI
  on pull requests, runnable ledger invariants, and the Tier-3/4
  authenticated-QA checklist. The assistant also moves to a cheaper model.
  Seven commits on `fix/mobile-ui-zoom-overlays-and-activity`.
- Shipped:
  - **Modal overlays pinned to the visual viewport.** New `.vv-pin-screen`,
    `.vv-pin-screen-center` and `.vv-pin-screen-edge` utilities in
    `globals.css`, fed by new `--vv-width`/`--vv-height` published by
    `ViewportPin`. Unlike the chrome (counter-scaled to keep its on-screen
    size), an overlay is content and a zoom should magnify it, so these
    rules restate the element's box in visual-viewport terms with no
    transform and no wrapper — each overlay already owns its own transform
    (`-translate-1/2` centring, `zoom-in-95`, vaul's drag offset), and a
    wrapper would add a stacking context and containing block the overlay
    does not expect. `.vv-pin-screen-edge` reads `data-side` /
    `data-vaul-drawer-direction` so one class serves Base UI sheets and vaul
    drawers alike. Applied to `dialog.tsx`, `alert-dialog.tsx`, `sheet.tsx`,
    `drawer.tsx`, `selector-sheet.tsx`, and the transactions filter sheet —
    a sheet on phones and a static toolbar from `sm:` up, so it disables the
    pin above that breakpoint by shadowing the CSS variables locally
    (`sm:[--vv-height:none] sm:[--vv-width:auto]`).
  - **Recent Activity stops truncating.** The amount column goes from a
    fixed 88px to `auto` (a six-figure COP amount didn't fit, and truncating
    money is never the right answer); the title wraps to two lines on phone
    instead of one ellipsis; the secondary line becomes a flex row with the
    date `shrink-0`, so the old single `truncate` over `subtitle · date` no
    longer loses the date to whichever text came first. The assistant FAB
    (`assistant-drawer.tsx`) now fades out (opacity only — `vv-pin-corner`
    already owns its transform) while the page scrolls down and returns on
    scroll-up or a 1.2s pause, via a new `useScrollingDown` hook watching
    `window.scrollY` with a 12px jitter threshold. Not hidden on phone: it
    is the only assistant entry point there.
  - **In-app text size.** New Settings control (`default`/`large`/`larger`)
    stored in the existing `profiles.ui_preferences` jsonb — no migration.
    Applied as a `%` root `font-size` (112.5% / 125%) via new
    `TextSizeSync`, mounted in the dashboard layout rather than the root
    layout so `/login` never pays for a profile read to learn a preference
    it can't have; `revalidatePath` moved to `revalidatePath('/dashboard',
    'layout')` for the same reason. Percentage, not px, so a reader's own
    browser-level zoom stacks instead of being overridden; everything in the
    UI is `rem`, so type/padding/control heights move together, and
    Tailwind's breakpoints still resolve against the *initial* root size, so
    a phone stays on the phone layout. Surfaced a pre-existing
    `audit-i18n.mjs` gap: it does not see object values reached by computed
    index, so the settings `<select>` option labels (including
    `PERIOD_LABELS`) were never translated despite the coverage check
    passing — fixed alongside (`legacy-ui-translations.ts`).
  - **CI on pull requests.** New `.github/workflows/ci.yml` (`.github/` did
    not exist before): lint → `tsc --noEmit` → `i18n:check` → build, on PRs
    and pushes to `main`. Runs with placeholder Supabase env values —
    verified the build reaches them safely, since every route is
    server-rendered on demand and the Anthropic client is lazy, so no
    secret is needed or referenced.
  - **`npm run db:test`.** New `scripts/db-test.mjs` makes the three
    `supabase/tests/*.sql` ledger-invariant files actually runnable over the
    Management API instead of hand-pasted into the SQL editor. Shared
    plumbing (`apiContext`, `fail`, `log`, `runSql`, `runScript`) extracted
    into new `scripts/lib/supabase-api.mjs` and reused by `db-push.mjs`. The
    splitter sends each statement alone so its result comes back, except an
    explicit `begin;...rollback;` block (`br_019`'s throwaway-goal assert),
    which is grouped and sent whole — splitting it would commit the body in
    its own transaction and leave test data in production. Refuses to guess
    the household when a project holds more than one, and lists only ids in
    that case, never household names. Also fixes a latent Windows bug in
    `db-push`: the old `process.exit()` while `fetch` still held a
    keep-alive socket tripped a libuv assertion
    (`!(handle->flags & UV_HANDLE_CLOSING)`) and crashed with `0xC0000409`
    instead of exit code 1; `runScript` now lets the event loop drain via
    `process.exitCode` instead.
  - **Tier-3/4 authenticated-QA checklist.** New
    `docs/alpha/tier-3-4-authenticated-qa.md`, eleven rows — the ten
    features from `docs/pending-work.md` §4.3 plus BR-031, which that list
    had missed even though it shipped in Tier-3 and is equally untested.
    Each row states the observable invariant that closes it rather than a
    click path. All eleven rows are `Untested` — this is the scaffolding,
    not a completed pass.
  - **Assistant moved to Claude Haiku 4.5.** `ASSISTANT_MODEL`
    (`src/lib/ai/client.ts`) moves from `claude-sonnet-4-6` to
    `claude-haiku-4-5` — Anthropic's cheapest tier, $1/$5 per million tokens
    in/out against Sonnet 5's $3/$15. Capabilities checked against the
    Models API rather than assumed: `image_input` is supported, so
    receipt-photo extraction still works; the tier caps out at 200K context
    / 64K output; and it does **not** support adaptive thinking or
    `output_config.effort` — sending `effort` is an outright error, and
    neither call site sends one. `max_tokens` also rises from 1024, which
    silently truncated long answers mid-sentence since nothing checked
    `stop_reason`: 16000 for the main assistant loop (`assistant/actions.ts`),
    4096 for the smaller receipt-draft extraction call.
- Migrations added: none.
- Tables changed: none.
- Follow-ups / known gaps: the Tier-3/4 QA checklist is scaffolding only —
  all eleven rows are still `Untested`, no pass has been run against it yet.
  Whether the CI workflow has actually run green on a real pull request, and
  whether `npm run db:test` has been run against the live database, are not
  established by this diff either way.

## Chrome pinned to the visual viewport (2026-08-21)
- Goal: reported from a phone — "bajo ciertas condiciones hago scroll rápido y
  como que se hace un poco de zoom y se corta o el encabezado o la barra de
  abajo", with two screenshots showing one of each. Not a scroll bug: a stray
  second finger during a fling pinch-zooms the page a few percent, and
  `position: fixed` anchors to the *layout* viewport, which is then bigger than
  the screen — so the fixed chrome sits partly outside it.
- Shipped: `ViewportPin` (`src/components/viewport-pin.tsx`, mounted in the root
  layout) publishes the visual viewport's geometry — `--vv-left`, `--vv-top`,
  `--vv-right-delta`, `--vv-bottom-delta`, `--vv-scale`, `--vv-inv-scale` — plus
  a `data-vv-zoomed` flag on `<html>`, rAF-throttled because the visual viewport
  moves on the compositor and its events arrive in bursts. Three utilities in
  `globals.css` consume them: `.vv-pin-top`, `.vv-pin-bottom` and
  `.vv-pin-corner` translate the element onto the visual viewport and
  counter-scale it by `1/scale`, so it keeps its on-screen size at the screen
  edge while the zoom magnifies only the content underneath. Applied to the
  mobile header, the bottom nav, the toast stack and both FABs.
- Migrations added: none.
- Tables changed: none.
- Design notes: everything is scoped to `[data-vv-zoomed]`, which only exists
  while `visualViewport.scale` deviates from 1 by more than 0.01 — at rest there
  is no transform, no new containing block for anything `fixed` rendered inside
  the bars (the trap `.animate-screen-in` documents), and no per-scroll work.
  The soft keyboard shrinks the visual viewport *without* changing the scale, so
  `useMobileKeyboardInset` in `transaction-dialog-provider.tsx` is untouched.
  Verified in headless Chromium at scale 1.5 panned to (20, 100): top bar lands
  at screen (0, 0) at full width and its natural 56px height, bottom bar flush
  at the screen bottom, FABs 24px from both screen edges at natural size.
- Follow-ups / known gaps: modal overlays (`fixed inset-0` dialogs and bottom
  sheets) are **not** pinned — opened while zoomed they still anchor to the
  layout viewport. Not reported, deliberately left alone. There is also no
  reliable way to reset the zoom from code: the meta-viewport rewrite trick is
  Chrome-Android-only and was rejected rather than shipped half-working. The
  decision to keep pinch zoom enabled, and why disabling it would not work
  anyway, is recorded in `docs/pending-work.md` §2.

## Exchange rates refresh themselves (2026-08-21)
- Goal: the FX revaluation made balances read at a real rate, but only if
  someone typed one in every day. Nobody is going to do that.
- Shipped: `refreshExchangeRatesAction` fetches any rate not dated today from
  the public feed the entry forms already use, run as the signed-in user (RLS
  applies; no service-role key, no cron). `ExchangeRateAutoRefresh` in the
  dashboard layout triggers it once per browser session per day via
  `sessionStorage`. `fetchDirectRate` reads the pair in the ledger's direction
  with an inverse fallback. Rates carry the provider's publication date, not
  today's. Settings shows auto vs manual and gains an Update now button.
- Migrations added: none.
- Tables changed: none.
- Follow-ups / known gaps: rates only refresh when someone opens the app, so
  days nobody visits leave a gap in the daily series (the as-of lookup covers
  it by using the newest earlier rate; the net-worth curve is just coarser). A
  Vercel Cron calling the same action would fill those in. The provider is a
  free community feed with no SLA — verified by the four forms that already
  depend on it, not by a contract.

## Balance FX revaluation (2026-08-20)
- Goal: an account's base-currency equivalent and net worth should say what the
  money is worth now, not what it cost. Surfaced by the AndroMoney import, whose
  four years of history made the gap impossible to miss (≈ 9.647 CAD shown for
  pesos worth ≈ 13.278 CAD).
- Shipped: `20260817120000_balance_fx_revaluation.sql` revalues both
  `get_account_balances` overloads at the rate in effect on the date shown,
  leaving flows (allocations, reports, budgets) on their own transaction-date
  rate. New `get_exchange_rate_as_of` returns rate + rate_date;
  `get_exchange_rate` keeps its contract as a wrapper. Falls back to the
  historical sum when no rate is on file. Settings → Exchange rates editor,
  accounts-screen notice for currencies that fell back, `settings.exchangeRates`
  dictionary keys in en/es/fr. The AndroMoney importer merged earlier is what
  made the problem visible.
- Migrations added: `20260817120000_balance_fx_revaluation.sql` — **pending**,
  run `npx supabase db push`.
- Tables changed: none. Two functions gain columns (each dropped and recreated,
  since `create or replace` cannot change a `returns table` shape).
- Follow-ups / known gaps: with one rate on file the net-worth history steps at
  the month that rate is dated — earlier months fall back to cost basis. Saving
  a rate per month smooths it. Rates are entered by hand; no rate feed.

## Transactions list — slim rows, premium polish (2026-08-19, merged 2026-08-20)
- Goal: the transactions screen looked like a data-entry tool, not something
  worth paying for. On desktop every row rendered its full detail block
  inline, so a page of 4.633 transactions read as 4.633 toolbars; on phones
  the row was so cramped that account names truncated mid-word.
- Shipped:
  - One slim line per row at every breakpoint. Badges, tags, notes and the
    action buttons moved behind the row's own chevron. `compact` (BR-038) is
    now density only (32px avatar, shorter padding), since the collapse is
    universal.
  - A rounded, tinted avatar per row — the category's emoji when there is
    one, otherwise the direction arrow — in the same visual language as
    `AccountAvatar`.
  - A leaf category inherits icon and colour from its nearest ancestor
    (`inheritCategoryVisual`). System categories ship with icons and no
    colour (see 20260612180000), while sub-categories are user-made and have
    neither, so "Investments / Time Deposit" used to fall back to a bare
    arrow. Read-only: no data was written.
  - Rows carry `categoryLeafName` ("Time Deposit"); the full path
    ("Investment / Time Deposit") only appears in the expanded panel. The
    emoji lives in the avatar and nowhere else.
  - Column layout driven by `@container`, not `lg:`. Keyed to the viewport it
    switched to columns exactly where the sidebar left the card ~740px wide
    and every description truncated to "Trans…". **Tailwind v4 needs
    `@min-[60rem]:`; the v3 form `@[60rem]:` silently compiles to nothing** —
    verified by compiling the real class strings through
    `@tailwindcss/postcss` rather than trusting a green build.
  - Fixed-width columns so figures line up across rows. An `auto` amount
    column had made every row size itself to its own number.
  - Checkboxes on demand: hover on pointer devices, a "Select" toggle on
    touch. Review state is a dot in a fixed-width slot, not a badge in the
    text.
  - Only inflows are tinted (income emerald, refund teal); outflows read in
    the plain foreground, since the leading minus already says the direction.
  - Filtered totals became one divided card on every breakpoint (Net turns
    red when negative) and the review filters became a segmented control.
  - An untitled row falls back to payee, then category, instead of reading
    "Transaction" over and over.
  - The row no longer shows the time of day (see follow-ups); the details
    panel still does.
  - Unrelated but blocking: the `Stop` verify-gate hook spawned `npx.cmd`
    through `execFileSync`, which Node ≥18.20 refuses without `shell: true`.
    It threw `EINVAL` with no output, so the gate failed every turn on
    Windows and reported "salio con error y sin output". It now runs
    `node_modules/typescript/bin/tsc` with `process.execPath`, the pattern
    the repo's own scripts already use.
- Migrations added: none.
- Tables changed: none. `categoryLeafName` and the icon inheritance are
  derived at read time from columns the page already selected.
- Follow-ups / known gaps:
  - The create form cannot record a time of day, so BR-045's
    `transaction_time` is empty for everything entered by hand and only
    imports carry one. Either add the input or retire the field.
  - Categories imported from AndroMoney have no icon, and neither do their
    parents, so those rows still show the direction arrow. Assigning an icon
    to the parent covers every child through the new inheritance.
  - Neutral (non-red) expense amounts are a deliberate call — one line in
    `getAmountColorClass` if it reads wrong with real data.
  - Per-day totals in the date headers were considered and skipped: rows are
    multi-currency, so a correct total has to come from
    `transaction_allocations` in base currency, which is a ledger change and
    not a UI one.

## Development automation, second wave — context budget (2026-08-19)
- Goal: the first wave made Claude *correct* (a Stop hook that blocks broken
  types). This one makes it *cheap*. Measured drains: `AGENTS.md` cost ~11k
  tokens on every session start, single source files cost 17k–32k when read
  whole, and the Supabase MCP schemas cost 2k–4k whether or not the DB was
  touched.
- Shipped:
  - `AGENTS.md` trimmed 42.333 → ~9.500 bytes by keeping only the two newest
    sprint entries. *Hard-backlog integration PR #37* and *Analysis & planning
    screens PR #12* existed only there and were migrated into this log first.
  - Subagents `scout`, `i18n-scribe`, `migration-drafter`, `sprint-closer` —
    each isolates a job whose exploration would otherwise flood the main
    context. `migration-drafter` inherits the absolute ban on running anything
    against the database.
  - Commands `/buscar`, `/contexto`, `/i18n`, `/cerrar-sprint`.
  - `PreToolUse` hook `context-guard.mjs`: blocks generated artifacts outright,
    and blocks whole reads of files over 700 lines (`BIG_FILE_LINES`) unless
    `offset`/`limit` is used. Covers the shell escape hatch (`cat`, `type`,
    `Get-Content`) too; `cat X | head`, `sed -n` and `grep` pass. Paths are
    normalised to `/` before matching — backslash patterns did not survive the
    trip through heredocs and JSON, and a guard that fails silently is worse
    than none.
  - `disabledMcpjsonServers: ["supabase"]`; read-only shell commands added to
    the permission allowlist so cheap calls stop costing a round trip.
- Migrations added: none.
- Tables changed: none.
- Follow-ups / known gaps: the 700-line threshold is a guess, not a
  measurement — tune `BIG_FILE_LINES` if it starts blocking legitimate full
  reads. Delegating to a subagent costs its own tokens, so `scout` is a loss
  for questions a single grep answers. The saving on `AGENTS.md` only holds if
  `sprint-closer` keeps rotating the third entry out.

## Development automation, first wave (2026-08-19)
- Goal: stop relying on Claude *remembering* to run the validation gate and to
  respect the ledger rules. A skill is memory and can be ignored; a hook is the
  only primitive that guarantees anything.
- Shipped: subagent `ledger-guard` (`.claude/agents/`, read-only, reports
  🔴/🟡/✅ against the ledger + RLS + migration rules, never edits) and the
  `/revisar-ledger` command that makes it discoverable. Hooks in
  `.claude/hooks/`: `session-context.mjs` (SessionStart, informational — branch
  and working-tree state, covering the "verify clean working tree" rule) and
  `verify-gate.mjs` (Stop, blocking — runs `npx tsc --noEmit`, exits 2 with the
  errors on failure). The gate guards `stop_hook_active` against an infinite
  loop, skips doc-only turns, caches a passing tree fingerprint, checks commits
  against `main` so committing does not evade it, and warns instead of blocking
  when `node_modules` is missing. Written as `.mjs` because the canonical
  checkout is Windows/PowerShell while remote sessions run Linux.
  `docs/ai-agents-workflow.md` explains the four primitives, when to reach for
  each, and measured costs.
- Migrations added: none.
- Tables changed: none. Nothing in `src/` was touched.
- Follow-ups / known gaps: **no CI** — `.github/` still does not exist, so PRs
  merge with zero automated validation; the local Stop hook only covers work
  that leaves this machine. **No JS/TS test framework**; the three invariant
  files in `supabase/tests/` are still not executable by any script, which is
  the cheapest real coverage available. Manual localhost QA is unautomated
  (needs Playwright — a sprint of its own). Both rows are indexed in
  `docs/pending-work.md` §3.

## AndroMoney history importer (2026-08-17)
- Goal: get four years of AndroMoney history into the app so it can replace it,
  which the in-app CSV importer cannot do (one account per run, transfer rows
  rejected, accounts/categories required to exist).
- Shipped: `scripts/andromoney-parse.mjs` (pure parsing/planning — Big5-ish
  decoding including the ~65 words whose accents AndroMoney wrote as literal
  `?`, `yyyyMMdd` dates, `HHmm` times, and each subcategory's income/expense
  direction derived from how the rows actually use it, splitting a parent used
  in both directions) and `scripts/andromoney-import.mjs` (`plan` / `apply` /
  `revert`). Posts through the existing RPCs as the signed-in user, so RLS and
  the ledger invariants hold; batches into `import_batches`/`import_rows` keyed
  on AndroMoney's `uid` for resume + one-click revert. Cross-currency transfer
  legs must be confirmed rather than estimated, and FX rates start empty.
  Documented in `docs/features/andromoney-import.md`.
- Migrations added: none.
- Tables changed: none.
- Follow-ups / known gaps: not yet run against a live household — the session
  that wrote it had no network route to Supabase. Non-base-currency rows are
  valued from a per-year (or per-month) rate table, not the rate of the day, so
  account balances in their own currency are exact but base-currency figures are
  only as good as that table. AndroMoney's `Periodic` column is dropped;
  recurring rules have to be rebuilt under `/dashboard/recurring`.

## Transaction row expand + fixed-overlay fix (2026-08-15, PR #40)
- Goal: two mobile defects found in real use on `/dashboard/transactions`.
- Shipped: (1) the expand toggle covered only the title/subtitle block, so
  tapping the amount or the chevron did nothing — the whole summary line is now
  the toggle and the selection checkbox stops bubbling, so selecting never
  expands (`transaction-list.tsx`). (2) `ScreenTransition` used
  `animation-fill-mode: both`, which keeps the route transition in effect
  forever, leaving its wrapper a transform containing block for the life of the
  screen; every in-page `fixed` overlay then anchored to the bottom of the
  scrolling document instead of the viewport and painted under the bottom nav
  and the FABs — **Apply filters was off-screen and unreachable**. Switched to
  backwards fill (equivalent given the final keyframe) and gave the filter sheet
  Back/Escape dismissal plus dialog semantics (`globals.css`,
  `transaction-filters.tsx`).
- Migrations added: none.
- Tables changed: none.
- Follow-ups / known gaps: none.

## Sticky filters + native-feeling mobile navigation (2026-08-10, merged 2026-08-12)
- Goal: make the transactions screen remember where the user was and make
  overlays behave like an installed app on Android.
- Shipped: `af_tx_scope` cookie remembers the last *narrowed* filter scope for 12
  hours (`lib/filters/transaction-scope-memory.ts`) and a bare landing redirects
  to it; `TransactionDialogProvider` passes the full URL as `return_to` (creating
  a transaction used to land on an unfiltered list); the filter bar applies via
  `router.push` instead of a native GET submit, so the bar and `MultiSelectChip`
  re-seed staged state from applied props; `useBackDismiss`
  (`lib/use-back-dismiss.ts`) gives overlays a history entry so Android Back
  closes only the top one; `CategoryPicker` chains into Subcategory;
  `ScreenTransition` animates route changes. Faster capture: "Save & Add Next"
  carries `next_category`/`next_payee`/`next_tags` alongside date/type/account/
  status (amount, description and notes stay empty), and a new entry opened from
  the transactions list seeds from filters that name exactly one value.
  Prefilling from "the last transaction you saved" was deliberately rejected — a
  carried-over category is a miscategorised transaction nobody chose. Keyboard
  fix: the dialog header collapses to `sr-only` while the keyboard is up and
  `useKeepFocusedFieldVisible` re-centres the focused field after the sheet
  resizes.
- Migrations added: none.
- Tables changed: none.
- Follow-ups / known gaps: the scope cookie lands ahead of BR-038's landing
  preferences; reconcile the two when BR-038 grows.

## Tier-4 large sprint (2026-07-30, merged 2026-08-12)
- Goal: the six "grandes" benchmark items, each at the first slice its backlog
  row prescribes. Branch `sprint/tier4-large`, based on `sprint/tier3-medium`
  and merged carrying its commits.
- Shipped:
  - **BR-045 optional time-of-day** — nullable `transactions.transaction_time`
    (a `time`, not a `timestamptz`: promoting the column would re-interpret every
    existing date-only row against a timezone the database does not know).
    Display and ordering only; every monthly RPC, budget, report and closure
    still filters on `transaction_date`. Opt-in via BR-032 preferences and the
    first such field that defaults to hidden. Written with a plain UPDATE after
    `create_manual_transaction` returns, never a 13th parameter.
    `search_household_transactions` is DROPped and recreated (its `RETURNS TABLE`
    gains a column).
  - **UC-9 recurring transfers** — `recurring_transactions.to_account_id` +
    `recurring_transactions_shape_chk` (a transfer needs both accounts, differing,
    and no category). Manual posting routes to `create_transfer_transaction`;
    `run_recurring_autopost` gains a transfer branch writing two entries at the
    source rate. **Cross-currency transfers cannot auto-post** — the arriving
    amount is a real value only the user knows: the form disables the toggle, the
    server action refuses it, and the job flags-and-skips.
  - **BR-030 credit-card statement cycle (slice 1)** — `accounts.statement_day`,
    `payment_day`, `billing_account_id`, both days or neither, only on
    `credit_card`/`debt`. `get_card_cycle_summaries` returns `payable`,
    `outstanding`, `statement_balance`, `paid_since_close`, `is_overdue`,
    positive-as-owed; `payable` excludes `outstanding` and the two are never
    added together on screen. Date math lives in SQL *and* `lib/cards/cycle.ts`
    on purpose. The `Pay` settlement action is deliberately not bundled.
  - **BR-035 installment purchases** — new `installment_plans` table plus
    `/dashboard/installments`. **The plan holds no money**: no entries, no
    allocation; all value lives in N child expenses of `total/N` linked by
    `installment_plan_id`/`installment_number`. Double-counting is impossible by
    construction — there is no parent transaction — and no report, budget or
    monthly RPC changed. The last installment absorbs the rounding remainder.
  - **BR-040 refunds as a negative amount** — decision doc first
    (`docs/features/refunds-negative-amounts.md`). `transaction_allocations` did
    not tolerate negatives (two `> 0` CHECKs); everything else already did.
    Constraints were **narrowed**, not dropped: negatives only where
    `allocation_type = 'expense'`, zero still forbidden. A refund is then an
    ordinary expense allocation, so every reporting surface nets it with **no
    change to shared financial SQL**. New `refund` type, positive entry, negative
    allocation, `create_refund_transaction` refuses more than what is left.
  - **BR-036 configurable month start day (slice 1)** —
    `households.month_start_day` (default 1) plus **one** resolver,
    `src/lib/periods/month.ts`, used by **one** screen, `/dashboard/reports`
    (chosen because it already worked from an explicit `date_from`/`date_to`
    pair, so no RPC was touched). A period labelled `YYYY-MM` starts on
    `month_start_day` and ends the day before the next one starts.
  - Also fixed here: BR-042's week rows gated on "exactly one calendar month",
    never true under a custom start day, so they now gate on a 28–31 day span;
    and `scripts/generate-legacy-translations.mjs` was destructive — it rebuilt
    the catalog from `audit-i18n.mjs` findings alone and silently deleted every
    entry it did not collect. It now seeds from the committed catalog and writes
    sorted output. Coverage: 1,209 phrases × 2 locales.
- Migrations added: `20260730120000_br_045_transaction_time.sql`,
  `20260730130000_uc_009_recurring_transfers.sql`,
  `20260730140000_br_030_card_statement_cycle.sql`,
  `20260730150000_br_035_installment_plans.sql`,
  `20260730160000_br_040_refunds.sql`,
  `20260730170000_br_036_month_start_day.sql` — all **applied 2026-08-12**.
- Tables changed: `transactions`, `recurring_transactions`, `accounts`,
  `transaction_allocations`, `households`; new `installment_plans`.
- Follow-ups / known gaps: BR-030 slice 2 (`Pay` settlement action); BR-036
  slice 2 (budgets, closures and the dashboard still use the calendar month, so
  their figures for the same month name differ — stated on screen on purpose).
  New invariants in `supabase/tests/br_040_refund_invariants.sql`.

## Tier-3 medium sprint (2026-07-29, merged 2026-08-12)
- Goal: the five "medium" benchmark items — real features, several files each,
  no big-bang schema. Branch `sprint/tier3-medium`.
- Shipped:
  - **BR-031 multi-currency entry** — the ticket conflated two problems, corrected
    after QA. An expense/income in a foreign-currency account has exactly *one*
    real value, so the base-currency figure is a **line of text** under the amount
    (`transactionForm.amountInBasePreview`), not a second input (a linked editable
    base field shipped first and was wrong: a prominent control for a derived
    number). **Transfers** are where two real amounts exist, and they now sit in
    one card (`transferAmountsCard`), each amount directly above its account.
    What is submitted is unchanged. **Create form only.**
  - **BR-037 calendar view** — `/dashboard/calendar`, a Monday-start month grid
    with per-day income/expense/net. `getCalendarMonth` reuses the same
    `fetchFilteredRows` Reports uses, so grid and report agree by construction.
  - **BR-039 transfer-as-expense** — `accounts.treat_transfers_as_expense`,
    constrained in the database to savings/investment/other. **Reporting only**:
    the ledger keeps both entries, allocations are untouched, balances and net
    worth do not move. `fetchTransferExpenseRows` reads the *inflow leg* directly
    and emits it with no allocation, which is why it reaches KPIs, trend, week
    rows and calendar but never the category breakdown.
  - **BR-043 budget vs last month + payment split** — `get_budget_previous_actuals`
    and `get_budget_payment_split` (cash/card/other, exhaustive, summing back to
    Total spent). Both copy `get_monthly_budget_details`' actuals predicate
    verbatim. An allocation has no account, so the split attributes each
    transaction to the entry with the most negative amount — the paying account.
  - **BR-044 standalone dated notes** — new `notes` table + `/dashboard/notes`
    with month or all-months browsing, search, CRUD and archive-with-Undo.
    Deliberately outside the ledger: `notes` references nothing in
    transactions/entries/allocations and nothing references it.
- Migrations added: `20260729130000_br_039_transfer_as_expense.sql`,
  `20260729140000_br_043_budget_comparison_split.sql`,
  `20260729150000_br_044_notes.sql` — all **applied 2026-08-12**.
- Tables changed: `accounts`; new `notes`.
- Follow-ups / known gaps: BR-031 has no FX plumbing in the **edit** forms
  (`transaction-edit-form.tsx`, `transfer-edit-form.tsx`) — a separate slice.

## Mobile-capture parity sprint (2026-07-28, merged as `ded206b`)
- Goal: close the mobile-capture gaps from
  `docs/benchmark-review-mobile-money-managers.md`.
- Shipped: **BR-033** relative-date chips (today / yesterday / two days ago) on
  both the desktop grid and the mobile row list, with `todayIsoDateLocal` in
  `lib/format.ts` (the viewer's calendar day, not UTC) also seeding the dialog's
  default date; **BR-034** `Copy` on a row, pre-filled and dated today (transfers
  copy both legs, a split copies everything except the category, voided rows copy
  as posted, opening balances / debt payments / archived-account rows are not
  copyable); **BR-041** `.xlsx` export beside CSV, with a hand-rolled writer over
  `node:zlib` rather than a dependency; **BR-042** ISO week rollup rows on
  `/dashboard/reports` (months-within-year deferred); **BR-032 + BR-038 + BR-046
  + BR-047** per-user UI preferences (`profiles.ui_preferences` jsonb) driving
  which optional add-form fields render and how the transactions list opens and
  renders, plus confirm-gated account-currency edits and subcategory promotion;
  **BR-048** drag-and-drop category nesting (`projectDrop` reads the drag's
  horizontal offset for the landing depth, clamped to the two levels the schema
  allows; `moveCategoryAction` re-checks every `validateParentCategory` rule and
  returns a message so a rejected drop springs back). `ArchiveConfirmButton` was
  renamed to `ConfirmActionButton` — it was always a generic confirm-before-submit
  button. Post-QA rework of the mobile transactions screen: one wrapping strip of
  filter pills, secondary filters in a bottom sheet (one DOM node styled two ways,
  kept inside the `<form>`), no card chrome on phones. **Multi-value filters**:
  `search_household_transactions` swaps `p_type`/`p_status`/`p_payee_id` for array
  parameters — the old signature is **DROPped first**, since `create or replace`
  cannot change a parameter's name or type and would leave an ambiguous overload.
- Migrations added: `20260728120000_br_032_038_ui_preferences.sql`,
  `20260729120000_multi_value_transaction_filters.sql` — both **applied**.
- Tables changed: `profiles` (`ui_preferences`).
- Follow-ups / known gaps: BR-042 months-within-year rollups still open.

## Hard-backlog integration — PR #37 (2026-07-25)
- Goal: land the accumulated hard-backlog branches (BR-007/008/010/014) as one
  integrated PR instead of five divergent ones.
- Shipped: BR-007 cross-currency transfers, BR-008 transaction pagination +
  server-side filters, BR-010 categorization rules, BR-014 recurring auto-post,
  Reports filters, and transfer-cost UX.
- Migrations added: the production migrations for the above, plus the `pg_cron`
  extension, the `run_recurring_autopost()` function, and the daily
  `recurring-autopost` job — all applied and operational.
- Follow-ups / known gaps: authenticated real-data QA remains a manual release
  gate; see `docs/pending-work.md`.

## Full UI localization + persisted language preference (2026-07-25)
- Goal: remove residual English text from every authenticated view and make the
  selected language follow the user across browsers and devices.
- Shipped: complete English, Spanish, and Canadian French coverage for static
  and dynamic UI; localized dates and system-category names; AST coverage guard
  (`npm run i18n:check`, 1,036 visible phrases × 2 translated locales);
  `profiles.locale` persistence with `af_locale` restored during password and
  OAuth login.
- Migrations added: none (`profiles.locale` and own-profile update RLS already
  existed).
- Tables changed: `profiles` data only; no schema change.
- Follow-ups / known gaps: manually confirm the cross-browser flow by selecting
  a language, signing out, and signing into the same account in an incognito
  window.

## Closure + Tier-1 small improvements (2026-07-25)
- Goal: restore trustworthy canonical state after PR #37 and close the small
  Settings/localization/payee/recurring-health follow-ups without expanding the
  product scope.
- Shipped: state/docs reconciled with the merged hard backlog and operational
  recurring cron; Settings email-change flow; aggregate recurring auto-post
  health alert; locale-aware shared day/date-range formatters threaded through
  residual leaf screens; multi-source payee bulk-merge UI and atomic RPC
  migration; authenticated pagination + Reports-filter QA evidence in
  `docs/alpha/pr-37-authenticated-qa.md`.
- Migrations added: `20260725120000_payees_bulk_merge.sql` (pending manual
  `npx supabase db push`).
- Tables changed: none; adds `merge_payees_bulk(uuid, uuid[], uuid)`.
- Follow-ups / known gaps: sanitized-fixture CSV rule QA, transaction-creating
  transfer/cost QA, and installed-PWA shortcut/Share Target QA remain manual.
  Merged-branch cleanup remains blocked on explicit destructive authorization.

## BR-023 tags + BR-024 CSV presets/revert (2026-07-22, in review)
- Goal: two backlog items — a flexible tagging layer, and CSV importer
  quality-of-life (reusable mappings + an undo for a whole import.)
- Shipped (PR #34 `feat/br-023-tags`, PR #35 `feat/br-024-csv-presets-revert`;
  both pass tsc/lint/build, **not yet merged**, migrations **not yet
  `db push`ed**):
  - BR-023: `tags` + `transaction_tags` junction; `/dashboard/tags` CRUD
    (list/usage/create/rename/color/archive) in the Money nav group;
    reusable `TagChip` + `TagMultiSelect` (emits hidden `tag_id` + a
    `tags_present` sentinel); tags wired into the add + edit forms via a
    separate `set_transaction_tags` RPC (transaction RPCs untouched → no new
    overloads); tag chips on transaction rows; all-time `tag_id` filter with a
    focus chip. Deferred: inline tag-create from the form, tag facet in the
    main filter panel.
  - BR-024: `csv_import_presets` (named column mapping + default account,
    save/load, delete); confirm-gated **Import history → Revert** that calls
    `revert_csv_import` (soft-deletes a batch's transactions, marks batch
    `reverted`).
- Migrations added: `20260722120000_br_023_tags.sql`,
  `20260722130000_br_024_csv_import_presets_revert.sql` (the latter also adds
  `reverted` to the `import_batches` status check).
- Tables changed: new `tags`, `transaction_tags`, `csv_import_presets`.
- Follow-ups / known gaps: both PRs need review + `npx supabase db push`
  before they work in any environment. Housekeeping done alongside: 79 merged
  remote branches + 4 merged local branches pruned (only `main` + these two
  feature branches remain).

## Transaction-form mobile redesign (2026-07-21, PR #33)
- Goal: make the add/edit transaction form comfortable on a phone (it was
  scroll-heavy and used native selects covered by the keyboard).
- Shipped: AndroMoney-style compact **row list** on phones (each field a
  tap-to-expand row) vs a two-column grid on desktop; account/category/payee
  open a full-screen `SelectorSheet` on mobile and a floating popover combobox
  on desktop, both with inline search + create-new; category drill-down into
  subcategories; single-screen, denser layout.
- Migrations added: none.
- Tables changed: none.
- Follow-ups / known gaps: none tracked.

## Tier-1 easy wins — BR-025/028/015/009 residuals (2026-07-20, merged 3517c4b)
- Goal: knock out a cluster of small, high-value backlog residuals.
- Shipped: BR-025 focused locale formatting (`localeToBcp47`, locale threaded
  through dashboard/plan/budgets/transactions, `formatPercent` deduped);
  BR-028 PWA `share_target` (a share opens the expense quick-add prefilled);
  BR-015 void **Undo** + archive+undo generalized to goals and recurring
  templates; BR-009 residuals (CSV import + recurring templates now carry a
  payee).
- Migrations added: `20260720120000_unvoid_transaction_rpc.sql`,
  `20260720130000_br_009_recurring_payee.sql` (adds
  `recurring_transactions.payee_id`).
- Tables changed: `recurring_transactions` (+`payee_id`).
- Follow-ups / known gaps: deep leaf cards still default to `'en'`; no shared
  day-level date formatter; share/shortcut behavior unverified in an installed
  PWA.

## Payees maintenance — BR-009 slice 2 (2026-07-20)
- Goal: close BR-009 by making the backfilled `payees` table maintainable and
  the transaction-form payee field genuinely searchable.
- Shipped:
  - `/dashboard/payees` CRUD page (Money nav group, en/es/fr `nav.payees`):
    list with per-payee usage stats (transaction count + last-used date),
    create, rename, archive/restore, and merge. Rename propagates the new name
    to every linked `transactions.merchant_name`. Merge reassigns all of a
    payee's transactions to a surviving payee and archives the drained source.
    Mirrors the categories management page (search, show-archived toggle,
    metric cards, archive-confirm + undo toast).
  - Searchable payee combobox: replaced the native `<datalist>` in
    `payee-picker.tsx` with **Base UI Autocomplete** — a floating portal popup
    (never clipped by the transaction dialog's scroll area, flips/repositions,
    doesn't dismiss the parent dialog), live substring filtering with an
    explicit "Create <text>" row and a "N more" hint. Used by the add form,
    edit form, and the inline quick-edit (which dropped its shared datalist).
  - Transactions `payee_id` filter: exact filter, all-time by default (skips
    the month window unless a month/range is explicitly chosen), with a
    dismissible "Showing all transactions for <payee>" chip; threaded through
    `transactionsPath` + the filter form so it stays sticky. Reached from a
    "View transactions" button on each payee row.
  - Context-aware label: the payee field reads **Payer** on income vs **Payee**
    on expense across the add form (reactive to the type toggle), edit form,
    inline quick-edit, and the assistant receipt-review summary
    (`transactionForm.payer` in en/es/fr).
- Migrations added: `20260717120000_br_009_payee_crud.sql` — `payees.is_archived`
  (+ partial index), `get_payees_with_stats(household)` and
  `merge_payees(household, source, target)` RPCs (both `security invoker`).
- Tables changed: `payees` (added `is_archived boolean not null default false`).
- Follow-ups / known gaps: CSV import still does not set `payee_id`; recurring
  templates carry no payee; the payees page has no bulk merge (one source at a
  time).

## Sprint 13 — Quick wins (2026-06-23)
- Goal: clear five small, independent items off `docs/pending-work.md` in one
  sprint: two pure cleanup items (Next 16 middleware rename, dead route
  stubs) and three partial-progress items (dashboard needs-review count,
  a reusable destructive-confirm dialog, payee data model), plus a
  dev/demo data-seeding utility requested mid-sprint.
- Shipped:
  - BR-026: renamed `src/middleware.ts` → `src/proxy.ts`, exported function
    `middleware` → `proxy`, matching Next 16's middleware→proxy convention.
    `npm run build` no longer warns.
  - BR-027: deleted 5 dead root-level redirect stubs
    (`src/app/{budgets,debts,export,net-worth}/page.tsx`,
    `src/app/transactions/import/page.tsx`) that only `redirect()`ed to their
    real `/dashboard/...` equivalents; confirmed nothing referenced the root
    paths first.
  - BR-012: dashboard now queries a `count`-only `transactions` request for
    `review_status = 'unreviewed'` and shows a "N to review" pill next to
    Recent Activity, linking to `/dashboard/transactions?review=unreviewed`.
    QA on a real-data demo household caught that the link silently inherited
    the transactions page's current-month default and could hide older
    unreviewed rows; fixed by adding an explicit wide date range
    (`date_from=2000-01-01&date_to=2099-12-31`) to the link. The underlying
    gap — no "All time" filter preset on the transactions page — is now
    tracked as BR-029.
  - BR-015 (partial): new reusable `AlertDialog` component
    (`src/components/ui/alert-dialog.tsx`, mirrors the existing `dialog.tsx`
    pattern over `@base-ui/react/alert-dialog`), adopted in
    `void-transaction-form.tsx` replacing the old inline confirm-state UI.
    No archive action exists yet to standardize the same way, and there is
    no undo/toast.
  - BR-009 (partial): new household-scoped `payees` table, backfilled from
    each household's distinct `merchant_name` values; `transactions` gained
    a nullable `payee_id` FK. Nothing writes `payee_id` yet (no CRUD page,
    no picker on the transaction form) — `merchant_name` is still the only
    thing the UI reads/writes.
  - Dev/demo utility: `public.copy_household_data(p_source_household_id,
    p_target_household_id, p_actor_user_id)` — wipes the target household
    and mirrors the full dataset (categories, accounts, payees,
    transactions/entries/allocations, budgets/lines, debts, recurring
    templates, goals, exchange rates — 12 tables) from a source household,
    remapping every id. Used to seed a demo user's household from a real
    one for more realistic manual QA. Not granted to `authenticated`;
    intended to be run from the Supabase SQL editor only. Manually tested
    against real data — output confirmed row counts copied per table.
- Migrations added: `20260622100000_create_payees.sql` (BR-009),
  `20260622110000_copy_household_data.sql` (utility function). Both
  **applied** to the linked remote project.
- Tables changed: new `payees` table; `transactions` gained `payee_id`.
- Follow-ups / known gaps: BR-009 needs a payee picker on the transaction
  form (select existing or create new) and a minimal CRUD page
  (rename/merge/archive) before it's actually useful — tracked in
  `docs/alpha/benchmark-follow-up-issues.md`. BR-015 still has no archive
  action or undo/toast. New BR-029: add an "All time" preset on
  `/dashboard/transactions` instead of the dashboard link's ad-hoc wide
  date range workaround.

## Sprint — Goals & funds hardening (code review follow-up) (2026-06-22)
- Goal: code review on the Goals & funds PR (#13) surfaced a lost-update
  race in contribute/withdraw, an RLS policy requiring admin instead of
  editor (with silent no-op updates under RLS), and a Plan page total that
  dropped completed goals — fix all before merge.
- Shipped: new `apply_goal_adjustment(p_goal_id, p_household_id, p_delta)`
  RPC that locks the goal row (`select ... for update`) and computes the
  new `current_amount`/`status` atomically; `contributeGoalAction`/
  `withdrawGoalAction` now call it instead of doing a plain select + JS
  math + update. `updateGoalAction`/`setGoalStatusAction` now `.select('id')`
  after their `update()` and treat an empty result as failure, since a
  Postgres `UPDATE` blocked by RLS returns no error by default. Plan page's
  "Total saved" now includes `active`/`paused`/`completed` goals (only
  `archived` excluded), matching the Goals page instead of dropping a
  goal's saved amount the moment it completes. Dashboard goals-mini widget
  keys list items by `id` instead of `name`. `StatusBadge` gained explicit
  styles for `paused`/`completed`/`archived`.
- Migrations added: amended `20260618000100_create_goals.sql` in place
  (not yet applied to any environment at review time) — insert/update RLS
  switched from `is_household_admin` to `is_household_editor`;
  `goals_amounts_chk` now requires `target_amount > 0` (was `>= 0`);
  `linked_account_id` FK gained `on delete set null` plus a supporting
  index; added `apply_goal_adjustment`. Applied to the linked remote
  project (`karbhlstwxhjdnepglza`) via `npx supabase db push`.
- Tables changed: `goals` (constraint/RLS/FK changes only, no new columns).
- Follow-ups / known gaps: added `supabase/tests/br_019_goals_invariants.sql`
  (read-only invariants + a rolled-back exercise of `apply_goal_adjustment`)
  and ran it against real household data — all checks passed. Documented an
  open decision in `docs/features/goals.md`: whether a linked goal's
  progress should eventually be derived from the linked account's real
  ledger balance instead of the manually-tracked `current_amount` — decided
  to keep the manual model for now.

## Sprint — Goals & funds (BR-019) (2026-06-18)
- Goal: implement the only nav item still locked behind `phase: 'beta'`
  (Goals & funds) per BR-019 in
  `docs/alpha/benchmark-follow-up-issues.md` — the `goals` table was fully
  designed in the initial schema doc but never migrated, and the page was a
  locked coming-soon placeholder.
- Shipped: `/dashboard/goals` with full CRUD (`GoalForm`), contribute/withdraw
  actions (`GoalProgressForm`, single form-action-per-mode, no per-button
  `formAction` — no precedent for that pattern in this codebase) that
  auto-flip status to `completed` when `current_amount >= target_amount`,
  and pause/resume/archive/restore lifecycle via `setGoalStatusAction`.
  Goals are grouped into Active/Completed/Paused/Archived sections
  (`goal-card.tsx`), with summary `MetricCard`s (active count, completed
  count, total saved vs. target for base-currency goals). New shared helpers
  in `lib/goals/shared.ts` (goal types, statuses, progress/reached
  calculations). Nav entry flipped from `phase: 'beta'` to `phase: 'alpha'`
  (`lib/nav/config.ts`). Dashboard's goals-mini widget and the Plan page's
  Goals card now read real `goals` rows instead of mock data / a locked card.
  Hardcoded English UI for the new page, matching the dominant pattern in
  `recurring`/`debts` (most feature pages don't use the i18n `translate()`
  system); touched only the few i18n keys already used by shared chrome
  (dashboard widget, plan page, nav label) across en/es/fr.
- Migrations added: `20260618000100_create_goals.sql` (additive — new
  `goals` table: name, goal_type, target_amount, current_amount,
  currency_code, target_date, linked_account_id, status, with type/status
  check constraints, a household+status index, member-select RLS, and
  admin-only insert/update RLS; deliberately no delete policy since goals
  use soft `archived` status instead of physical deletion). **Not yet
  applied** — run `npx supabase db push`.
- Tables changed: new `goals` table.
- Follow-ups / known gaps: no automation (e.g. recurring auto-contributions)
  — manual contribute/withdraw only, matching MVP scope. No i18n for the new
  page itself (English-hardcoded, consistent with `recurring`/`debts`).

## Analysis & planning screens — PR #12 (2026-06-16)
- Goal: turn the locked "coming soon" placeholders into real pages driven by
  existing ledger data.
- Shipped: `/dashboard/reports` (category/merchant tabs, distribution donut,
  ranked list), `/dashboard/trends` (multi-month income/expense/savings/
  net-worth/savings-rate charts), `/dashboard/cash-flow` (inflow/outflow bars
  with a net line), `/dashboard/month-review` (vs-prev-month deltas, budget
  performance, suggested actions), `/dashboard/debt-planner` (avalanche vs
  snowball payoff with extra-payment recalculation). Shared code:
  `src/lib/analysis/server.ts`, `src/components/analysis/charts.tsx`.
- Migrations added: none.
- Follow-ups / known gaps: the month-review health grade is an explicitly
  labeled **mock/demo heuristic** (same one used on the dashboard); its
  "Close month" button is disabled / not yet built.

## Sprint 4 — Transactions redesign: inline/bulk edit + review workflow (2026-06-15)
- Goal: rebuild `/dashboard/transactions` per
  `docs/design/handoff-2026-06/prompts/sprint-4-transactions.md` — inline
  quick-edit, bulk actions, and a review-status workflow, as part of the
  multi-sprint UI redesign (Sprints 1–3 covered nav, mobile bottom nav, and
  the dashboard).
- Shipped: inline per-row quick-edit (merchant, category, amount) reusing
  `updateManualTransactionAction`; row selection with a sticky bulk action
  bar (mark reviewed via new `updateReviewStatusAction`, bulk recategorize
  via new `bulkCategorizeAction`); review-status badges and filter chips
  (To review / Reviewed / Flagged); kept date-grouped list (Today/Yesterday)
  and existing filters/CSV-import/transfer/void flows unchanged. New
  component: `transaction-list.tsx`. Filter bar redesigned into an
  always-visible toolbar: type segmented control (All/Income/Expense/
  Transfer), search, multi-select Account/Category chips, Status chip,
  date-range presets plus From/To inputs, and a mobile "Filters" collapse
  toggle.
- Migrations added: `20260614120000_sprint_4_transaction_review_status.sql`
  (additive — adds `transactions.review_status` text column, default
  `'unreviewed'`, check constraint `unreviewed|reviewed|flagged`, and a
  `(household_id, review_status)` index).
- Tables changed: `transactions` (new `review_status` column + index).
- Follow-ups / known gaps: migration not yet applied — review badges/chips
  will not reflect real data until `npx supabase db push` is run. No i18n
  yet for the new Sprint 4 labels (page remains English-hardcoded).

## Sprint 3 — Dashboard redesign: Financial Control Center (2026-06-14)
- Goal: rebuild `/dashboard` to match the `docs/design/handoff-2026-06` mockups
  (desktop "Centro de control" + mobile views), as part of the multi-sprint UI
  redesign (Sprints 1–2 covered sidebar nav and the mobile bottom nav).
- Shipped: net-worth hero with real assets/liabilities/projected balances, a
  6-month sparkline, and a month-health score clearly marked as a DEMO; four
  monthly metric cards with vs-previous-month deltas; budget-vs-actual bars;
  a pure-SVG category donut whose legend rows link to `/dashboard/transactions`
  filtered by category + month; an upcoming-recurring-payments list with
  Due/Scheduled/Auto tags; a right rail with live insights, a debts mini summary,
  and a Beta goals-mini teaser; and a recent-activity feed (transaction
  description as the title, "category · merchant" subtitle, fixed-width columns
  for row alignment). Removed the standalone Accounts summary card from the
  dashboard (account management remains at `/dashboard/accounts`). New
  components: `category-donut.tsx`, `financial-hero-card.tsx`,
  `insight-card.tsx`, `recent-activity.tsx`.
- Migrations added: none.
- Tables changed: none.
- Follow-ups / known gaps: the month-health score is a MOCK/DEMO heuristic
  (clearly labeled, not financial advice); "Metas y fondos" shows a hardcoded
  illustrative teaser because Goals has no backend yet, and links to the locked
  `/dashboard/coming-soon/goals` page.

## Sprint 12.x — BR-003..BR-006 net-worth correctness + verification (2026-06-14)
- Goal: make Net Worth's FX policy explicit, prevent archived accounts from
  distorting historical/as-of net-worth totals, clear the lint gate, and add a
  first repeatable money-invariant check file.
- Shipped: Net Worth now shows an FX policy callout explaining that stored
  historical ledger rates are used and month-end revaluation is not implemented
  yet; `get_account_balances(p_household_id, p_as_of_date)` now filters archived
  accounts; React hooks lint failures were removed without intended behavior
  changes; `supabase/tests/br_003_006_money_invariants.sql` documents read-only
  SQL checks for FX, archived-account, transfer, voided, and allocation-based
  reporting invariants. New docs:
  `docs/features/net-worth-fx-policy.md`,
  `docs/features/react-hooks-lint-cleanup.md`, and
  `docs/features/financial-correctness-checks.md`.
- Migrations added:
  `20260614000100_br_004_exclude_archived_as_of_balances.sql`.
- Tables changed: none.
- Follow-ups / known gaps: no market-rate net-worth revaluation yet; SQL checks
  remain manual until the project adopts a real automated test runner. Manual
  Supabase apply still required: `npx supabase db push`.

## Sprint 12.x — BR-001/BR-002 CSV import FX + rate foundation (2026-06-13)
- Goal: stop CSV imports from silently converting non-base account rows at a
  hard-coded 1:1 rate, and add the shared FX rate foundation needed by
  cross-currency flows.
- Shipped: household-scoped `exchange_rates` table; `get_exchange_rate(...)`
  lookup RPC with same-currency `1`, latest-prior direct-pair lookup, and inverse
  pair fallback; replacement `create_csv_import(...)` that resolves per-row FX
  from account currency to household base currency and logs rows without a usable
  rate as invalid instead of creating incorrect ledger entries. The import screen
  now warns when non-base accounts require saved rates, and
  `docs/features/csv-import-fx.md` plus `docs/features/exchange-rates.md`
  document the contracts.
- Migrations added: `20260613000100_br_001_csv_import_fx.sql`.
- Tables changed: **new table** `exchange_rates`.
- Follow-ups / known gaps: no rate-management UI yet; rates must be seeded
  manually or by a future fetch/persist workflow. Manual Supabase apply still
  required: `npx supabase db push`.

## Sprint 12.x — Recurring transactions: manual posting MVP (2026-06-12)
- Goal: let users define predictable income/expense templates (rent, subscriptions,
  salary) once and post them in one click when due — Sprint A of
  `docs/features/recurring-transactions.md`.
- Shipped: `/dashboard/recurring` with Due & overdue / Upcoming / Inactive
  sections and summary cards (active count, due now, est. monthly base-currency
  expense); income/expense template create/edit form; lifecycle actions
  (activate/deactivate, hard-delete with inline confirm); one-click **Post**
  dialog (adjust date/amount/notes, plus an FX-rate field when the account
  currency ≠ base) that reuses the `create_manual_transaction` RPC, then advances
  `next_run_date` one frequency step and auto-deactivates once past `end_date`;
  sidebar + mobile-nav link (`Repeat` icon) and `nav.recurring` i18n (en/es).
  New: `app/dashboard/recurring/{page,actions,recurring-form,recurring-row,post-form,loading}.tsx`,
  `lib/recurring/shared.ts` (frequency options + UTC-safe `computeNextRunDate`
  with month-end clamping).
- Migrations added: `20260612162632_create_recurring_transactions.sql` — creates
  the `recurring_transactions` table, its index, `updated_at` trigger, and all
  four RLS policies (select member / insert+update+delete admin). The table was
  in the initial schema design doc but had **never been applied** to this
  project's database, so `db push` initially failed with "relation does not
  exist"; the migration was rewritten from delete-policy-only to full create.
- Tables changed: **new table** `recurring_transactions`.
- Follow-ups / known gaps: **Sprint B — auto-posting** (`auto_post` toggle +
  scheduled job + failure notification; blocked on multi-currency FX strategy)
  and **Sprint C — dashboard "Due soon" widget + recurring transfers** (needs a
  `to_account_id` column) are still pending. Posting is manual-only for now;
  income/expense only (the RPC rejects other types).

## Sprint 12.x — Category drag-and-drop, style picker, icon-only defaults (2026-06-12)
- Goal: bring the categories page up to the same polish as accounts —
  reorder by dragging, make picking a color/icon easy, and ensure system
  default categories ship with a sensible icon.
- Shipped: siblings-only drag-and-drop reorder (roots within a type, children
  within a parent) via `@dnd-kit` + `reorderCategoriesAction` bulk-writing
  `sort_order` (`categories/sortable-category-list.tsx`; `CategoryRow` gained
  an optional `dragHandle`); new `CategoryStylePicker` (curated color swatches
  + finance-emoji grid, plus a custom hex/emoji escape hatch) replacing the
  old free-text color/icon inputs (`lib/categories/style.ts`,
  `components/category-style-picker.tsx`); category icons now shown in every
  category dropdown (transaction category/subcategory picker, category form
  parent selector, transaction filters, budget line selector).
- Migrations added: `20260612144936_category_default_colors_icons.sql`
  (superseded in effect — see next) and `20260612180000_category_remove_default_colors.sql`.
  Net effect: `create_default_categories_for_household` now seeds system
  categories with a fitting **icon only** (color stays `null` — colored dots
  read as too saturated next to icons); existing system categories are
  backfilled the same way (icon filled if missing, any previously-seeded
  default color reverted to `null` unless the user changed it).
- Tables changed: none (schema already had `categories.color`/`icon`).
- Follow-ups / known gaps: re-parenting categories still happens via the edit
  form (DnD is siblings-only by design); archived view remains non-draggable.
- Dependency: reuses `@dnd-kit` (already added in the accounts sprint).

## Sprint 12.x — Account view toggle + drag-and-drop sorting (2026-06-12)
- Goal: Wealthsimple-style account presentation — choose list vs grouped view,
  and reorder accounts by dragging instead of a manual sort-order number.
- Shipped: List/Group(by account type) toggle with per-group subtotals across
  accounts, dashboard, and net-worth (remembered in cookie `af_accounts_view`,
  default group); drag-and-drop reordering on the accounts page via `@dnd-kit`
  (`reorderAccountsAction` bulk-writes `sort_order`); redundant account-type
  badge hidden in group view; new shared `BalanceAmount` component coloring
  balances green/red + minus sign (color-blind-aware, per [[feedback-user-colorblind]]).
  New: `lib/accounts-view/*`, `components/{accounts-view-toggle,account-group,balance-amount}`,
  `accounts/sortable-accounts-list`.
- Migrations added: none (`accounts.sort_order` already existed).
- Tables changed: none.
- Follow-ups / known gaps: debts page intentionally keeps its own "outstanding
  balance" styling (not BalanceAmount); DnD sorting is accounts-page only.
- Dependency added: `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`.

## Sprint 12.x — Amount input & currency formatting fix (2026-06-12)
- Goal: fix raw/unformatted monetary values shown to the user (assistant draft
  card and budget line amount fields).
- Shipped: new shared `AmountInput` component (`src/components/amount-input.tsx`)
  with currency-symbol prefix and live thousands grouping; new `lib/format.ts`
  helpers (`getCurrencySymbol`, `formatAmountForDisplay`, `sanitizeAmountInput`);
  adopted across budget line, debt, opening balance, and transaction/transfer
  edit forms; AI assistant draft card now formats extracted amounts as currency
  (PR #8).
- Migrations added: none.
- Tables changed: none.
- Follow-ups / known gaps: exchange-rate, due-day, and sort-order inputs remain
  plain numerics by design (not money).
