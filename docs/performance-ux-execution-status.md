# Rumbo — Estado de ejecución del backlog RUM

> Documentation only. Estado vivo de los tickets RUM-001…RUM-010b definidos en
> [performance-ux-backlog.md](./performance-ux-backlog.md). **Cada sesión que
> trabaje un ticket debe actualizar este archivo antes de cerrar**, según §4.5
> del backlog.
>
> Este archivo registra *qué pasó*. El backlog registra *qué hay que hacer*. No
> dupliques criterios de aceptación aquí; enlaza al ticket.
>
> **Creado 2026-09-21.** Ningún ticket implementado todavía.

---

## 1. Tablero

Estados posibles: `Pendiente` · `En curso` · `Bloqueado` · `Hecho` · `Descartado`.

| Ticket | Prioridad | Estado | Rama | PR | Cerrado |
|---|---|---|---|---|---|
| RUM-010a — Stack de tests | P0 | Pendiente | — | — | — |
| RUM-001 — Instrumentación y baseline | P0 | Pendiente | — | — | — |
| RUM-002 — Reconciliar net worth | P0 | Pendiente | — | — | — |
| RUM-005 — Carga del Dashboard | P0 | Pendiente | — | — | — |
| RUM-003 — Periodos, FX y decimales | P0 | Pendiente | — | — | — |
| RUM-006 — Balances repetidos | P1 | Pendiente | — | — | — |
| RUM-007 — Cache, prefetch y loading | P1 | Pendiente | — | — | — |
| RUM-004 — Consultas de Transactions | P2 | Pendiente | — | — | — |
| RUM-008 — IA del Dashboard | P2 | Pendiente | — | — | — |
| RUM-009 — Month health e Insights | P2 | Pendiente | — | — | — |
| RUM-010b — Suite de regresión y gate | P0 transversal | Pendiente | — | — | — |

---

## 2. Bloqueos abiertos

| # | Bloqueo | Afecta a | Desbloquea |
|---|---|---|---|
| B-1 | No hay runner de tests de JS/TS en el repositorio | RUM-002…RUM-009 y RUM-010b: todos prometen cobertura y hoy no hay dónde escribirla | RUM-010a |
| B-2 | No hay baseline de performance atribuido por etapa | RUM-004, RUM-005, RUM-006 y las decisiones grandes de RUM-007 | RUM-001 |
| B-3 | No hay contrato autoritativo de valoración | RUM-003, RUM-005, RUM-006, RUM-008, RUM-009 | RUM-002 |
| B-4 | El invariante de net worth no está decidido. El código hace `Total assets + Signed liabilities`; la cifra de Liabilities mostrada es `max(0, -balance)`. Es una decisión de producto, no un bug de cálculo | RUM-002, RUM-010b | Decisión del usuario dentro de RUM-002 |

---

## 3. Métricas

### 3.1 Baseline

Solo hay estimaciones visuales de video (§3.1 del backlog). **No hay baseline
instrumentado todavía** — eso es RUM-001. No uses estos números como before/after
de un ticket; sirven únicamente para saber si vamos en la dirección correcta.

| Flujo | Video 2026-09-21 | Instrumentado | Después | Objetivo |
|---|---:|---:|---:|---:|
| Dashboard → Transactions (frío) | 4.25 s | — | — | p75 ≤ 1.5 s |
| Transactions → Dashboard | 3.25 s | — | — | p75 ≤ 1.5 s |
| Transactions → Dashboard (2ª visita) | 3.00 s | — | — | p75 ≤ 1.0 s |
| Dashboard → Accounts | 1.50 s | — | — | p75 ≤ 1.2 s |
| Accounts → Transactions | 1.75 s | — | — | p75 ≤ 1.5 s |
| Cambio de mes | 0.25–0.50 s | — | — | p75 ≤ 0.5 s |

### 3.2 Round-trips por carga

Conteo estático del barrido de código del 2026-09-21, no medido en ejecución.

| Pantalla | Round-trips | De ellos secuenciales | Después |
|---|---:|---:|---:|
| Dashboard | ~16 | 8 (`page.tsx:276-310`) | — |
| Net worth | 7× `get_account_balances` | 0 (en `Promise.all`) | — |
| Transactions | 1 RPC + 1 ronda de lookups | — | — |

---

## 4. Registro por ticket

> Plantilla para cada entrada. Añade la tuya arriba del todo al cerrar un
> ticket, con el formato de §4.5 del backlog.

```markdown
### RUM-00X — <título> · <YYYY-MM-DD> · rama `<rama>` · PR #<n>

**Causa raíz confirmada:** <qué resultó ser, frente a lo que decía el backlog>

**Archivos modificados:** `ruta:línea` por cada uno.

**Antes / después:** <comportamiento observable>

**Métricas:** <antes → después, con el método de medición>

**Comandos ejecutados:** `npm run lint` · `npx tsc --noEmit` · `npm run build` · <tests>

**Migraciones o pasos pendientes:** <o "ninguno">

**Riesgos residuales:** <lista>

**Checklist manual de revisión:** <pasos que una persona debe probar a mano>

**¿Lista para PR?:** sí / no, y por qué.

**Correcciones al backlog:** <qué hipótesis de §3.4 resultó falsa y ya actualicé>
```

---

## 5. Historial

| Fecha | Cambio |
|---|---|
| 2026-09-21 | Documento creado junto al backlog. Ningún ticket iniciado. |
| 2026-09-21 | Revisión de Codex en PR #67. **Causa raíz de la discrepancia de net worth encontrada antes de empezar RUM-002**: un pasivo con saldo a favor suma al net worth y muestra `0` en Liabilities; cuadra al centavo en los tres meses. Corregidas cuatro afirmaciones del backlog (invariante, política de FX de saldos, cuatro round trips en Transactions, alcance del mes personalizado). Nuevo bloqueo B-4. |
