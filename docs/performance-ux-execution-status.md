# Rumbo — Estado de ejecución del backlog RUM

> Documentation only. Estado vivo de los tickets RUM-001…RUM-010b definidos en
> [performance-ux-backlog.md](./performance-ux-backlog.md). **Cada sesión que
> trabaje un ticket debe actualizar este archivo antes de cerrar**, según §4.5
> del backlog.
>
> Este archivo registra *qué pasó*. El backlog registra *qué hay que hacer*. No
> dupliques criterios de aceptación aquí; enlaza al ticket.
>
> **Creado 2026-09-21.** Último ticket cerrado: **RUM-010a** (stack de tests).
> **RUM-001** entregó instrumentación; sus números siguen pendientes (B-5).

---

## 1. Tablero

Estados posibles: `Pendiente` · `En curso` · `Bloqueado` · `Hecho` · `Descartado`.

| Ticket | Prioridad | Estado | Rama | PR | Cerrado |
|---|---|---|---|---|---|
| RUM-010a — Stack de tests | P0 | **Hecho** | `claude/backlog-rum-10a-tmlee1` | [#68](https://github.com/andresze020/rumbo/pull/68) | 2026-09-21 |
| RUM-001 — Instrumentación y baseline | P0 | **Bloqueado** (instrumentación hecha) | `claude/backlog-rum-10a-tmlee1` | — | — |
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
| B-2 | No hay baseline de performance atribuido por etapa | RUM-004, RUM-005, RUM-006 y las decisiones grandes de RUM-007 | RUM-001 |
| B-3 | No hay contrato autoritativo de valoración | RUM-003, RUM-005, RUM-006, RUM-008, RUM-009 | RUM-002 |
| B-5 | La instrumentación de RUM-001 existe pero nadie la ha corrido: hace falta un entorno con credenciales de app (`NEXT_PUBLIC_SUPABASE_*`) para la capa B, y permiso de lectura contra producción para la capa C. Sin eso, RUM-004…007 siguen sin métrica before/after | RUM-004, RUM-005, RUM-006, RUM-007 | Que el usuario corra `RUMBO_PERF=1 npm run dev` y `npm run perf:baseline` y pegue la salida |
| B-4 | El invariante de net worth no está decidido. El código hace `Total assets + Signed liabilities`; la cifra de Liabilities mostrada es `max(0, -balance)`. Es una decisión de producto, no un bug de cálculo | RUM-002, RUM-010b | Decisión del usuario dentro de RUM-002 |

### 2.1 Bloqueos cerrados

| # | Bloqueo | Cerrado por | Fecha |
|---|---|---|---|
| B-1 | No había runner de tests de JS/TS en el repositorio | RUM-010a — Vitest, `npm test`, en CI ([`testing.md`](./testing.md)) | 2026-09-21 |

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

**Actualizado por RUM-001 (2026-09-21)** con `npm run perf:census`, que cuenta
la ruta *y* el layout. Los números anteriores miraban una ventana de líneas y se
quedaban cortos.

| Pantalla | Round-trips | De ellos secuenciales | Después |
|---|---:|---:|---:|
| Layout (lo paga toda navegación) | 6 | 4 | — |
| Dashboard (ruta) | 18 | 11 (`page.tsx:254-305`) | — |
| Dashboard (ruta + layout) | **~24** | **15** | — |
| Net worth | 5 en código → **7× `get_account_balances` en ejecución** | 5 | — |
| Transactions | 12 | 5 | — |
| Accounts | 11 | 5 | — |

`auth.getUser()` se llama **4 veces por navegación** (`layout.tsx:30`,
`households/server.ts:27`, `preferences/server.ts:19`, `page.tsx:254`) y
`profiles` se lee **2 veces** (`households/server.ts:32`,
`preferences/server.ts:23`). Detalle y método en
[`performance-baseline.md`](./performance-baseline.md).

---

## 4. Registro por ticket

> Plantilla para cada entrada. Añade la tuya arriba del todo al cerrar un
> ticket, con el formato de §4.5 del backlog.

### RUM-001 — Instrumentar baseline · 2026-09-21 · rama `claude/backlog-rum-10a-tmlee1` · PR pendiente

**Estado: parcial y honesto.** La instrumentación está entregada; los números no.

**Causa raíz confirmada:** ninguna hipótesis de §3.4 se refutó, pero **dos
conteos se quedaron cortos** por haberse leído sobre una ventana de líneas en
vez de la ruta entera:
- §3.4 #7 decía 8 `await` secuenciales en el Dashboard (`:276-310`). Son **11**
  (líneas 254, 257, 264, 276, 280, 284, 288, 293, 297, 301, 305): faltaba el
  preámbulo `auth.getUser()` → `profiles` → `households`.
- §3.2 decía ~16 round-trips. Son **~24**, porque el layout y sus helpers gastan
  6 en toda navegación y nadie los estaba contando.

**Hallazgos nuevos, no previstos por el backlog:**
- `auth.getUser()` se llama **4 veces por navegación**. Cada helper hace su
  propio `createClient()`, y `getUser()` siempre revalida contra el servidor de
  Auth — no lee la cookie. Cuatro round-trips para la misma pregunta.
- `profiles` se lee **dos veces** en el mismo `Promise.all` del layout. Van en
  paralelo, así que no cuesta latencia; cuesta una query y esconde el
  desperdicio.
- El censo estático **no puede ver bucles**: `net-worth` muestra
  `get_account_balances ×2` en código y hace **7** en ejecución
  (`getPreviousMonths(selectedMonth, 6)` en `:266`). Esa es precisamente la
  brecha que cubre la instrumentación en runtime.

**Archivos modificados:**
- `src/lib/perf/label.ts` — nuevo. URL → etiqueta segura, con allowlist.
- `src/lib/perf/stats.ts` — nuevo. Percentiles, `serialRatio`, rollup, repetidos.
- `src/lib/perf/collector.ts` — nuevo. `fetch` instrumentado + colector por petición.
- `src/lib/perf/{label,stats,collector}.test.ts` — nuevos. 33 tests.
- `src/lib/supabase/server.ts` — 3 líneas: extiende el cliente cuando el switch está on.
- `src/app/dashboard/layout.tsx` — 1 línea: registra el volcado en `after()`.
- `scripts/perf-census.mjs` — nuevo. Capa A, sin credenciales.
- `scripts/perf-baseline.mjs` — nuevo. Capa C, solo lectura por construcción.
- `package.json` — `perf:census`, `perf:baseline`.
- `docs/performance-baseline.md` — nuevo. El informe, el método y las tablas.

**Antes / después:** antes no había forma de saber en qué se iban los 4,25 s.
Después: `npm run perf:census` da la forma sin credenciales, y `RUMBO_PERF=1`
da un JSON por petición con duración, filas, bytes, repetidos y `serialRatio`.

**Métricas:** capa A medida (arriba). Capas B y C **sin medir** — ver B-5.

**Comandos ejecutados:** `npm run lint` · `npx tsc --noEmit` · `npm test` (44) ·
`npm run i18n:check` · `npm run build` · `npm run perf:census`

**Migraciones o pasos pendientes:** ninguna. Sin esquema, RLS, ledger ni caching.

**Riesgos residuales:**
- El instrumento añade un wrapper de `fetch` **solo** con `RUMBO_PERF=1`; sin la
  variable, `perfClientOptions()` devuelve `{}` y el cliente es el de siempre.
  Hay un test que lo fija.
- Fuera de un render, `cache()` de React no memoiza y el colector cae a uno
  compartido por proceso: bajo carga concurrente mezclaría peticiones. Es la
  razón de que el switch sea opt-in. Documentado en §7 del informe.
- `logPerfSnapshot` resuelve el nombre de ruta a partir de cabeceras que Next no
  promete; puede salir `(unknown route)`. Por eso el método mide una ruta a la vez.
- El arnés de la capa C corre contra **producción** (no hay staging). Es solo
  lectura por construcción y las funciones que ejecuta son las que la app llama
  en cada carga, pero conviene correrlo fuera de hora punta.
- No se mide el tamaño de payload si falta `content-length`: clonar la respuesta
  consumiría el stream que el llamante va a parsear. Se reporta `null`, no 0.

**Checklist manual de revisión:**
1. `npm run dev` sin `RUMBO_PERF` → ninguna línea `[rumbo-perf]` en el log.
2. `RUMBO_PERF=1 npm run dev`, abrir `/dashboard` → una línea `[rumbo-perf]` con
   `queries` ≈ 24 y `serialRatio` alto.
3. Comprobar que ninguna línea del log contiene una descripción, un email o un
   nombre de payee.
4. `npm run perf:census` → la tabla de §2 del informe.
5. Con credenciales: `npm run perf:baseline -- --household=<uuid> --user=<uuid>`.

**¿Lista para PR?:** sí para la instrumentación. El ticket **no se cierra**
hasta que las tablas de §4 y §5 tengan números.

**Correcciones al backlog:** §3.4 #7 (8 → 11 secuenciales, ~16 → ~24
round-trips) y §3.2 de este documento. Nada se refutó.

---

### RUM-010a — Elegir e instalar el stack de tests · 2026-09-21 · rama `claude/backlog-rum-10a-tmlee1` · PR #68

**Causa raíz confirmada:** exactamente la que decía §3.4 #16 — el repositorio no
tenía runner de JS/TS. Ninguna sorpresa contra el código. Sí apareció un
obstáculo no previsto: `@types/node` estaba fijado en `^20` y Vitest 5 pide
`^22 || >=24`. Se subió a `^22`, que además es lo que ya corren CI
(`node-version: 22`) y el entorno local; el `^20` era el valor obsoleto.

**Archivos modificados:**
- `package.json` — scripts `test` (`vitest run`) y `test:watch` (`vitest`);
  `vitest` en devDependencies; `@types/node` `^20` → `^22`.
- `vitest.config.mts` — nuevo. Alias `@/…` → `src/…`, entorno `node`, sin
  globals, `supabase/**` excluido. Extensión `.mts` y no `.ts` porque el cargador
  nativo de Vite avisa al leer ESM en un paquete CommonJS.
- `src/lib/health/score.test.ts` — nuevo. 11 tests semilla.
- `tests/fixtures/README.md` — nuevo. Convención de fixtures, vacío a propósito.
- `docs/testing.md` — nuevo. Decisión de stack, alternativas descartadas,
  convenciones, qué cubre cada suite.
- `.github/workflows/ci.yml` — paso `Unit tests` tras el de i18n y antes del
  build; nombre del job actualizado. De paso, la referencia a la skill
  `app-finanzas-verify` (nombre viejo) pasó a `rumbo-verify`.
- `.claude/skills/rumbo-verify/SKILL.md` — `npm test` en el gate, lista real de
  scripts (decía "solo dev, build, start, lint"), y la distinción entre
  `npm test` y `npm run db:test`.
- `AGENTS.md` — `npm test` en el gate + sección `## Tests` con las convenciones.
- `docs/performance-ux-backlog.md` — §3.4 #16 marcada como resuelta, §5 sin la
  excusa de "RUM-010a aún no ha aterrizado el runner", §6.1 y §7 con el estado.
- `docs/features/financial-correctness-checks.md` — el follow-up de BR-006
  ("a future BR should add a real automated runner") queda cerrado.

**Antes / después:** antes, `npm test` no existía y cualquier ticket que dijera
"añade tests" era incumplible. Después, `npm test` corre 11 tests en ~200 ms sin
base de datos, sin credenciales y sin navegador, en local y en CI.

**Métricas:** no aplica — ticket de tooling, sin impacto en performance de la
app. Coste del nuevo paso del gate: ~0,2 s en local, ~2 s en CI.

**Comandos ejecutados:** `npm run lint` · `npx tsc --noEmit` · `npm test` ·
`npm run i18n:check` · `npm run build`

**Migraciones o pasos pendientes:** ninguno. Cero cambios de esquema, RLS,
ledger, FX o caching. Los 5 archivos SQL de `supabase/tests/` no se tocaron.

**Verificación de que los tests fallan de verdad:** se rompió `score.ts` a
propósito cinco veces y la suite se puso roja cada vez — pesos 0,65/0,35 → 0,6/0,4
(1 fallo), savings neutral 50 → 0 (2), banda de presupuesto 150% → 200% (2),
frontera de grado `>= 90` → `> 90` (1), y ancla de savings −20% → −10% (3). El
archivo quedó restaurado (`git diff` vacío sobre `score.ts`).

**Riesgos residuales:**
- `@types/node` `^20` → `^22` es el único cambio que puede afectar a código
  existente. `npx tsc --noEmit` y `npm run build` pasan limpios, así que el
  riesgo es bajo, pero es un salto de dos majors en los tipos de Node.
- El `npm install` reportó 14 vulnerabilidades (`npm audit`). No se auditaron:
  son del árbol previo al ticket y arreglarlas sería otro cambio.
- La suite semilla cubre un único módulo. No hay cobertura de `fx.ts`,
  `periods/`, `calc.ts` ni de las reducciones de saldo de §3.4 #1 — eso llega
  con los tickets que las tocan.
- Nada cubre componentes de React: no se instaló jsdom ni Testing Library.
  Añadir un segundo proyecto de Vitest es un cambio de config, no una migración.

**Hallazgo lateral (para RUM-003):** `savingsComponent(0.1)` devuelve
`75.00000000000001`. El test lo documenta con `toBeCloseTo` en vez de esconderlo.
Es aritmética de `number` nativo, coherente con §3.4 #10.

**Checklist manual de revisión:**
1. `npm ci` en limpio y `npm test` → 11 pasando, sin pedir credenciales.
2. Romper a mano un peso en `src/lib/health/score.ts` → `npm test` en rojo.
   Revertir.
3. `npm run test:watch` arranca y reacciona al guardar el test.
4. Abrir el Dashboard y Month review: el score y el grado se ven igual que antes
   (no se tocó `score.ts`).

**¿Lista para PR?:** sí. Gate completo en verde.

**Correcciones al backlog:** §3.4 #16 pasa de "falso — bloqueante" a resuelta,
con la evidencia original conservada. §5 pierde la cláusula de escape de tests.
B-1 se cierra. Ninguna otra hipótesis de §3.4 se tocó: este ticket no leyó el
código de saldos ni del dashboard.

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
| 2026-09-21 | **RUM-001: instrumentación entregada, medición pendiente.** Nuevo módulo `src/lib/perf/` (switch `RUMBO_PERF=1`), `npm run perf:census` (capa A, sin credenciales) y `npm run perf:baseline` (capa C, solo lectura). Informe en `docs/performance-baseline.md`. Corregidos dos conteos de §3.4 #7 y §3.2. Hallazgos nuevos: `auth.getUser()` ×4 y `profiles` ×2 por navegación. Nuevo bloqueo B-5. |
| 2026-09-21 | Documento creado junto al backlog. Ningún ticket iniciado. |
| 2026-09-21 | **RUM-010a cerrado.** Vitest instalado (`npm test`, 11 tests semilla sobre `src/lib/health/score.ts`), integrado en el gate de `rumbo-verify`, `AGENTS.md` y CI. Convenciones en `docs/testing.md`. Bloqueo B-1 cerrado. `@types/node` subió de `^20` a `^22` (requisito de Vitest 5, y lo que ya corría CI). |
| 2026-09-21 | Revisión de Codex en PR #67. **Causa raíz de la discrepancia de net worth encontrada antes de empezar RUM-002**: un pasivo con saldo a favor suma al net worth y muestra `0` en Liabilities; cuadra al centavo en los tres meses. Corregidas cuatro afirmaciones del backlog (invariante, política de FX de saldos, cuatro round trips en Transactions, alcance del mes personalizado). Nuevo bloqueo B-4. |
