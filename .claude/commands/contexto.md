---
description: Estado del proyecto (rama, sprint actual, pendientes) sin leer los docs largos
---

Dame el estado actual del proyecto sin cargar documentación pesada:

1. `git status --porcelain` y `git log -3 --oneline`.
2. Las dos entradas de `## Current status` de `AGENTS.md` (ya es un archivo
   corto, léelo entero).
3. Migraciones en `supabase/migrations/` más recientes que la última mencionada
   como aplicada en `AGENTS.md` — solo los nombres, con `ls`.

Resume en menos de 15 líneas: rama, qué se hizo último, qué está pendiente de
aplicar, y qué conviene hacer ahora.

**No leas** `docs/SPRINT-LOG.md`, `docs/pending-work.md` ni los benchmarks salvo
que te lo pida explícitamente.
