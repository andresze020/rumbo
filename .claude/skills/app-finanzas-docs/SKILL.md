---
name: app-finanzas-docs
description: Use when writing or updating App Finanzas documentation — feature docs, alpha/process docs, checklists, or any Markdown under docs/. Enforces the project's existing doc conventions (location, Status block, structure, cross-links, privacy).
---

# App Finanzas Docs

Use this skill to write documentation that matches what already exists under
`docs/`. Match the current conventions exactly — do not invent a new house style.

## Where docs live

- `docs/features/<feature>.md` — one file per feature (shipped or proposed):
  `ai-assistant.md`, `pwa.md`, `recurring-transactions.md`, `user-settings.md`, etc.
- `docs/alpha/<topic>.md` — Alpha process docs: plans, logs, triage rules,
  checklists used during real-data validation.
- `docs/` root — cross-cutting docs: `alpha-readiness-checklist.md`,
  `SPRINT-LOG.md` (the latter is owned by `app-finanzas-state-sync`).
- `Documentation/` — the formal V1 source-of-truth set (Roadmap, Product Brief,
  PRD, Data Model). Treat as read-only references; do not regenerate them.

Filenames are lowercase `kebab-case.md`.

## Feature doc structure

Start with the title and a Status block, then sections separated by `---` rules:

```markdown
# <Feature Name>

## Status
**<Implemented | Pending — not yet implemented | Planned>.**
<DB impact line — e.g. "No database schema changes required." or
"Schema table `x` already exists in production.">

---

## Context
<Why this exists, the user problem, in plain prose.>

---

## Architecture
<Model, modes, entry points. Reference exact paths in `backticks`.>
```

Status conventions observed in the repo:
- Implemented: `**Implemented — merged in v0.19.0.**`
- Implemented (no version): `**Implemented.**`
- Not built yet: `**Pending — not yet implemented.**`
- Always add the database-impact line right under the status.

## Process / alpha doc structure

Lead with a blockquote note declaring intent, then the body:

```markdown
# <Doc Name>

> Documentation only. <one line on purpose, with a relative cross-link if it
> classifies or feeds another doc, e.g. [bug-friction-log.md](./bug-friction-log.md)>
```

For logs and structured data, include a **Field guide** that defines each column,
then the data as a Markdown table.

## Conventions (match these exactly)

- **Separators**: `---` horizontal rules between top-level sections in feature docs.
- **Cross-links**: relative paths — `[real-data-import-plan.md](./real-data-import-plan.md)`.
- **File/code references**: exact paths in backticks (`src/app/layout.tsx`,
  `/public/manifest.json`), not vague descriptions.
- **Versions**: `vX.Y.Z`. **Dates**: `YYYY-MM-DD`. **IDs**: stable prefixes
  (`BF-001`).
- **Tables** for modes, requirements, field guides, and logs.
- **Prose language** may be English or Spanish (the repo mixes both, e.g.
  `## Context` vs `## Contexto`) — match the language of the file you are editing;
  for a new file, default to English. **Structure stays identical regardless.**

## Privacy (non-negotiable)

This is a real personal-finance app. In any doc, especially logs:
- **Redact real amounts and account numbers.** Describe issues structurally.
- Never paste real financial figures, statements, or balances into a doc.

## Keep docs truthful

- A feature doc's Status must match reality. If you ship or change a feature,
  update its doc's Status in the same change.
- Sprint-level state belongs in `AGENTS.md` + `docs/SPRINT-LOG.md` via
  `app-finanzas-state-sync`, not scattered across feature docs.
- Validate touched code with `app-finanzas-verify` before marking a doc
  "Implemented".
