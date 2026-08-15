# Tap Payment Capture (NFC / Wallet)

## Status
**Planned — not yet implemented.** Design and requirements only; no code exists.
**Phase 0 is in progress and trending positive:** on the target Android device,
both Google Wallet and the bank notify within seconds of a tap, carrying
merchant, amount and card last four. No detection risk remains; one automation
config defect and the repeat-fire runs are outstanding. See the
[spike results](../alpha/tap-capture-phase-0-spike.md#results).
Database impact when built: **three new tables** (`capture_tokens`,
`capture_inbox`, `capture_card_map`), one new `SECURITY DEFINER` RPC, and one
additive value (`tap_capture`) on the existing `transactions_source_chk`
constraint. No change to the ledger model.

---

## Context

The user pays at a shop by tapping their phone (Google Wallet / Apple Pay) and
wants the expense to appear in App Finanzas automatically, already filed under
the right category, without opening the app.

Today this is a fully manual flow: open the PWA (or its **Quick add** shortcut),
type the amount, pick the account, pick the category. The friction is highest
exactly where capture matters most — small, frequent, in-person purchases
(coffee, ice cream, transit), which are also the ones most likely to be
forgotten and to silently break the month's numbers.

Two things have to be true for the feature to work, and they are independent:

1. **Detection** — something must observe the tap and tell App Finanzas.
2. **Classification** — the resulting transaction must land in the right
   category often enough that the user trusts it and stops reviewing every row.

The second is where App Finanzas is already strong (`categorization_rules`,
`payees`, `review_status`). The first is where the platform fights back.

---

## Feasibility verdict

| Question | Answer |
|---|---|
| Can the PWA itself detect an NFC tap payment? | **No.** Not on any platform, not with any web API. |
| Can a tap reach App Finanzas within seconds anyway? | **Yes** — via the phone's automation layer plus an inbound ingest endpoint. |
| Is high-confidence auto-categorization realistic? | **Yes** — most of the machinery already ships. |
| Is any of this MVP-Alpha scope? | **No.** This is a post-MVP feature and should be scheduled as such. |

### Why the PWA cannot see the tap

- **Web NFC (`NDEFReader`)** is Chrome-on-Android only, requires the page to be
  in the foreground after a user gesture, and reads **NDEF tags**. A contactless
  payment is an EMV exchange between the phone's secure element / HCE service
  and the terminal. Web NFC cannot observe it. There is no partial workaround.
- **Android**: no public API — not even for native apps — exposes a Google
  Wallet payment to a third party. What a *native* app can do is hold
  `NotificationListenerService` permission and read the Wallet or bank
  notification. A PWA cannot request that permission.
- **iOS**: no third-party API for Apple Pay transactions. The one supported
  hook is the **Shortcuts "Transaction" personal automation** trigger, which
  fires after a Wallet payment and exposes merchant and amount to a Shortcut.
- **Service worker / push**: the app has no service worker today (see
  [pwa.md](./pwa.md)), and even with one, push is server-to-client. It cannot
  originate a payment event.

The conclusion is architectural, not a limitation to engineer around:
**detection lives outside App Finanzas, on the phone. App Finanzas owns
ingestion, classification, and the ledger.**

---

## Architecture

```
  ┌────────────────────┐
  │  Phone (tap)       │
  │  Wallet / bank     │
  │  emits a           │
  │  notification      │
  └─────────┬──────────┘
            │  captured by the phone's automation layer
            │  (iOS Shortcuts / Android automation app)
            ▼
  ┌────────────────────────────────┐
  │  POST /api/ingest/tap          │  capture token in the Authorization header
  │  { amount, merchant, currency, │
  │    occurred_at, last_four,     │
  │    external_id, raw }          │
  └─────────┬──────────────────────┘
            │  ingest_tap_payment(token, payload)  — SECURITY DEFINER
            ▼
  ┌────────────────────────────────┐
  │  capture_inbox (staging)       │  status: pending
  └─────────┬──────────────────────┘
            │  classifier: rules → payee history → fuzzy → MCC → AI
            ▼
     confidence ≥ threshold ?
       yes ──► create_manual_transaction(...)  source='tap_capture'
       │                                        review_status='unreviewed'
       no  ──► stays in the inbox as a one-tap suggestion
```

### Detection paths

Ranked by fidelity. The design supports all of them through one endpoint; the
user picks whichever their phone allows.

| # | Path | Platform | Latency | Data quality | Cost to user |
|---|---|---|---|---|---|
| A | Shortcuts **Transaction** automation → *Get Contents of URL* | iOS 17+ | Seconds | Merchant + amount, structured | None — built into iOS |
| B | Automation app (MacroDroid / Tasker / Automate) reads the Wallet or bank notification → HTTP POST | Android | Seconds | Notification text, needs parsing | Installs one third-party app, grants notification access |
| C | Bank push/SMS/email alert → forwarding rule → ingest | Any | Seconds to minutes | Free text, bank-specific format | Configure a mail filter |
| D | Bank aggregator (Plaid / Belvo / Tink) | Any | Hours to days | Clean, settled | Cost, credential sharing, conflicts with *privacy by design* |

Path A is the target for iOS and the only one requiring no third-party
software. Path B is the Android answer. Path C is the universal fallback and
also the safety net when A or B silently stop firing. **Path D is explicitly
out of scope** — it does not solve the "tap and it appears now" problem, and it
contradicts the project's privacy principle.

> **Coverage caveat, to be settled in Phase 0.** The iOS Transaction trigger's
> card coverage varies by card, issuer, and region, and Android notification
> text varies by wallet and bank. Neither can be assumed from documentation.
> Phase 0 exists to prove it on the user's actual phone and card before any
> code is written.

### Authentication of an inbound, session-less request

The automation is not a browser: it has no Supabase session and no cookies. It
authenticates with a **capture token** — a per-device, high-entropy secret the
user mints in Settings.

The project rules forbid the service-role key in app code and forbid bypassing
RLS from the app layer. The sanctioned pattern already used by
`run_recurring_autopost()` applies here: the route handler calls a
**`SECURITY DEFINER` RPC**, `public.ingest_tap_payment(p_token text, p_payload
jsonb)`, granted to `anon`. The function hashes the presented token, resolves
it to a household, and writes one `capture_inbox` row. The app layer never
holds a privileged key, and the definer function is small and auditable.

Hardening required in the same slice:
- Tokens are 32 random bytes, base64url. Only a **hash** is stored
  (`token_hash`); the plaintext is shown once, at creation.
- Comparison is on the hash, so it is constant-time in practice.
- The RPC writes to `capture_inbox` and nothing else. It never touches the
  ledger — classification and posting happen in a second, authenticated step.
- Per-token rate limit (e.g. 60 ingests/hour) enforced inside the function.
- `revoked_at` + `last_used_at` per token, both surfaced in Settings.
- Payload size cap; unknown fields dropped rather than stored.

### Staging model — never write straight to the ledger

An inbound tap lands in `capture_inbox` (`status = 'pending'`), not in
`transactions`. This follows the project's ledger rules and keeps a bad or
duplicated notification from corrupting balances. A capture becomes a
transaction only when:

- an account can be resolved, **and**
- the classifier's confidence clears the household threshold, **or**
- the user confirms it manually from the inbox.

Auto-posted transactions carry `source = 'tap_capture'` and
`review_status = 'unreviewed'`, so they surface in the existing review queue
and the dashboard's "N to review" pill without any new UI concept.

### Deduplication

The same payment can arrive twice — the Wallet notification and the bank alert —
and later a third time via CSV import when the charge settles.

- **Within capture**: the automation sends an `external_id`; the ingest RPC
  additionally computes a dedup key over
  `(household_id, occurred_at rounded to the minute, amount, last_four)` and
  rejects a second row with the same key as `status = 'duplicate'`.
  Phase 0 measured **three POSTs from a single tap** — the wallet, the bank, and
  a refresh of the wallet's own notification. A re-fire reproduces `external_id`
  rather than changing it, so the computed `dedup_key` is the load-bearing
  mechanism here and `external_id` only guards sender-side retries.
- **Against CSV import**: an import row matching an existing `tap_capture`
  transaction on amount + merchant within a ±3-day window is flagged in the
  import preview as a probable duplicate. Because a tap posts on the *authorized*
  date and the bank reports the *settled* date, exact date matching will not
  work. This is Phase 3 and is listed as an Open Decision below.

### Account resolution

The notification names the card, not an App Finanzas account. Resolution order:

1. `last_four` from the payload matched against `accounts.last_four` (the column
   already exists, with a `^[0-9]{1,4}$` check).
2. An explicit mapping row in `capture_card_map` (label from the notification →
   account), for cards whose alert does not include digits.
3. The token's configured default account.
4. None of the above → the capture stays `pending` with an "assign account"
   prompt. It is never guessed.

Credit-card taps resolve to the liability account, so the existing debt/credit
handling applies unchanged.

---

## The confidence score ("porcentaje de fidelidad")

Each capture is scored 0–1 and stored on the row (`confidence numeric`,
`confidence_source text`). The score is shown in the inbox as a percentage and
drives the auto-post decision. Persisting it is what makes the threshold
tunable later from real data instead of from intuition.

| Layer | Signal | Score | Notes |
|---|---|---|---|
| 1 | A `categorization_rules` rule matches (BR-010) | **0.95** | Deterministic and user-authored. Reuses `findMatchingRule` in `src/lib/rules/match.ts` verbatim. |
| 2 | Known payee history | `share × n / (n + 2)` | `share` = fraction of that payee's prior transactions in the winning category; the damping term keeps a 1-of-1 history from scoring 100%. |
| 3 | Fuzzy merchant → payee match | layer 2 × string similarity | Normalized comparison; handles `HELADERIA X #0412` vs `Heladería X`. |
| 4 | MCC from the payload, if the source provides one | **0.70** | Needs an MCC → category default map. Rarely available on Paths A–C. |
| 5 | AI fallback (`@anthropic-ai/sdk`, already a dependency) | **capped at 0.60** | Deliberately below the auto-post threshold: the model can *suggest*, never *post* on its own. |
| — | No signal | **0** | Inbox item with no suggestion. |

Highest layer wins; layers are not summed. The default auto-post threshold is
**0.90**, household-configurable (a new key in `profiles.ui_preferences`, or a
household setting if it should apply to everyone — see Open Decisions).

### How confidence actually gets high — the feedback loop

This is the core of the feature, and the ice-cream shop is the worked example:

1. **First tap.** Unknown merchant, no rule, no payee history → confidence 0.
   The capture waits in the inbox with amount, merchant and account filled in.
   The user taps once to pick *Eating out*. One tap total, versus the six-field
   form today.
2. On confirming, the app offers: **"Always categorize `HELADERIA X` as
   `Eating out`"**. Accepting writes a `categorization_rules` row
   (`merchant_name` `contains` `HELADERIA X` → *Eating out*) — no new
   mechanism, just the BR-010 engine.
3. **Every later tap at that shop** matches layer 1, scores 0.95, clears the
   threshold, and posts automatically as `unreviewed`.

Without this loop the confidence score is decorative. With it, the user's own
corrections are what raise the hit rate, and the app converges on high
auto-post coverage over the first few weeks of real use. That, concretely, is
what "categorizarse con un porcentaje de fidelidad alto" means here — not a
number the app asserts, but one it earns per merchant.

### Accuracy measurement

Because `confidence` and `confidence_source` are persisted, and because
auto-posted rows land as `unreviewed`, the correction rate is directly
measurable: of the transactions auto-posted at ≥ 0.90, how many had their
category changed within 30 days? The target for keeping auto-post enabled is
**< 5% corrections**. If it exceeds that, raise the threshold rather than
patching individual layers.

---

## Data model

Additive only. No change to `transactions`, `transaction_entries`, or
`transaction_allocations` beyond one constraint value.

### `capture_tokens`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `household_id` | uuid not null | FK → `households`, `on delete cascade` |
| `user_id` | uuid not null | FK → `auth.users`; the token acts as this user |
| `name` | text not null | "Andrés — iPhone" |
| `token_hash` | text not null unique | sha-256 of the plaintext; plaintext never stored |
| `default_account_id` | uuid | FK → `accounts`, `on delete set null` |
| `source_kind` | text not null | `ios_shortcut` \| `android_automation` \| `email_forward` |
| `last_used_at` | timestamptz | |
| `revoked_at` | timestamptz | Soft revoke — never delete, per the archive-over-delete rule |
| `created_at` / `created_by` | | |

RLS: member select, editor insert/update. No delete policy (revoke instead).

### `capture_inbox`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `household_id` | uuid not null | FK → `households` |
| `token_id` | uuid | FK → `capture_tokens`, `on delete set null` |
| `external_id` | text | Sender-provided idempotency key |
| `dedup_key` | text not null | `(household, minute, amount, last_four)` digest; unique per household |
| `occurred_at` | timestamptz not null | Phone-local instant of the tap |
| `amount` | numeric(18,4) not null | Always positive; expense is implied |
| `currency` | varchar(3) not null | |
| `merchant_raw` | text | As received |
| `last_four` | text | `^[0-9]{1,4}$` |
| `suggested_account_id` | uuid | FK → `accounts` |
| `suggested_category_id` | uuid | FK → `categories` |
| `confidence` | numeric(4,3) | 0–1 |
| `confidence_source` | text | `rule` \| `payee_history` \| `fuzzy` \| `mcc` \| `ai` \| `none` |
| `status` | text not null | `pending` \| `posted` \| `dismissed` \| `duplicate` \| `failed` |
| `transaction_id` | uuid | FK → `transactions` once posted |
| `raw_payload` | jsonb | Purged after 30 days (see Privacy) |
| `created_at` / `resolved_at` / `resolved_by` | | |

Indexes: `(household_id, status, occurred_at desc)`, unique
`(household_id, dedup_key)`.

RLS: member select, editor update. Inserts arrive only through the definer RPC.

### `capture_card_map`

`(household_id, match_text, account_id)` — for notifications that name a card
without digits. Small, editor-managed from Settings.

### `transactions_source_chk`

Add `'tap_capture'` to the allowed values. Additive migration; every existing
row keeps its value.

---

## Requirements and acceptance criteria

| ID | Requirement | Acceptance |
|---|---|---|
| TAP-01 | The user can mint a named capture token in Settings | Plaintext shown exactly once; only the hash is persisted; the token appears in a list with `last_used_at` |
| TAP-02 | The user can revoke a token | Revoked token returns 401 on the next ingest; the row is retained, not deleted |
| TAP-03 | Settings shows a copy-paste recipe per platform | iOS Shortcut steps and an Android automation recipe, each with the user's endpoint pre-filled |
| TAP-04 | A valid POST creates exactly one `capture_inbox` row | 200 with the inbox id; row visible in the inbox within seconds |
| TAP-05 | A replayed POST does not create a second row | Same `external_id` or same dedup key → `status = 'duplicate'`, no ledger write |
| TAP-06 | An invalid or revoked token writes nothing | 401; no row in any table; no household leaked in the response body |
| TAP-07 | The inbox lists pending captures with amount, merchant, account, category suggestion and confidence % | Sorted newest first; confidence rendered as a percentage |
| TAP-08 | One tap posts a pending capture to the ledger | Uses `create_manual_transaction`; `source = 'tap_capture'`; entries and allocations correct; balance moves |
| TAP-09 | A capture with no resolvable account never auto-posts | Stays `pending` with an "assign account" prompt |
| TAP-10 | Confidence ≥ threshold auto-posts | Transaction created as `review_status = 'unreviewed'`; the capture flips to `posted` and links `transaction_id` |
| TAP-11 | Confidence < threshold never auto-posts | Remains `pending` |
| TAP-12 | Confirming a category offers "always categorize X as Y" | Accepting writes a `categorization_rules` row; the next capture from that merchant scores 0.95 |
| TAP-13 | The threshold is user-configurable | Default 0.90; changing it takes effect on the next capture |
| TAP-14 | Tap capture is off until a token exists | No token → no endpoint surface, no inbox entry point in the nav |
| TAP-15 | RLS holds | A member of another household cannot read or resolve any capture row |
| TAP-16 | Localization | All new strings in en / es / fr-CA; `npm run i18n:check` passes |

---

## Delivery plan

### Phase 0 — Detection spike (hard gate, ~2 hours, no app code)

**Run book: [../alpha/tap-capture-phase-0-spike.md](../alpha/tap-capture-phase-0-spike.md)**
— step-by-step per platform, the payload contract, results tables, and the
go/no-go decision. A parse sandbox ships with it
(`scripts/parse-capture-sample.mjs`, offline, dev-only) so notification text can
be tested for parseability without standing up any infrastructure.

Prove the tap produces a machine-readable event **on the user's actual phone and
card**, before anything is built.

- iOS: Settings → Shortcuts → Automation → **Transaction** → *Get Contents of
  URL* pointed at a throwaway request-bin. Tap-pay for something small. Inspect
  what arrives.
- Android: install MacroDroid (or Tasker), trigger on a Google Wallet
  notification, POST the notification text to the same bin.
- Also capture what the **bank's** own alert looks like (Path C), as the
  fallback.

**Record for each: does an event fire at all, how many seconds later, and does
it contain merchant, amount and card digits?**

Exit criteria:
- At least one path produces merchant **and** amount → proceed to Phase 1.
- Only free-text bank alerts arrive → proceed to Phase 1 with Path C as primary
  and a text parser in Phase 2.
- Nothing fires on any path → **stop.** The feature is not deliverable on this
  device, and the fallback is a faster manual capture (the existing Quick add
  shortcut plus a home-screen NFC sticker) rather than this design.

This phase costs almost nothing and is the only thing standing between the
project and a sprint spent on an endpoint no phone can reach.

### Phase 1 — Ingest plumbing (one sprint)

Everything except automatic categorization.

- Migration: `capture_tokens`, `capture_inbox`, `capture_card_map`, RLS
  policies, `ingest_tap_payment` RPC, `'tap_capture'` on the source constraint.
- `POST /api/ingest/tap` route handler — **the project's first API route**;
  `src/app/api/` does not exist yet. Zod-validated payload, token in the
  `Authorization` header, thin wrapper over the RPC.
- Settings section: mint/revoke tokens, set the default account, per-platform
  recipe with the endpoint pre-filled.
- `/dashboard/capture-inbox`: list pending captures; "Post" opens the existing
  transaction form pre-filled; "Dismiss" resolves without a ledger write.
- No auto-post, no confidence — every capture is a one-tap suggestion.

Shippable on its own: it already removes most of the typing.

### Phase 2 — Confidence engine (one sprint)

- `src/lib/capture/classify.ts` — layers 1–3 (rules, payee history, fuzzy),
  reusing `src/lib/rules/match.ts` unchanged.
- Persist `confidence` + `confidence_source`; render the percentage in the
  inbox.
- Auto-post above the threshold, via `create_manual_transaction`, as
  `unreviewed`.
- Threshold setting; "always categorize X as Y" writing a BR-010 rule.
- Text parser for Path C bank alerts, if Phase 0 made that the primary path.

This is the sprint that delivers the actual request.

### Phase 3 — Coverage and hardening (later, scope on evidence)

- AI fallback classification (layer 5), capped below the threshold.
- MCC map (layer 4), only if a real payload carries an MCC.
- CSV-import duplicate detection against `tap_capture` transactions.
- An accuracy report: correction rate by `confidence_source`.

### Phase ordering rationale

Phase 1 is useful without Phase 2; Phase 2 is worthless without Phase 1; and
both are worthless if Phase 0 fails. Do not merge them.

---

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| No detection path fires on the user's device/card | Feature is undeliverable | Phase 0 is a hard gate before any code |
| Automation silently stops (OS update, revoked notification access, battery optimization killing the automation app) | Expenses go missing without any error | Inbox shows "last capture received N days ago"; Path C configured as a redundant sender |
| Duplicate with the later CSV/bank import | Double-counted spend, wrong balances | `dedup_key` within capture; import-preview matching in Phase 3 |
| A leaked capture token | An attacker can inject fake captures into the household | Hash-only storage, revocable, rate-limited, writes only to staging — never to the ledger |
| Over-eager auto-post | User loses trust and disables the feature | Threshold defaults high (0.90), AI capped below it, everything lands `unreviewed`, measured correction rate |
| Wrong account when several cards share the last four digits | Expense on the wrong account | `capture_card_map` override; never guess when ambiguous |
| Scope creep into bank aggregation | Blows up MVP scope and the privacy principle | Path D is explicitly out of scope in this doc |

---

## Privacy

- The raw notification text can contain the card's last four digits and, on some
  banks, the balance. `raw_payload` is retained **30 days** for debugging, then
  purged by a scheduled job; the parsed fields persist.
- Capture tokens are stored hashed. The plaintext exists only in the
  notification shown at creation and in the user's own automation config.
- No third party is introduced by Paths A–C: the automation posts directly from
  the user's phone to the user's own App Finanzas deployment. Nothing transits a
  vendor. Path D would break this, which is part of why it is excluded.
- The ingest endpoint must not echo household or account data in its response —
  only the inbox id.

---

## Open Decisions

| # | Decision | Options | Leaning |
|---|---|---|---|
| 1 | Is the auto-post threshold per user or per household? | `profiles.ui_preferences` vs a household setting | Per household — the ledger is shared, so the risk tolerance should be too |
| 2 | Should a below-threshold capture notify the user at all? | Silent inbox vs push (needs a service worker, which the app does not have) | Silent for Phase 2; revisit with the service-worker decision in [pwa.md](./pwa.md) |
| 3 | How is the CSV/bank-import duplicate resolved once found? | Auto-skip the import row vs flag for the user | Flag — the project's manual-first principle argues against silent drops |
| 4 | Does a tap on a credit card post as `posted` or `pending`? | The charge is authorized, not settled | `posted` — the money is committed and the user's mental model says "I paid"; revisit if reconciliation (BF-022) lands |
| 5 | Should `capture_inbox` rows be purged after resolution? | Keep forever vs purge resolved after 90 days | Keep the row, purge only `raw_payload` — it is the audit trail for accuracy measurement |
| 6 | Is one token per device or one per household? | | Per device — revoking a lost phone should not break the other one |

---

## Manual Supabase commands

None yet — no migration has been written. When Phase 1 is built, the migration
will be prepared locally and the exact command listed for the user to run
manually, per the project's database rules.

---

## Related

- [../alpha/tap-capture-phase-0-spike.md](../alpha/tap-capture-phase-0-spike.md) —
  the Phase 0 run book, and the gate this whole design depends on
- [pwa.md](./pwa.md) — install, share target, and the standing no-service-worker decision
- [recurring-transactions.md](./recurring-transactions.md) — the existing
  `SECURITY DEFINER` + scheduled-job precedent this design follows
- [ai-assistant.md](./ai-assistant.md) — the Anthropic client reused by layer 5
- [csv-import-fx.md](./csv-import-fx.md) — the import path that must learn to
  dedupe against tap captures
- [../pending-work.md](../pending-work.md) — index entry for this feature
