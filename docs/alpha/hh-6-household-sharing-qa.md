# HH-6 Household Sharing QA

> Documentation only. The manual half of the HH-6 release gate in
> [../features/household-sharing.md](../features/household-sharing.md): two
> real accounts walked through every INV / MEM / PRV / SCP / LIF requirement.
> A requirement with no manual row is covered by an automated check; the
> table "Covered by automation" at the end names it.
> Follows the shape of [tier-3-4-authenticated-qa.md](./tier-3-4-authenticated-qa.md).
> No real amounts, account names, balances or email addresses are recorded
> here.

## Field guide

| Field | Meaning |
|---|---|
| ID | Requirement id in `household-sharing.md`. |
| Check | The observable assertion that closes the row. |
| Result | Passed, Partial, Failed, or Untested. |
| Evidence | Structural note of what was seen. Fill in when the row is run. |

---

## Setup

- **There is no staging database.** Previews and production share the live
  Supabase project, so everything below writes real rows. Do it with two
  **test** accounts in a **new test household**, never in your real one.
  - Gmail plus-addressing gives you two confirmable addresses in one inbox:
    `you+hh6owner@gmail.com` (account **A**) and `you+hh6member@gmail.com`
    (account **B**).
  - Sign up A in a private window and create a household called `HH-6 QA`.
    B signs up only through A's invitation (row INV-5).
- Both switches must be on for the environment you test:
  - Vercel `RUMBO_HOUSEHOLD_SHARING=1` (Preview and/or Production, then redeploy);
  - database `app_feature_flags.household_sharing = true` (on since 2026-10-11).
- Use two different browsers (or one normal and one private window) so A and B
  stay signed in side by side. Do the phone-sized rows on a phone.
- Before starting, give A in `HH-6 QA`: one shared checking account, one
  **Only me** checking account, one expense on each, and a transfer from the
  private account to the shared one (a mixed transfer).

---

## Checks

### Invitations

| ID | Check | Result | Evidence |
|---|---|---|---|
| INV-3 | A's first invite opens a review step listing every account as Shared / Only me, with "will see N accounts". N = shared accounts only. | Untested | |
| INV-1 | A (owner) is offered Admin / Member / Viewer. Later, as admin, B is offered only Member / Viewer. | Untested | |
| INV-2 | The link is shown once with Copy and Share. Inviting the same email again revokes the first link (old link → dead-end page). | Untested | |
| INV-4 | Household › Invitations lists the pending invite (email, role, expiry) and Revoke works. | Untested | |
| HH-7 email | Creating the invite says the email went out, and B receives it (needs custom SMTP in Supabase). Its link, opened on another device, creates B's account already confirmed, signs B in and lands on the invitation. | Untested | |
| INV-5 | B opens the link signed out → sign up → confirm email → lands back on the invitation, not on create-your-household. | Untested | |
| INV-6 | Signed in as B: household name, inviter (with email), role and shared-account count. Nothing happens until Accept. | Untested | |
| INV-7 | The link opened by a third account (or A) shows only "sent to a different email address", no household detail. | Untested | |
| INV-8 | A revoked or already-used link shows the same neutral dead-end page. | Untested | |
| INV-9 | After Accept, B (no household before) lands in `HH-6 QA`. | Untested | |

### Members

| ID | Check | Result | Evidence |
|---|---|---|---|
| MEM-1 | Household › Members shows name, role, joined date and "You". A (owner) sees B's email. B (member) does **not** see A's email. | Untested | |
| MEM-2 | A changes B member → viewer → member (confirm dialog each time). B's screens follow on the next page load (viewer: no write buttons). | Untested | |
| MEM-5 | A transaction B adds on the shared account shows "Added by B" in its details for A. A's mixed transfer shows no "Added by" for B. | Untested | |
| MEM-6 | A sees Recent activity: invited, joined, role changes. B (member) does not see it. | Untested | |
| MEM-2 | A makes B owner: B is the only owner, A becomes admin. B makes A owner again. | Untested | |

### Private accounts and scope

| ID | Check | Result | Evidence |
|---|---|---|---|
| PRV-2 / D2 | B sees nothing of A's private account: not in Accounts, pickers, dashboard, net worth, reports, transactions, export. | Untested | |
| PRV-4 | B sees A's mixed transfer on the shared account with "Private account" as the other side, and cannot edit or void it. | Untested | |
| PRV-1 | B (member) creating an account is offered only "Only me". | Untested | |
| PRV-3 | Give A's private account a goal, a recurring rule and a tag on its expense. B sees none of them (Goals, Recurring, Tags counts, Installments, Debts, Import history). | Untested | |
| PRV-7 | A types a new payee on a private expense; B does not see it in Payees. A types the same name on a shared expense; B now sees one shared payee. | Untested | |
| PRV-8 | Creating or editing a **shared** card whose payment account is A's private account is refused with the PRV-8 message; a private card paid from a shared account is accepted. | Untested | |
| PRV-6 | With B in the household, A's shared account no longer offers "Make private". | Untested | |
| PRV-5 | A shares a private account: the dialog states the counts; B then sees it with its history. (Irreversible: use a throwaway account.) | Untested | |
| SCP-1 | The Household / Mine / Everything switch shows for A (owns a private account), not for a user with none. | Untested | |
| SCP-2 / D3 | In Household scope, A's and B's dashboard totals for the same month are identical. Mine adds only A's private side. | Untested | |
| SCP-4 | Budgets and month close say "Household only" and don't change with the switch. | Untested | |
| SCP-3 | As A, flip Household → Mine → Everything on each screen and check A's private account/expense appears only in Mine and Everything: dashboard, accounts, transactions, net worth, reports, trends, cash flow, calendar, month review, debts, goals, installments, recurring, export (download one file per scope), assistant (ask "how much did I spend this month?"). | Untested | |
| SCP-5 | The chosen scope survives a reload and a sign-out/in, and is A's alone (B's switch is independent). | Untested | |
| SCP-6 | B, with no private account, sees no switch, and every screen shows the same numbers as A's Household scope. | Untested | |
| — | **While B is still an active member**, run the three co-member SQL files against the test household (they need two active members): `npm run db:test -- --household=<HH-6 QA uuid> --user=<A uuid> --co-member=<B uuid> --subject=<A uuid>`. Expect 0 failed and none skipped. | Untested | |

### Leaving

| ID | Check | Result | Evidence |
|---|---|---|---|
| MEM-3 / S26 | A (owner) has no Leave button, only the "make someone else owner first" note. | Untested | |
| LIF-1 | B creates a private account with one expense, opens Leave: the dialog offers the private-data CSV, and the CSV holds only B's private rows. | Untested | |
| MEM-4 / MEM-7 | B leaves: B lands in onboarding (no other household) without an error page; A's Members list no longer shows B. | Untested | |
| LIF-2 | B's onboarding (and Household, once B has a household) shows Former households › `HH-6 QA` with a working CSV download. | Untested | |
| LIF-4 | The shared transaction B added is still there for A, showing "Former member (B)". | Untested | |
| S25 | A invites B again; B accepts and their private account is visible to B again (rejoined inside 30 days). | Untested | |
| MEM-2 | A removes B (confirm dialog). B loses access on the next page load. | Untested | |

### Clean-up

- Leave the test household as it is (records are never physically deleted),
  or archive its accounts. B's private accounts are soft-deleted by the daily
  purge 30 days after B left.

---

## Automated half (already run)

| Gate | Result |
|---|---|
| CI on `main` (lint, types, unit, i18n, build, ledger invariants on fixtures) | Passed (PR #118) |
| `npm run db:test` on the live household (2026-10-11) | 110 passed, 0 failed. The three `run-as=co-member` files were skipped: they need two real members. They run in the pass above, before B leaves, with the full command: `--household` (required: there is more than one household), `--user` (membership-gated RPCs fail as `postgres` without it), `--co-member` and `--subject`. |
| Supabase security advisor | No anon-executable SECURITY DEFINER function (S8). Accepted: lint 0029 lists the 21 definer RPCs signed-in users call by design; each checks the caller first. Open: leaked-password protection (Auth setting). |
| Supabase performance advisor | The 8 `auth_rls_initplan` warnings are fixed by `20261011140000_hh_006_rls_initplan.sql` (applied 2026-10-11; the advisor no longer reports them). Accepted as INFO: unindexed foreign keys on actor/audit columns and unused indexes. |

## Covered by automation

Requirements without a manual row above, and where they are checked. All run
in CI (`npm run db:local`) and against production (`npm run db:test`).

| ID | Covered by |
|---|---|
| INV-10 (caps: 10 pending, 6 members, 20 a day) | `supabase/tests/hh_004_invitations.sql`, checks "caps — 10 pending invitations, 20 created per day" and "caps — 6 active members" |
| PRV-3 (every dependent row private) | `hh_001_private_isolation.sql` discovers every table with `private_owner_id` and proves the other member reads none of it (S17); the manual PRV-3 row checks the screens |
| PRV-9 (private recurring stops when its owner leaves) | `hh_001_private_invariants.sql` (S19, `run_recurring_autopost` skips an inactive private owner) |
| LIF-3 (purge after 30 days; rejoin inside keeps data) | `hh_005_roles.sql`, check "the purge soft-deletes only the private accounts of members gone 30 days; rejoining before keeps them"; the job runs daily at 06:20 UTC in production |
| S9–S16 (token, consent, no enumeration) | `hh_004_invitations.sql` |
| Section 2 matrix, S24–S26 | `hh_005_roles.sql` |
