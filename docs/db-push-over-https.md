# Pushing migrations over HTTPS

## Status
**Implemented.**
No database schema changes required — this is tooling for applying the
migrations that already live in `supabase/migrations/`.

---

## Context

`npx supabase db push` speaks the PostgreSQL wire protocol on TCP 5432. That is
fine from the desktop checkout and impossible from a Claude Code cloud session —
the kind started from the phone, or with `claude --cloud`:

- All outbound traffic from a cloud session goes through an **HTTP/HTTPS proxy**.
  A raw TCP connection to port 5432 is never established; it times out.
- `db.karbhlstwxhjdnepglza.supabase.co` resolves **IPv6-only**, and the session
  VM has no IPv6. The IPv4 pooler
  (`aws-1-us-east-2.pooler.supabase.com:5432`) is reachable by DNS but blocked
  by the same proxy.

No environment variable fixes this: it is a transport limitation, not a
credentials one. The Supabase **Management API** exposes the same database over
plain HTTPS, which does traverse the proxy, so that is the channel this uses.

---

## The script

`scripts/db-push.mjs` reimplements the part of `db push` that matters: diff
`supabase/migrations/` against `supabase_migrations.schema_migrations`, then send
each pending file through
`POST https://api.supabase.com/v1/projects/{ref}/database/query`, recording it in
the same tracking table the CLI uses.

A migration applied through this script is indistinguishable from one applied by
the CLI. The two stay interchangeable, and the repo keeps describing the base —
which is the drift that `docs/supabase-mcp.md` warns about when DDL is applied
ad hoc.

| Command | Effect |
| :-- | :-- |
| `npm run db:status` | Applied / pending counts, pending filenames, the tracking-table columns a push would fill, and any version applied remotely with no local file |
| `npm run db:push` | Dry run — prints the plan, writes nothing |
| `node scripts/db-push.mjs push --apply` | Applies the pending migrations |

Flags: `--allow-out-of-order` (apply a file older than the newest applied
migration), `--force` (apply a file containing explicit `BEGIN`/`COMMIT`).

### Guarantees and limits

- **Scope**: it runs files from `supabase/migrations/` and nothing else. There is
  no way to hand it arbitrary SQL.
- **Atomicity**: each migration and the row recording it travel in one request,
  so PostgreSQL runs them in a single implicit transaction — both land or
  neither does. A file with its own transaction control breaks that assumption,
  which is why `--force` exists and why the script refuses without it.
- **Ordering**: a pending file older than the newest applied migration is
  refused by default. It would run against a schema it was never written for.
- **Dry run by default**: `push` writes only with `--apply`. Both `status` and the
  dry run read the tracking table's columns, so everything the write path needs
  except the `INSERT` itself is exercised before anything is applied.
- **No `db diff` / `db dump` equivalent.** Those need Docker and a direct
  connection. Schema inspection from a cloud session goes through the Supabase
  MCP server (`docs/supabase-mcp.md`).

---

## Setup

The script needs a Supabase personal access token and a network policy that lets
the session reach Supabase.

### 1. Environment variables

`SUPABASE_ACCESS_TOKEN` — create one at
<https://supabase.com/dashboard/account/tokens>. The project ref is read from
`supabase/.temp/project-ref`, which is committed, so no linking step is needed;
`SUPABASE_PROJECT_REF` overrides it.

| Where | How |
| :-- | :-- |
| Desktop | `setx SUPABASE_ACCESS_TOKEN "sbp_..."`, then reopen the terminal |
| Cloud sessions | claude.ai/code → cloud icon → gear on the environment → **Environment variables** |

### 2. Network access (cloud sessions only)

In the same dialog, set **Network access** to **Custom**, tick *"Also include
default list of common package managers"*, and add:

```text
*.supabase.com
*.supabase.co
```

Supabase is not on the default Trusted allowlist. Without this the proxy answers
`403` to the CONNECT and the script fails with a reachability error naming this
step.

Environment variables are copied once at session start, so both changes apply to
**new** sessions only.

### 3. Optional — fewer prompts from the phone

Approving each run by hand is one tap, and is a reasonable last checkpoint before
a write to production. To skip it for the read-only commands, add to the `allow`
list in `.claude/settings.json`:

```json
"Bash(npm run db:status)",
"Bash(npm run db:push)"
```

Leaving the `--apply` form out of `allow` keeps the confirmation on the only
command that writes.

---

## Risk

This token and this script reach **production**. There is no staging copy of this
database, and `docs/supabase-mcp.md` records the same warning for the MCP path.

- Cloud environments have **no secrets store**. Variables are plaintext, readable
  by anyone using the environment. A `sbp_` token is account-wide: it is not
  scoped to this project the way the MCP server's `--project-ref` flag is.
- Revoke a leaked token from the same dashboard page where it was created.
- The standing rule in `.claude/CLAUDE.md` still holds: an agent does not apply
  migrations on its own initiative. This script changes *where* a push can be run
  from, not *who decides* to run it.
