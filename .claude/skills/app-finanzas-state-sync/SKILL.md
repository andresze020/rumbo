---
name: app-finanzas-state-sync
description: Use when closing, finishing, or merging an App Finanzas sprint, or whenever AGENTS.md / project-state docs may have drifted from the real code. Keeps the canonical state in sync with reality.
---

# App Finanzas State Sync

Use this skill to keep the **canonical project state** truthful. The single
biggest consistency failure on this project is documentation drift: state docs
claiming an old sprint while the code has moved on many sprints. This skill exists
to make that impossible to leave stale.

## When to run

- At sprint close / merge to main.
- When the user says "finish", "close the sprint", "we merged", or "update state".
- Whenever you notice `AGENTS.md` disagrees with the code you just read.

## Source of truth, in order

1. The **code and migrations** (`src/`, `supabase/migrations/`) — authoritative.
2. The **alpha docs** (`docs/alpha/sprint-12-alpha-plan.md`, `docs/alpha-readiness-checklist.md`).
3. Only then the prose docs. If a doc disagrees with code, the doc is the bug.

## What to update at sprint close

1. **`AGENTS.md` → Current status**: bump to the real current sprint, list the
   sprint's user-facing changes in one or two lines.
2. **`AGENTS.md` → Real Supabase tables**: regenerate from migrations, do not trust
   memory. Quick check:

   ```powershell
   Select-String -Path supabase/migrations/*.sql -Pattern 'create table' |
     ForEach-Object { $_.Line } | Sort-Object -Unique
   ```

3. **`AGENTS.md` → Key areas**: add any new top-level route or `src/lib` module.
4. **`docs/SPRINT-LOG.md`** (append-only): add one entry per closed sprint. Create
   the file if missing using the template below.

## SPRINT-LOG entry template

```markdown
## Sprint <X.Y> — <short name>  (<YYYY-MM-DD>)
- Goal:
- Shipped:
- Migrations added:
- Tables changed:
- Follow-ups / known gaps:
```

## Rules

- Never invent state. Every claim must trace to a file you actually read.
- Keep `AGENTS.md` short — it is loaded into context every session. Detail lives in
  `docs/SPRINT-LOG.md`, not in `AGENTS.md`.
- After updating, state explicitly what changed so the user can verify.

## Committing state-sync changes

If the change touches **only** doc/state files (`AGENTS.md`, `docs/**`,
`.claude/**`), commit and push directly to main — no branch, no PR. These files
can't affect build/runtime and the branch+PR ceremony is overhead for a small text
diff. If the sync is bundled with code changes (e.g. part of a feature branch),
follow the normal sprint-flow branch/merge process instead.
