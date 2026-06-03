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
4. Inspect existing code before proposing edits.
5. Produce a concise plan before implementation.
6. Avoid post-MVP features unless explicitly requested.
7. Preserve household-first/RLS architecture.
8. Do not run Git write/history/remote commands.
9. Do not run Supabase remote/write commands.
10. End with validation and exact manual commands.

## Branch hygiene

Before edits, check or ask user to check:

```powershell
git checkout main
git pull origin main
git status
git checkout -b sprint-XX-X-short-name
```

Claude may suggest the branch name but must not run risky Git commands:
- git add
- git commit
- git push
- git merge
- git tag
- git reset
- git clean
- git rebase

## Implementation boundaries

Do:
- Make scoped code changes.
- Keep commits logically separable.
- Create migrations when needed.
- Explain migration impact.
- Run safe validations when allowed.

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
- Manual Git commands:
```

Manual Git command template:

```powershell
git status
git diff
git add .
git commit -m "type: short message"
git push -u origin <branch>

git checkout main
git pull origin main
git merge --no-ff <branch>
git push origin main

git tag vX.Y.Z-short-name
git push origin vX.Y.Z-short-name
```
