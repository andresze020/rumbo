---
name: app-finanzas-sprint-flow
description: Use when planning, starting, implementing, reviewing, or closing an App Finanzas sprint. Enforces branch hygiene, sprint scope, validation, Supabase manual commands, and manual Git release flow.
---

# App Finanzas Sprint Flow

Use this skill when the user asks to continue, start, review, finish, or create a prompt for a sprint.

## Required sprint workflow

1. Verify current branch and working tree.
2. Confirm the sprint objective from project context.
3. Keep scope limited to the sprint.
4. Locate existing code before proposing edits — delegate to `scout` when you
   do not already know where it lives, so large files never enter this context.
5. Produce a concise plan before implementation.
6. Avoid post-MVP features unless explicitly requested.
7. Preserve household-first/RLS architecture.
8. Run Git branch/commit/push/merge/tag as the user asks (see "Git" below).
9. Do not run Supabase remote/write commands.
10. Run the validation gate via the `app-finanzas-verify` skill before declaring done.
11. End with validation and any exact manual commands still required.

## Closing a sprint

When the user finishes or merges a sprint, invoke the `app-finanzas-state-sync`
skill to update `AGENTS.md` and `docs/SPRINT-LOG.md`. A sprint is not "closed"
until the canonical state reflects it — stale state docs are the project's main
consistency failure.

## Git

Claude runs the normal Git flow itself. Branch, commit, push, merge and tag are
allowed in `.claude/settings.json`; do not hand the user a list of commands to
paste when you can just run them.

Before edits:

```powershell
git checkout main
git pull origin main
git status
git checkout -b sprint-XX-X-short-name
```

**One change, one branch — never commit straight to `main`,** however small the
change.

Still forbidden, because they destroy work that cannot be recovered:
- `git reset --hard`
- `git push --force` / `-f`
- `git clean`
- `git rebase`
- `git branch -D`

These are denied in `settings.json` too. If one of them is genuinely the right
move, stop and ask — do not work around the denial.

Merging to `main` and tagging a release stay the user's call: propose, wait for
a yes. Everything before that — branch, commit, push, open the PR — is yours.

## Implementation boundaries

Do:
- Make scoped code changes.
- Keep commits logically separable.
- Create migrations when needed.
- Explain migration impact.
- Run the validation gate (`app-finanzas-verify`) before declaring done.

Do not:
- Expand into unrelated modules.
- Add bank sync, Stripe, OCR, native apps, advanced AI, or paid-plan features unless explicitly requested.
- Rewrite core data model without a migration rationale.
- Change RLS casually.

## Final response checklist

End with:

```text
Summary
- Files changed:
- Database/migration impact:
- Commands run:
- Manual tests:
- Manual Supabase commands:
- Git state (branch, pushed?, PR, awaiting merge approval?):
```

## What is still manual

Only two things. Everything else Claude does itself.

**Supabase.** Never run `npx supabase db push`, `db reset` or `db remote`.
Prepare the migration and give the user the exact command to run.

**Merge to `main`, and tags.** Propose them; the user approves.

```powershell
# only after the user approves
git checkout main
git pull origin main
git merge --no-ff <branch>
git push origin main

git tag vX.Y.Z-short-name
git push origin vX.Y.Z-short-name
```
