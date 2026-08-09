# Tap Capture — Phase 0 Detection Spike

> Documentation only. Run book for the hard gate in
> [../features/tap-payment-capture.md](../features/tap-payment-capture.md):
> prove that a real tap payment on **your** phone and **your** card emits a
> machine-readable event, before any ingest code is written.
>
> **Privacy:** real notifications contain real amounts and real card digits.
> Do **not** paste raw notification text into this file, into a commit, or into
> a chat. Record *structure* only — which fields appeared, not what they said.
> Use `scripts/parse-capture-sample.mjs` locally to inspect real text; it runs
> entirely offline and stores nothing.

---

## What this spike proves

Three questions, in order. A "no" on the first kills the feature; a "no" on the
second or third reshapes it.

1. **Does anything fire at all** when you tap-pay?
2. **How long** after the tap does it arrive?
3. **Does it carry merchant, amount, and card digits** — or only some of them?

Everything else about the feature (ingest endpoint, staging inbox, confidence
scoring) is ordinary work that will certainly function. This is the only part
that depends on facts nobody can look up, because coverage varies by card,
issuer, region, OS version and wallet app.

**Time budget: ~2 hours, including one small real purchase.**

---

## Exit criteria

| Outcome | Meaning | Next step |
|---|---|---|
| ✅ At least one path returns **merchant + amount** | The feature is deliverable as designed | Build Phase 1 |
| ⚠️ Only free-text bank alerts arrive | Deliverable, but the text parser moves from Phase 3 to Phase 2 | Build Phase 1 with Path C primary |
| ⚠️ Events fire but carry **amount only** | Auto-categorization cannot work; capture still saves typing | Re-scope: inbox only, no confidence engine |
| ❌ Nothing fires on any path | Not deliverable on this device | **Stop.** Fall back to faster manual capture (the existing Quick add shortcut) |

---

## Preparation

1. **Set up a receiver.** Any request bin works — `webhook.site`, `pipedream`,
   or `requestbin.com`. Open one and copy its unique URL.
   - Treat the URL as a secret for the duration of the spike: anything posted
     to it is readable by whoever has the link. **Delete the bin when done.**
   - Nothing is deployed and no App Finanzas code runs in this phase.
2. **Pick the purchase.** Something small you were going to buy anyway, at a
   merchant you can return to (the ice cream shop is ideal — the design's
   worked example depends on repeat visits at the same place).
3. **Note the card** you will tap with, and its last four digits.
4. Run `node scripts/parse-capture-sample.mjs --demo` once, so you know what
   the tool's output looks like before you have real text to feed it.

---

## Track A — iOS (Shortcuts "Transaction" automation)

The only path on iOS that needs no third-party software.

1. Shortcuts app → **Automation** tab → **+**.
2. Choose the **Transaction** trigger. Only cards present in Wallet are
   offered — **if your card is not listed, Track A is unavailable for it, and
   that is itself a Phase 0 result worth recording.**
3. Select the card. Leave merchant/category filters empty.
4. Set **Run Immediately** and leave "Notify When Run" **on** for the spike, so
   you can tell the difference between "did not fire" and "fired silently".
5. Add the action **Get Contents of URL**:
   - URL: your bin URL
   - Method: **POST**
   - Request Body: **JSON**
   - Add fields per the payload contract below, filling values from the
     trigger's magic variables (Amount, Merchant, Date).
6. Save, then **tap-pay for real**.
7. Open the bin and record what arrived.

> The exact names of the trigger's variables shift between iOS versions.
> Record what your build actually exposes rather than trusting any write-up,
> including this one.

---

## Track B — Android (automation app reading the notification)

1. Install **MacroDroid** (or Tasker / Automate — any of them works).
2. Grant it **Notification access** in system settings.
3. **Disable battery optimization** for the app. Skipping this is the single
   most common reason these automations work for two days and then silently
   stop.
4. New macro:
   - Trigger: **Notification Received**, application: Google Wallet. Add a
     second macro for your bank's app if it also notifies.
   - Action: **HTTP Request** → POST → your bin URL → body containing the
     notification title and text variables.
5. **Tap-pay for real.**
6. Record what arrived, then run the raw text through the parser:
   ```bash
   node scripts/parse-capture-sample.mjs --text "<paste the raw text>"
   ```
   The parser's verdict line is the finding — not your impression of whether
   the text "looks parseable".

---

## Track C — Bank email / SMS (universal fallback)

No automation to build in this phase. Just characterize the format, because
this is the safety net when A or B stop firing.

1. After the purchase, find the bank's own alert (push, SMS, or email).
2. Record: does it arrive at all, how late, and which fields it contains.
3. Run its text through the parser as above.

---

## Payload contract

Whatever the sender, this is the shape Phase 1's endpoint will accept. Having
the spike post this exact shape means the automation you build now is the one
you keep.

```json
{
  "external_id": "wallet-2026-08-09T14:32:05-0500-4821",
  "occurred_at": "2026-08-09T14:32:05-05:00",
  "amount": 12500,
  "currency": "COP",
  "merchant": "HELADERIA LA ESQUINA",
  "last_four": "4821",
  "source_kind": "ios_shortcut",
  "raw": "<original notification text>"
}
```

| Field | Required | Notes |
|---|---|---|
| `external_id` | No | Idempotency key. Any stable string the sender can reproduce on a retry. |
| `occurred_at` | Yes | ISO 8601 **with offset**. A bare local timestamp will land on the wrong day near midnight. |
| `amount` | Yes | Positive. Expense is implied. |
| `currency` | Yes | ISO 4217. **Never inferred from `$`** — see the ambiguity note below. |
| `merchant` | No | Missing merchant means no categorization, only capture. |
| `last_four` | No | Used to resolve the account. |
| `source_kind` | Yes | `ios_shortcut` \| `android_automation` \| `email_forward` |
| `raw` | No | Kept 30 days for debugging, then purged. |

### The `$` and `12.500` traps

Two parsing failures produce a *wrong number* rather than an error, which makes
them worse than a crash:

- **`$` is ambiguous** across COP, USD, CAD, MXN, ARS and CLP. The sender must
  state the ISO code, or the currency must come from the resolved account.
  Never from the symbol.
- **`12.500` is ambiguous.** Twelve thousand five hundred in Colombia, twelve
  and a half in the US. When a single separator is followed by exactly three
  digits, the string alone cannot settle it. `scripts/parse-capture-sample.mjs`
  flags this case rather than guessing — if your bank's format hits it, the
  currency must disambiguate, and that must be settled in Phase 1, not later.

---

## Results

Fill this in as you go. Structure only — no real amounts, no real merchant
names, no real card digits.

### Field guide

- **Track** — A (iOS Shortcuts) / B (Android automation) / C (bank alert).
- **Fired?** — Yes / No / Only with confirmation.
- **Latency** — seconds between tap and event arriving at the bin.
- **Merchant / Amount / Currency / Last four** — Present / Absent / Garbled.
- **Parser verdict** — the verdict line printed by `parse-capture-sample.mjs`.
- **Locked screen?** — did it fire with the phone locked and pocketed?

| Track | Fired? | Latency | Merchant | Amount | Currency | Last four | Parser verdict | Locked screen? | Notes |
|---|---|---|---|---|---|---|---|---|---|
| A — iOS Shortcuts | | | | | | | | | |
| B — Android automation | | | | | | | | | |
| C — Bank alert | | | | | | | | | |

### Repeat-fire check

One tap proves the trigger exists. It does not prove the trigger is reliable,
which is what the feature actually depends on. Record three more ordinary taps
over the following days before committing to Phase 1.

| # | Date | Track | Fired? | Latency | Notes |
|---|---|---|---|---|---|
| 1 | | | | | |
| 2 | | | | | |
| 3 | | | | | |

---

## Decision

Complete after the tables are filled.

- **Chosen primary path:** _____
- **Chosen fallback path:** _____
- **Outcome vs. exit criteria:** _____
- **Phase 1 go / no-go:** _____
- **Anything the design doc got wrong and must be corrected:** _____

Record the outcome in
[../features/tap-payment-capture.md](../features/tap-payment-capture.md) —
update its Status block and, if the design changed, its Open Decisions table.

---

## Cleanup

- [ ] Delete the request bin.
- [ ] Disable or delete the spike automation (it is posting your real purchases
      to a third-party bin — do not leave it running).
- [ ] Confirm no raw notification text was committed anywhere.
