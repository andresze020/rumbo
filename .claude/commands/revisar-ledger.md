---
description: Revisa el diff actual contra las reglas del ledger, RLS y migraciones de App Finanzas
---

Lanza el subagente `ledger-guard` (vía la herramienta Agent, con
`subagent_type: "ledger-guard"`) para revisar los cambios actuales.

Alcance a revisar: $ARGUMENTS

Si no se indicó alcance, revisa `git diff main...HEAD`.

Cuando el subagente termine, muéstrame sus hallazgos tal cual — no los resumas
ni los suavices. Si reportó algo 🔴, no declares la tarea lista.
