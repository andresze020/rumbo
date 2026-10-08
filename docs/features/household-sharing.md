# Household sharing: members, invitations and private accounts

## Status

Planned. Phases HH-0 … HH-6, one branch and one PR each. Update this line as phases land.

## 1. Decisions

- **D1** One household holds shared AND private accounts. An account is shared (`private_owner_id` is null) or private to exactly one member.
- **D2** Other members see NOTHING of a private account: not its existence, name, balance or transactions. No override for owner or admin.
- **D3** Household numbers (budgets, month close, anything in scope "household") use shared data only and are identical for every member. A scope switch (household | mine | all) shows the private side to its owner.
- **D4** Invitations are a single-use link bound to one email, shared by hand. No email provider. No service-role key.
- **D5** Any editor (owner, admin, member) may create private accounts for themselves. Shared accounts stay owner/admin only.
- **D6** shared -> private is allowed only while the household has exactly one active member and no pending invitation. private -> shared is allowed to the account's owner only, behind a confirmation; with more than one member it is irreversible.
- **D7** Categories, tags, notes, categorization rules, exchange rates and budgets stay household-shared. Payees get privacy.
- **D8** Out of scope: bill split / "whose expense" (BR-D03), advisor access (BR-D04), private budgets, moving accounts between households, automatic emails, push notifications, client-side encryption, deleting a user account.

## 2. Roles

Exactly one active owner per household at all times.

- **owner**: everything; invites any role below owner; changes any role but their own; removes anyone but themselves; transfers ownership; leaves only after transferring.
- **admin**: manages shared accounts, categories, opening balances, shared recurring rules, household settings; invites member/viewer; switches member<->viewer; removes members and viewers; sees the audit trail; may leave.
- **member**: writes transactions on shared accounts, budgets, goals, debt payments, imports, month close (today's "editor" set); owns private accounts; may leave.
- **viewer**: reads shared data only; cannot write; cannot own private accounts; may leave.
- Nobody reads another member's private data.

## 3. Requirements

### Invitations

- **INV-1** Owner/admin invites by email with a role. Only owner invites admin. Nobody invites owner.
- **INV-2** One link, shown once, valid 7 days, Copy + Web Share. A new link for the same email revokes the previous one.
- **INV-3** Before the first link in a single-member household: a review step listing every account with Shared / Only me, and "the invited person will see N accounts and their full history".
- **INV-4** Settings lists pending invitations (email, role, expiry, Revoke).
- **INV-5** Link opened signed out -> sign in / sign up -> back to the invitation.
- **INV-6** Link opened signed in with the invited, verified email -> household name, inviter (with email), role, what is shared, Accept / Decline. Nothing happens on GET.
- **INV-7** Any other account -> "this invitation was sent to a different email address", no household detail.
- **INV-8** Expired / revoked / used -> one neutral dead-end page.
- **INV-9** Accept -> active member. A user with no household skips create-your-household onboarding and lands in the joined one. A user with a household keeps it and is offered a switch.
- **INV-10** Caps: 10 pending invitations and 6 active members per household; 20 invitations created per household per day.

### Members

- **MEM-1** Settings > Members card: name, role, joined date, "you". Emails for owner/admin only.
- **MEM-2** Role change, removal, ownership transfer per section 2, each behind an alert dialog.
- **MEM-3** A member can leave; the owner must transfer first.
- **MEM-4** Removal/leaving ends access on the next request.
- **MEM-5** In a household that has ever had two members, a shared transaction shows who added it; former members show as "Former member (name)".
- **MEM-6** Owner/admin see the last 50 membership events.
- **MEM-7** If a user's default household is not an active membership, move them to another membership or to onboarding, without an error page and without naming the household.

### Private accounts

- **PRV-1** Account form: "Who can see this account?" Household | Only me. Members can only choose Only me.
- **PRV-2** Lock marker for the owner wherever a private account appears.
- **PRV-3** Everything hanging from a private account is private to its owner: transactions, entries, allocations, tag links, debts, linked goals, recurring rules, installment plans, imports, import presets, card-cycle summaries.
- **PRV-4** Transfer between the owner's private account and a shared account is allowed ("mixed"). Others see the shared side, amount, date, description, and "Private account" as counterpart; only the owner can edit or void it.
- **PRV-5** Owner can share a private account; the dialog states how many transactions, payees and linked items become visible.
- **PRV-6** shared -> private only per D6.
- **PRV-7** A payee typed on a private transaction (every account private) is private. The same name on a shared or mixed transaction creates or reuses the shared payee.
- **PRV-8** A shared card cannot bill to a private account; a private card may bill to a shared one.
- **PRV-9** Recurring rules on a private account keep auto-posting for their owner and stop when the owner is not an active member.

### Scope

- **SCP-1** Switch Household / Mine / Everything, shown only to a user with at least one private account in the active household.
- **SCP-2** household = shared only (same numbers for every member). mine = caller's private only. all = both.
- **SCP-3** Applies to dashboard, accounts, transactions, net worth, reports, trends, cash flow, calendar, month review, debts, goals, installments, recurring, export, assistant.
- **SCP-4** Budgets, rollover and the month-close snapshot always use household, and say so on screen.
- **SCP-5** Remembered per user; default all.
- **SCP-6** With no private accounts all three scopes are identical and every screen behaves as today.

### Leaving

- **LIF-1** A leaving member with private accounts is offered a CSV export first.
- **LIF-2** A removed or departed member can export their own private data from that household for 30 days (Settings > Former households). Nothing else there is readable.
- **LIF-3** After 30 days those private accounts are soft-deleted. Rejoining inside the window restores them.
- **LIF-4** Shared data created by a former member stays.

## 4. Data model

`private_owner_id uuid null references auth.users(id)`: null = shared, a user id = private to that user.

- `accounts.private_owner_id` — source of truth. Set at INSERT (policy-constrained), then immutable for the authenticated role; only `set_account_private` / `share_private_account` change it.
- `transaction_entries.private_owner_id` — copied from the entry's account.
- `transactions.private_owner_id` + `transactions.visibility` (`'shared'` | `'mixed'` | `'private'`). Owner is set when ANY entry is private. private = every entry private; mixed = private and shared entries.
- `transaction_allocations.private_owner_id`, `transaction_tags.private_owner_id` — set only when the transaction's visibility is `'private'`.
- `payees.private_owner_id` — replace `idx_payees_household_name_unique` with two partial unique indexes: `(household_id, lower(name)) where private_owner_id is null`, and `(household_id, private_owner_id, lower(name)) where private_owner_id is not null`.
- `debts`, `installment_plans` — from their account. `goals` — from `linked_account_id` (no link = shared). `recurring_transactions` — from `account_id` or `to_account_id`. `import_batches`, `csv_import_presets` — from `target_account_id`; a batch with no target account is private to `uploaded_by`. `import_rows`, `recurring_autopost_log` — from their parent.
- `household_members`: `removed_at`, `removed_by`; partial unique index: one row per household where `role = 'owner' and status = 'active'`.
- `household_invitations` (new): `id`, `household_id`, `email` (lowercased), `role` (admin|member|viewer), `token_hash`, `invited_by`, `created_at`, `expires_at`, `accepted_at`, `accepted_by`, `revoked_at`, `revoked_by`. One pending row per `(household_id, email)`. No client-readable `token_hash`.
- `household_audit_log` (new): `id`, `household_id`, `actor_id`, `action`, `target_user_id`, `metadata jsonb`, `created_at`. Append-only, written only by definer RPCs. Never stores a private account's name.

Derivation is done by triggers (SECURITY DEFINER, fixed `search_path`). BEFORE INSERT/UPDATE triggers OVERWRITE `private_owner_id` on the row being written, so a client value is ignored; an AFTER trigger on `transaction_entries` recomputes the parent transaction's `private_owner_id` and `visibility` and its allocations and tag links. The app never sends these columns except `accounts.private_owner_id` at INSERT. A trigger rejects a transaction that would touch private accounts of two different users.

### Policy clause

Added to the existing membership check, RUM-004 inlined-subquery style, with `(select auth.uid())`:

- SELECT everywhere: `private_owner_id is null or private_owner_id = (select auth.uid())`
- SELECT on transactions: `visibility <> 'private' or private_owner_id = (select auth.uid())`
- INSERT/UPDATE/DELETE everywhere: the first form. On `transaction_entries`, `transaction_allocations` and `transaction_tags` the write policies ALSO require the parent transaction to pass it.
- accounts INSERT: `(private_owner_id is null and is_household_admin) or (private_owner_id = auth.uid() and is_household_editor)`.

### Functions

All new definer functions: fixed `search_path`, auth check first, revoke from public and anon, grant to authenticated.

- `create_household_with_owner(name, base_currency)` — atomic onboarding.
- `get_household_members(household_id)` — user_id, display_name, role, status, joined_at; email only when caller is owner/admin; includes removed members flagged as former.
- `create_household_invitation(household_id, email, role)` -> raw token once; `revoke_household_invitation(id)`.
- `get_household_invitation_preview(token)`; `accept_household_invitation(token)`; `decline_household_invitation(token)`.
- `set_household_member_role`, `remove_household_member`, `leave_household`, `transfer_household_ownership`.
- `set_account_private(account_id)`, `share_private_account(account_id)` — recompute every dependent row in one transaction; share flips or merges the payees its transactions use.
- `export_my_private_data(household_id)` — only rows whose `private_owner_id = auth.uid()`; callable by a member removed less than 30 days ago.
- Reporting RPCs gain `p_scope text default 'household'` (`'household'` | `'mine'` | `'all'`); DROP the old signature in the same migration.

## 5. Security requirements (each needs a test or a stated manual check)

### Access control

- **S1** RLS is the only boundary. UI hiding is not a control. No service-role key in app code.
- **S2** `household_members` has no INSERT/UPDATE policy for clients; `households` has no creator clause. All membership changes go through RPCs enforcing section 2.
- **S3** Consent: nobody becomes an active member without accepting an invitation with their own verified email.
- **S4** FK checks ignore RLS. Every policy/RPC that takes an account, payee, category or transaction id re-reads it under RLS before use.
- **S5** An RPC answers a hidden account exactly as it answers a missing one (same error text).
- **S6** No unique constraint spans shared and private rows. Account names stay non-unique.
- **S7** Views, if ever added, are `security_invoker`. Nothing joins the realtime publication without review.
- **S8** Advisor: no SECURITY DEFINER function executable by anon (the `is_household_*` helpers stay executable by authenticated; trigger-only functions such as `handle_new_user` and `rls_auto_enable` lose execute for anon and authenticated); `set_updated_at` gets a fixed `search_path`; policies currently granted to `{public}` (`categorization_rules`, `recurring_autopost_log`) move to authenticated.

### Invitations

- **S9** Token: 32 random bytes, base64url; store SHA-256 only; shown once; single use (row locked on accept); 7-day expiry; revocable.
- **S10** Accept requires `auth.users.email` (lowercased) = invitation email AND `email_confirmed_at is not null`. Never trust `raw_user_meta_data` or client-supplied email.
- **S11** Accept/Decline are POST Server Actions. GET never mutates (link scanners).
- **S12** No enumeration: creating an invitation responds identically whether or not the email has an account; preview for a mismatched account reveals nothing.
- **S13** Role cap enforced in the RPC (S2). Removing a member, or demoting them below admin, revokes the pending invitations they created. Accepting is refused for the inviter's own email and is a no-op for someone already active.
- **S14** Return-after-sign-in is carried in an httpOnly, SameSite=Lax, short-lived cookie, never a query parameter, and must match `/invite/<token>`.
- **S15** The invite route sends `Referrer-Policy: no-referrer`, loads no third-party asset, and never logs the token.
- **S16** Caps per INV-10. No in-app banner for pending invitations.

### Private data

- **S17** Isolation test discovers every table with `private_owner_id` at run time; fixtures hold at least one private row per table, for two different owners.
- **S18** Household scope filters private rows EXPLICITLY (not by RLS alone) in budgets, rollover, payment split, health score and the month-close snapshot.
- **S19** The 06:00 pg_cron job `run_recurring_autopost` (definer) relies on the triggers, skips rules whose private owner is not an active member, and writes `last_error` only where the owner can read it.
- **S20** `copy_household_data` carries `private_owner_id` as is, or refuses a source with private rows.
- **S21** The assistant and the export route read through the user's session and take the scope.
- **S22** Mixed transfer: only the private owner edits or voids; others correct a shared balance with a balance adjustment (accepted limit).
- **S23** A refund is recorded in an account with the same `private_owner_id` as the original purchase.

### Lifecycle

- **S24** Removal sets `status = 'removed'`, `removed_at`, `removed_by` and resets the removed user's `default_household_id`. No physical delete.
- **S25** Accepting again reactivates the existing membership row.
- **S26** The last owner cannot leave, be removed or be demoted.

## 6. Accepted limits

- A shared expense paid from a private card does not reach the household budget (needs BR-D03).
- Money moved in from a private account is a transfer, not income; the household savings rate ignores it.
- A CSV import with per-row accounts is private to its uploader even when some transactions land in shared accounts.
- A member downgraded to viewer keeps private accounts read-only.
- The database operator can read everything in the Supabase dashboard; RLS does not protect against that.
- Two members editing the same transaction: last write wins.
- A page already open can show its cached render up to 30 s after removal (Router Cache, RUM-005).

## 7. Phases

### HH-0 Hardening and harness — no user-visible change

- `create_household_with_owner`; onboarding action calls it (keep the profile upsert and the `revalidatePath`/`failSetup` behaviour).
- Drop `household_members` INSERT and UPDATE policies and the creator clause of `households` SELECT; drop `households` INSERT policy. First confirm with scout that onboarding is the only app writer.
- `household_members.removed_at`/`removed_by`; one-active-owner partial unique index (verify live data first: every household has exactly one active owner today).
- `get_household_members`. `household_audit_log` + RLS (SELECT: owner/admin; no client writes).
- S8 advisor fixes.
- MEM-7 fallback in ONE place (the dashboard layout / `getHouseholdContext` path); do not refactor every page.
- Test harness: new directive `-- rumbo-test: run-as=co-member` with a new placeholder `__SUBJECT_USER_ID__`. `scripts/db-local.mjs` runs such a file twice against household A: as A2 with A1 as subject, and as A1 with A2 as subject. `scripts/db-test.mjs` takes `--co-member=<uuid>` and `--subject=<uuid>` and skips the file with a notice when they are absent. Update `scripts/*.test.ts`.
- `supabase/local/fixtures.sql` adds A2 through the admin INSERT policy this phase removes: insert that one row outside RLS with a comment, to be replaced by the invitation RPCs in HH-4.
- `supabase/tests/hh_000_membership_hardening.sql`: an admin cannot insert or update a membership row; a creator who is not a member cannot read the household; one active owner per household; anon cannot execute any definer function.
- Exit: `db:local` green; no advisor finding for anon-executable definer functions.

### HH-1 Private accounts in the database — no user-visible change

- Columns, triggers, indexes and policies of section 4 for every listed table.
- Write guards: review EVERY function that takes an account id (`create/update_manual_transaction`, both `create_transfer_transaction` overloads — drop the stale 8-argument one if unused —, `update_transfer_transaction`, `create_refund_transaction`, `create_balance_adjustment`, `create_opening_balance`, `create_debt_with_account`, `create_debt_payment`, `create_installment_plan`, `cancel_installment_plan`, `create_csv_import`, `revert_csv_import`, `void/unvoid_transaction`, `set_transaction_tags`, `apply_goal_adjustment`, `merge_payees`, `merge_payees_bulk`, `get_or_create_payee`). Admin-only functions and policies (opening balance, debt with account, recurring rules) must also allow the owner of a private account acting on it.
- `get_or_create_payee` gets the privacy context (PRV-7); merges never cross visibility.
- S19, S20, S23, PRV-8.
- `set_account_private` and `share_private_account`.
- Fixtures: ADD private accounts for A1 and for A2 (do not change existing ids or amounts), with an expense, an income, mixed transfers both ways, a private goal, debt, recurring rule, installment plan, import batch and payee each.
- `supabase/tests/hh_001_private_isolation.sql` (S17, both directions A1<->A2, including A1 as owner/admin unable to read A2's private rows), `hh_001_private_invariants.sql` (entry = account owner; visibility consistent; allocations/tags consistent; no two-owner transaction; a shared account's balance identical for A1 and A2; write refusals of S5/S22; payee indexes).
- Performance: re-measure the RUM-004 plans (`search_household_transactions`, `get_account_balances`) and `npm run db:local -- --bench`; stay within 10% of the recorded baseline.

### HH-2 Scope in reporting — no user-visible change

- `p_scope` on: `get_account_balances` (both overloads), `get_account_balances_as_of_many`, `get_monthly_dashboard_summary`, `get_monthly_expenses_by_category`, `get_card_cycle_summaries`, `search_household_transactions`, `get_payees_with_stats`, `get_tags_with_stats`.
- Hard household filter (no parameter) on: `get_monthly_budget_details`, `get_budget_line_carryovers`, `get_budget_payment_split`, `get_budget_previous_actuals`, `copy_budget_from_previous_month`.
- Scope semantics: balances and account lists filter on the account's `private_owner_id`; income, expense, category and budget figures filter on the allocation's; the transaction list shows a mixed transfer in every scope its viewer may see.
- One server helper that resolves the request's scope (household when the user has no private account) and one helper that applies it to direct `.from()` queries (`src/lib/analysis/`, page queries). Every call site passes scope explicitly.
- Month-close snapshot computed with household. Export route and assistant tools take scope.
- `supabase/tests/hh_002_scope_invariants.sql`: for each reporting RPC, household is identical for A1 and A2; household + mine = all for summable outputs; budgets unchanged by private rows; existing fixture expectations unchanged.

### HH-3 Private accounts and scope in the UI

- PRV-1, PRV-2, PRV-5, PRV-6, SCP-1…SCP-6. Null-safe rendering wherever an entry's account may be hidden ("Private account"). Read-only state on mixed transfers for non-owners. Account reorder touches only visible accounts.

### HH-4 Invitations

- `household_invitations` + RPCs; `/invite/[token]` outside `/dashboard` (allow it in `src/proxy.ts` for signed-out users); login actions and `auth/callback` honour the S14 cookie; INV-1…INV-10. Replace the HH-0 fixture shortcut with the invitation RPCs.
- `supabase/tests/hh_004_invitations.sql`: wrong email, unverified email, expired, revoked, reused, role cap, caps, re-accept reactivates, non-admin cannot create, `token_hash` unreadable.
- Manual check before merge: Supabase Auth requires email confirmation.

### HH-5 Members and leaving

- Member RPCs; Settings > Members; MEM-1…MEM-7; LIF-1…LIF-4; `export_my_private_data`; a pg_cron step that soft-deletes private accounts of members removed more than 30 days ago (LIF-3).
- `supabase/tests/hh_005_roles.sql`: the whole section-2 matrix, S24–S26.

### HH-6 Release gate

- Two real accounts on a Vercel preview through every INV/MEM/PRV/SCP/LIF requirement; security and performance advisors clean; `docs/release-checklist.md` run; sprint-closer updates `AGENTS.md` (1–2 lines), `docs/SPRINT-LOG.md`, `docs/pending-work.md`; this file's Status updated.

## 8. Open decisions (defaults in force until changed)

- Default scope: all (before HH-3).
- Members cannot create shared accounts (before HH-1).
- Viewer offered in the invite form (before HH-4).
- Invitation lifetime 7 days and INV-10 caps (before HH-4).
- Member emails visible to owner/admin only (before HH-5).
- Retention 30 days (before HH-5).
- Mixed transfers editable by the private owner only (before HH-1).

## 9. Execution contract (every HH phase)

1. Only the phase named. No drive-by refactors.
2. Inspect before editing (scout). Post a short plan before changing files.
3. Branch `feat/hh-<n>-<slug>` from an up-to-date main. Small logical commits. Push and open a PR against main. Do not merge. No destructive git.
4. Migrations: additive, timestamped after the latest in `supabase/migrations/` (migration-drafter). NEVER apply them: no `supabase db push`, no `db-push.mjs push --apply`. List the command for me.
5. Changing a function's parameters: DROP the old signature in the same migration. Qualify every column that shares a name with an OUT parameter.
6. Writes are Server Actions and each calls `revalidatePath` (`tests/cache/server-action-invalidation.test.ts`).
7. UI: reuse the shared components (FormDialog, alert-dialog for destructive confirms, Callout, FlashToast, SearchablePicker); every string through the i18n layer (i18n-scribe); every new route has a `loading.tsx`; phone first.
8. Tests: Vitest co-located for pure logic; SQL in `supabase/tests/hh_*.sql` using the existing `-- rumbo-test:` and `-- check:` conventions; fixtures only grow; `fixture-expectations.sql` keeps every new check non-vacuous. Show that each new test fails when its rule is broken.
9. Gate (verify-runner): `npm run lint`; `npx tsc --noEmit`; `npm test`; `npm run build`; `npm run db:local` when SQL, RLS or `supabase/tests` changed; `npm run i18n:check` when strings changed.
10. Before finishing: run ledger-guard on the diff, and list every new SECURITY DEFINER function and every new or changed policy with one line on what it allows.
11. Final response: Files changed / Database-migration impact / Commands run / Manual tests required / Manual Supabase commands / Deviations from this spec / Open decisions touched.
