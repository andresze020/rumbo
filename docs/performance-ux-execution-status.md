# Rumbo — Estado de ejecución del backlog RUM

> Documentation only. Estado vivo de los tickets RUM-001…RUM-010b definidos en
> [performance-ux-backlog.md](./performance-ux-backlog.md). **Cada sesión que
> trabaje un ticket debe actualizar este archivo antes de cerrar**, según §4.5
> del backlog.
>
> Este archivo registra *qué pasó*. El backlog registra *qué hay que hacer*. No
> dupliques criterios de aceptación aquí; enlaza al ticket.
>
> **Creado 2026-09-21.** Último trabajo: **RUM-005** (orquestación del
> Dashboard, parcial — ver abajo), sobre la base de **RUM-006** (balances
> multi-fecha, cerrado). **RUM-001** midió contra producción que
> `get_account_balances` era el **71 % de toda la base de datos** y escalaba
> con el historial del household; RUM-006 corta las 7+2 llamadas redundantes
> de Net worth y Dashboard a una sola llamada cada una. Accounts se intentó
> llevar a 1 llamada también, pero review de Codex encontró que eso excluía
> silenciosamente transacciones con fecha futura del saldo de "hoy" — se
> revirtió a sus 2 llamadas originales; ver "Corrección post-review" en la
> entrada de RUM-006. RUM-005 unió los 13 `await` independientes de
> `dashboard/page.tsx` en un solo `Promise.all` y encontró el mismo patrón
> N+1 de RUM-006 escondido en `trend-actions.ts` (6 llamadas de balance por
> mes → 1). **RUM-005 sigue abierto**: streaming con `Suspense` y cache no
> se hicieron.

---

## 1. Tablero

Estados posibles: `Pendiente` · `En curso` · `Bloqueado` · `Hecho` · `Descartado`.

| Ticket | Prioridad | Estado | Rama | PR | Cerrado |
|---|---|---|---|---|---|
| RUM-010a — Stack de tests | P0 | **Hecho** | `claude/backlog-rum-10a-tmlee1` | [#68](https://github.com/andresze020/rumbo/pull/68) | 2026-09-21 |
| RUM-001 — Instrumentación y baseline | P0 | **Hecho** (capa B pendiente) | `claude/backlog-rum-10a-tmlee1` | [#69](https://github.com/andresze020/rumbo/pull/69) | 2026-09-21 |
| RUM-002 — Reconciliar net worth | P0 | Pendiente | — | — | — |
| RUM-005 — Carga del Dashboard | P0 | **🟡 Orquestación hecha** (streaming/cache pendientes) | `claude/rum-005-dashboard-load` | — | — |
| RUM-003 — Periodos, FX y decimales | P0 | Pendiente | — | — | — |
| RUM-006 — Balances repetidos | P1 | **Hecho** (contrato de RUM-002 pendiente) | `claude/backlog-rum-10a-tmlee1` | — | 2026-09-21 |
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
| B-5 | Falta la capa B del baseline (timings de servidor): necesita la app corriendo con `NEXT_PUBLIC_SUPABASE_*`. Las capas A y C ya están medidas, así que esto ya no bloquea a RUM-005/006 — solo impide separar red+PostgREST del render | RUM-007 (decisiones de cache) | Que el usuario corra `RUMBO_PERF=1 npm run dev`, navegue y pegue las líneas `[rumbo-perf]` |
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
| Dashboard (ruta) | 18 (bajó a 17 cuando RUM-006 fusionó 2 llamadas de balance en 1) | 11 (bajó a 10 por la misma razón) | **RUM-005 (2026-09-21): 17 / 3** — `npm run perf:census --path=dashboard/page.tsx`, medido antes y después contra este mismo archivo. El total **no baja**: `Promise.all` cambia el orden de los requests, no la cantidad — sigue siendo el mismo número de round-trips. Lo que baja de verdad es cuántos son bloqueantes: de 10 a 3 (la cadena de identidad `auth.getUser()` → `profiles` → `households`, la única que encadena de verdad). Ver entrada RUM-005 en §4 — corregido tras un hallazgo P2 de Codex en PR #71 (una versión anterior de esta fila decía "~9" confundiendo "etapas secuenciales" con "round-trips totales") |
| Dashboard (ruta + layout) | 24 → 23 | 15 → 14 | **23 / 7** tras RUM-005 — mismo motivo que arriba, más el layout (6 round-trips, 4 secuenciales, sin tocar) |
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

### RUM-005 — Descomponer y optimizar carga del Dashboard (orquestación) · 2026-09-21 · rama `claude/rum-005-dashboard-load` · PR pendiente

**Estado: orquestación hecha — solo esa parte.** RUM-005 formalmente depende de
RUM-002 (contrato de valoración, B-3/B-4 abiertos), pero esa dependencia solo
aplica a la parte del ticket que unifica el cálculo de net worth en un servicio
en `src/lib/`. Esta entrada **no toca esa parte**: cubre únicamente paralelizar
los awaits independientes y cerrar un N+1 de balances escondido, sin tocar
ninguna fórmula financiera. Streaming con `Suspense`, granularidad de cache e
invalidación selectiva por mutación — el resto del alcance de RUM-005 — quedan
sin hacer, documentados como pendientes abajo, no como bloqueados por RUM-002.

**Causa raíz confirmada (§3.4 #7 del backlog, re-verificada contra el archivo
actual, no contra la descripción vieja):** `src/app/dashboard/page.tsx` es un
único Server Component sin `Suspense`. Antes de este cambio tenía 7 `await`
estrictamente secuenciales (`get_account_balances_as_of_many`,
`get_monthly_dashboard_summary` ×2, `get_monthly_expenses_by_category`,
`categories`, `get_monthly_budget_details`, un `count` de transactions),
seguidos de un `Promise.all` de 5 más (recurring, debts, recent transactions,
goals, review queue), seguidos de `getDashboardTrend('net-worth', ...)` **al
final de todo, después de que todo lo demás ya había terminado** — pese a no
depender de nada calculado entre medias, solo de `selectedMonth`, conocido
desde el principio de la función. Ninguna de estas 13 lecturas depende del
resultado de otra: comparten household y fechas ya calculadas, nada más.

**El fix: un solo `Promise.all` de 13.** Las 13 lecturas independientes se
unieron en un único `Promise.all`. Lo que sí depende de verdad se queda
secuencial, con el motivo comentado en el código:
- `recentEntries`/`recentAllocations` — necesitan los IDs de `recentTxRows`,
  que solo existen tras resolver el batch.
- `homeChecklist` — necesita `balances`, `nonOpeningTransactionCount` y
  `hasBudget`, todos derivados del batch.
- La cadena de identidad al principio (`auth.getUser()` → `profiles` →
  `households`) es secuencial por necesidad real: cada paso necesita el id que
  devuelve el anterior. No se tocó — no es el hallazgo de este ticket.

**Importante, para no confundir "round-trips" con "etapas bloqueantes":** este
`Promise.all` **no reduce el número de requests** que `page.tsx` hace —
`npm run perf:census --path=dashboard/page.tsx` mide **17 antes y 17
después**, sin cambio. Lo que cambia es que 7 de esos 17 dejan de esperarse
uno a uno y se disparan junto con los otros 10, así que el total de **etapas
bloqueantes** baja de 10 a 3. Menos tiempo de espera, no menos tráfico. La
única reducción real de *cantidad* de llamadas está en el segundo hallazgo de
abajo (`trend-actions.ts`), que este censo estático no ve porque solo escanea
archivos `page.tsx`, no los helpers que importan.

**Segundo hallazgo, no listado en el conteo original: un N+1 de balances
escondido dentro de `trend-actions.ts`.** `getDashboardTrend()` para métricas
de tipo balance (`net-worth`, `total-assets`, `total-liabilities`,
`projected-net-worth`) hacía **una llamada a `get_account_balances` por cada
mes solicitado** — 6 llamadas independientes vía `Promise.all` para los 6
meses de evolución del Dashboard, cada una reagregando el ledger completo
(RUM-001: `get_account_balances(household, as_of_date)` no tiene cota
inferior de fecha, cuesta igual sin importar qué tan angosta sea la fecha).
Es **exactamente** el patrón que RUM-006 corrigió en Net worth, Dashboard y
Accounts — y que la propia entrada de cierre de RUM-006 en este documento
había marcado como "encontrado pero no tocado, oportunidad explícita, no
parte de ese cierre" para no ampliar el diff de un ticket que ya tocaba tres
pantallas. Corregido aquí: `trend-actions.ts` ahora llama
`get_account_balances_as_of_many` una sola vez con las 6 fechas de fin de mes,
agrupa con el mismo `groupByAsOfDate()` que ya usan Net worth, Dashboard y
Accounts (`src/lib/balances/multi-date.ts`), y el resto del cálculo
(assets/liabilities por cuenta, filtrado por `include_in_net_worth`) queda
igual. Esto beneficia también a `/dashboard/trends`, que llama a la misma
función — sin tocar esa pantalla.

**Estimación de impacto, no medición fresca contra producción.** No tengo el
UUID del household de prueba en este contexto (deliberadamente nunca se
commitea al repo — ver `docs/performance-baseline.md`), así que no repetí el
`EXPLAIN (ANALYZE, BUFFERS)` que RUM-001/RUM-006 sí corrieron. Extrapolando de
esos números medidos, sobre el mismo household y la misma función: 6 llamadas
independientes a `get_account_balances` (~192 ms / 36.778 buffers cada una,
medido en RUM-001) frente a 1 llamada a `get_account_balances_as_of_many` para
6 fechas (~207-247 ms total, medido en RUM-006 para 7 fechas sobre el mismo
household) — el mismo salto de "N veces el costo de una agregación completa"
a "una vez", ya verificado con `EXPLAIN ANALYZE` real para este mecanismo. Si
el usuario quiere el número fresco, `node scripts/perf-baseline.mjs
--household=<uuid> --user=<uuid> --explain` lo da directamente.

**Verificación de corrección — no se tocó ninguna fórmula:** el cálculo de
`assets`/`signedLiabilities`/`projectedAssets`/`signedProjectedLiabilities`
en `trend-actions.ts` es el mismo código, solo cambia de dónde saca las filas
(`balancesByDate.get(monthEndDate)` en vez de `result.data` de una llamada
propia). El filtro `include_in_net_worth && !is_archived` se conserva
literal. `groupByAsOfDate` ya tiene sus propios tests
(`src/lib/balances/multi-date.test.ts`) y `get_account_balances_as_of_many`
ya tiene los suyos contra producción
(`supabase/tests/rum_006_multi_date_balances_invariants.sql`, 5/5). No se
escribieron tests nuevos para este ticket: la lógica que cambió es la misma
lógica ya cubierta por esos dos, solo reconectada a una fuente de datos
distinta — no hay cómputo nuevo que probar de forma aislada.

**Archivos modificados:**
- `src/app/dashboard/page.tsx` — las 7 lecturas secuenciales + las 5 en
  paralelo + `netWorthTrend` (antes al final) se unieron en un `Promise.all`
  de 13. Ningún cálculo cambia; solo el orden y agrupamiento de los `await`.
- `src/app/dashboard/trend-actions.ts` — la rama de métricas de tipo balance
  de `getDashboardTrend()` pasa de N llamadas a `get_account_balances` a 1
  llamada a `get_account_balances_as_of_many` con las N fechas.

**Lo que este ticket NO hace, a propósito — alcance restante de RUM-005:**
- **Streaming con `Suspense`** para los módulos por debajo del fold (Budget,
  Insights, Debts, Goals, Recent activity) — el criterio de aceptación
  "el top-of-fold no espera a Budget/Insights/Debts/Goals/Recent activity"
  sigue sin cumplirse: la función sigue siendo un único Server Component, así
  que aunque ya casi todo se resuelve en un solo `Promise.all`, la respuesta
  completa sigue esperando a que termine el batch entero antes de renderizar
  cualquier cosa. Paralelizar no es lo mismo que hacer streaming.
- **Granularidad de cache e invalidación selectiva por mutación** — no
  implementado. Este ticket no introdujo ningún cache nuevo.
- **El contrato de valoración autoritativo de RUM-002** — `trend-actions.ts`
  sigue con su propio cálculo inline de assets/liabilities, igual que
  Dashboard, Net worth y Accounts cada uno con el suyo (B-3, sin resolver).
- **`auth.getUser()` ×4 y `profiles` ×2 por navegación** (RUM-001, §3.2) — no
  tocado; `getDashboardTrend()` sigue haciendo su propia resolución de
  usuario/household en vez de recibir el `householdId` ya resuelto por
  `DashboardPage`. Es la misma duplicación que ya existía, no una nueva.
- El resto de sitios con `get_account_balances` de una sola fecha (`plan`,
  `debts`, `debt-planner`, `export/download`, la herramienta de IA) — sin
  tocar, igual que en el cierre de RUM-006.

**Comandos ejecutados:** `npm run lint` · `npx tsc --noEmit` · `npm test` (52,
sin cambio — no se añadieron tests nuevos, ver arriba) · `npm run i18n:check` ·
`npm run build`

**Migraciones o pasos pendientes:** ninguno. No hay migración: reutiliza
`get_account_balances_as_of_many`, ya aplicado y verificado por RUM-006.

**Riesgos residuales:**
- El punto de entrada a `trend-actions.ts` desde `/dashboard/trends/page.tsx`
  (línea 64, `range` variable en vez de fijo en 6) también se beneficia de
  este fix automáticamente — no se probó manualmente esa pantalla en esta
  sesión, solo se verificó que compila y tipa.
- Ningún dato nuevo se expone: `p_include_archived` se deja en su default
  (`false`), igual que el filtro `!is_archived` que ya existía en JS.
- La estimación de impacto de arriba no es una medición fresca — ver nota.

**Checklist manual de revisión:**
1. Abrir `/dashboard`, cambiar de mes varias veces → totales, gráfico de
   evolución de net worth (sparkline), Insights, Budget, Debts, Goals y
   Recent activity se ven idénticos a antes del cambio.
2. Abrir `/dashboard/trends`, cambiar el rango → la serie de net worth se ve
   idéntica.
3. `RUMBO_PERF=1 npm run dev`, abrir `/dashboard` → debería verse un solo
   `Promise.all` resolviendo todas las llamadas de balances/summary/budget en
   paralelo en vez de una tras otra en el log `[rumbo-perf]`.

**¿Lista para PR?:** sí, para el alcance que cubre (orquestación). El ticket
completo (Suspense/streaming/cache) sigue abierto — no cerrar RUM-005 en el
tablero como "Hecho" hasta que esa parte también se entregue.

**Correcciones al backlog:** tabla de round-trips de §3.2 actualizada con la
columna "Después" para Dashboard. Fila de RUM-005 en el tablero pasa a
"🟡 Orquestación hecha (streaming/cache pendientes)", no a "Hecho".

---

### RUM-006 — Balances multi-fecha (Accounts y Net worth) · 2026-09-21 · rama `claude/backlog-rum-10a-tmlee1` · PR pendiente

**Estado: performance hecha, migración aplicada y verificada contra producción
con `npm run db:test`; el contrato de RUM-002 sigue pendiente.**
RUM-006 depende formalmente de RUM-002 (bloqueado por B-4, una decisión de
producto pendiente). Este ticket **no toca el invariante de net worth**: la
fórmula (`totalAssets + signedLiabilities`, con `Liabilities` mostradas como
`max(0, -balance)`) queda exactamente igual, en los mismos tres sitios. Solo
cambia CUÁNTAS VECES y a qué costo se piden los saldos. El criterio de
aceptación "reconcilia con el contrato de RUM-002" queda abierto hasta que
RUM-002 exista — no hay contrato todavía con el que reconciliar.

**Causa raíz confirmada (medida contra producción, no solo leída en código):**
`get_account_balances(household, as_of_date)` no tiene cota inferior de
fecha — RUM-001 ya lo había medido — así que cada llamada reagrega el ledger
completo del household, sin importar la fecha. Net worth pedía 7 snapshots
(mes elegido + 6 de evolución) con 7 llamadas independientes; Dashboard 2
(mes actual + anterior); Accounts 2 (hoy con archivadas + mes anterior sin
archivadas). Cada llamada pagaba el escaneo completo del ledger otra vez.

**La solución no es cachear ni paralelizar mejor: es agregar una vez.** La
nueva función `get_account_balances_as_of_many(household, dates[],
include_archived)` calcula un saldo acumulado por cuenta en **un solo pase**
ordenado por fecha (`sum(...) over (partition by account_id order by
transaction_date)`), y cada fecha solicitada es una lectura de esa misma
serie acumulada — no un escaneo nuevo. El costo ya no depende de cuántas
fechas se piden, depende del tamaño del ledger, una vez.

**Medido contra producción (household de 4.688 transacciones, RLS aplicada,
`EXPLAIN (ANALYZE, BUFFERS)`, promedio de varias corridas):**

| Sitio | Antes (N llamadas independientes) | Después (1 llamada) |
|---|---|---|
| Net worth (7 fechas) | ~1.344 ms / ~257.446 buffers (7 × 192 ms / 36.778) | **207-247 ms / ~34.800 buffers** |
| Dashboard (2 fechas) | ~384 ms / ~73.556 buffers | **207-211 ms / 34.812 buffers** |
| Accounts (2 fechas, con archivadas) | ~384-400 ms / ~73.000 buffers | ~~203,5 ms / 35.593 buffers~~ — **revertido, ver corrección post-review abajo** |

En Net worth y Dashboard, el costo de N llamadas se convirtió en,
aproximadamente, **el costo de una sola llamada de una fecha** — porque
efectivamente ahora es una sola agregación del ledger, sea cual sea N.
Accounts se revirtió a 2 llamadas independientes por un bug de corrección
encontrado en review — ver la sección "Corrección post-review" más abajo.

**Verificación de corrección, no solo de velocidad — cada fila comparada,
no solo el total:**
- **Contra el overload de 2 argumentos** (el que usan Net worth y Dashboard,
  excluye archivadas): 7 fechas y 2 fechas, cuenta por cuenta,
  `posted`/`pending`/`projected` en moneda de cuenta y en moneda base — **coincide
  exacto** con `get_account_balances(household, date)`, incluida la revaluación
  FX por fecha (verificado con una cuenta cuyo saldo en moneda de cuenta es 0
  pero cuyo histórico sin revaluar no lo es — la revaluación por fecha tenía que
  estar bien para que diera 0, y dio 0).
- **Contra el overload de 1 argumento** (el que usa Accounts para "hoy",
  incluye archivadas): coincide exacto en las 26 cuentas (22 activas + 4
  archivadas), `posted`/`projected` en ambas monedas.
- **Cuenta sin ningún movimiento jamás**: da 0 en todo, en ambos overloads y en
  el nuevo — no aparece como fila faltante.
- **Bug real encontrado y corregido durante el desarrollo, no en producción:**
  la primera versión de la query dejaba fuera una cuenta de una fecha si esa
  fecha era anterior a su primer movimiento — en vez de leer 0, la cuenta
  simplemente no aparecía en el resultado para esa fecha. En la evolución de
  Net worth eso se habría visto como "el household tenía menos cuentas hace
  unos meses", no como "el saldo era 0". Corregido con una fila explícita de
  saldo cero por cuenta, fechada en el epoch (`0001-01-01`), unida antes que
  los movimientos reales — así toda fecha solicitada, por temprana que sea,
  encuentra al menos esa fila. Verificado pidiendo una fecha anterior a
  cualquier actividad del household: las 22 cuentas activas responden 0, en vez
  de que solo aparezcan las cuentas realmente vacías.
- **Segundo bug real, este solo visible al aplicar la migración de verdad:**
  `account_id` es también el nombre de una columna del `returns table` de la
  función, así que dentro del cuerpo PL/pgSQL se convierte en variable en
  ámbito durante toda la función. Una referencia sin calificar a `account_id`
  en `running`, `matched`/`picked` y el subquery de `rates` es ambigua —
  `plpgsql.variable_conflict` viene en `error` por defecto, así que Postgres se
  niega a adivinar y lanza `column reference "account_id" is ambiguous`. Esto
  era **invisible validando la query como SQL suelto** (que fue toda la
  validación de la sección anterior): fuera de una función, no hay variable
  `account_id` con la que competir. Solo apareció al crear la función de
  verdad. Corregido calificando cada referencia con el alias de su CTE
  (`ed.account_id`, `r.account_id`, `m.account_id`, `p2.account_id`). Exactamente
  el riesgo que la sección de riesgos residuales de la versión anterior de esta
  entrada advertía y no podía descartar sin aplicar.

**Archivos modificados:**
- `supabase/migrations/20260921120000_multi_date_account_balances.sql` — nuevo.
  Aditiva: no toca `get_account_balances(uuid, date)` ni `get_account_balances(uuid)`,
  que siguen sirviendo a `plan`, `debts`, `debt-planner`, `export`,
  `trend-actions` y la herramienta del asistente de IA sin cambios.
- `src/lib/balances/multi-date.ts` — nuevo. `groupByAsOfDate()`, la única
  lógica de agrupar filas por fecha, compartida por los tres sitios en vez de
  triplicada.
- `src/lib/balances/multi-date.test.ts` — nuevo. 4 tests.
- `src/app/dashboard/net-worth/page.tsx` — 7 llamadas → 1. Un solo
  pass/fail para toda la carga en vez de 7 independientes (antes, un fallo
  transitorio en una de las 7 podía tumbar silenciosamente un punto de la
  evolución mientras el resto renderizaba bien).
- `src/app/dashboard/page.tsx` — 2 llamadas → 1.
- `src/app/dashboard/accounts/page.tsx` — **revertido a las 2 llamadas
  originales** (`get_account_balances(household)` sin cota de fecha para
  "hoy" + `get_account_balances(household, prevMonthEnd)` para "mes
  anterior") tras el hallazgo de Codex review — ver "Corrección post-review".
- `supabase/tests/rum_006_multi_date_balances_invariants.sql` — nuevo. 5
  checks: coincidencia exacta contra ambos overloads existentes (2 fechas y
  1 fecha), fecha-cero-para-todas-las-cuentas antes de cualquier actividad,
  `p_include_archived` añade exactamente las cuentas archivadas, y las
  cláusulas de guarda rechazan un array vacío o con `null`. **Las 5 pasan**
  contra producción tras aplicar la migración.
- `scripts/db-test.mjs` — nuevo flag `--user=<uuid>`. El runner conectaba
  siempre como `postgres`, que salta RLS de tabla por ser el owner pero no
  satisface el `auth.uid()` que una función `SECURITY DEFINER` comprueba por
  su cuenta — sin JWT, `auth.uid()` es null y la guarda de
  `is_household_member()` falla siempre, sin importar el rol. Con `--user` el
  runner antepone `set local role authenticated; set local request.jwt.claims
  = '...'` a cada statement. **Hallazgo lateral importante:** esto también
  desbloqueó `br_003_006_money_invariants.sql`, que llevaba **sin poder
  correr nunca** desde que se escribió (todos sus checks contra
  `get_account_balances` fallaban igual). Con el fix, 31 de 32 checks de toda
  la suite pasan — el único que falla (`BR-006 official balances match
  posted/pending entries only`) es una discrepancia real y preexistente, no
  causada por este ticket. Ver `docs/pending-work.md` §7 — no se investigó
  aquí, es un tema de RUM-002/exactitud financiera, no de performance.

**Antes / después:** antes, cargar Net worth costaba 7 agregaciones completas
del ledger; Dashboard y Accounts, 2 cada una. Después, Net worth y Dashboard
hacen exactamente 1 llamada a balances, al costo de una sola agregación — el
mismo costo que antes tenía pedir el saldo de un único día. Accounts se
quedó en 2 llamadas, igual que antes de este ticket (ver corrección abajo).

**Corrección post-review (2026-09-21, mismo día, mismo PR):** el review
automático de Codex sobre el PR marcó P1 que la llamada única de Accounts
rompía un caso real: `get_account_balances_as_of_many` siempre aplica
`transaction_date <= as_of_date`, así que al pedir el saldo de "hoy" con esa
función se excluían silenciosamente las transacciones con fecha futura —
algo que la app soporta explícitamente (`transaction-form.tsx` tiene texto
de UI para "sin tasa disponible para fechas futuras, usando la última tasa
de mercado"). El overload de 1 argumento que Accounts usaba antes de este
ticket no tiene ninguna cota de fecha — es intencional, no un descuido — y
por eso incluía esas transacciones futuras en el saldo de "hoy". Verificado
leyendo el cuerpo SQL del overload de 1 argumento
(`20260817120000_balance_fx_revaluation.sql`): no hay predicado de fecha en
ningún join ni where. **Corregido revirtiendo únicamente la llamada de
Accounts** a las dos llamadas originales — `get_account_balances(household)`
sin fecha para "hoy" (con archivadas) y `get_account_balances(household,
prevMonthEnd)` para "mes anterior" (sin archivadas) — exactamente el código
que existía antes de este ticket. Net worth y Dashboard no se tocan: ambos
solo usaron siempre el overload de 2 argumentos, ya acotado por fecha, así
que no tienen este bug y conservan la ganancia de 7→1 y 2→1 llamadas.
`src/lib/balances/multi-date.ts` (`groupByAsOfDate`) sigue en uso por Net
worth y Dashboard; Accounts ya no lo importa.

**Comandos ejecutados:** `npm run lint` · `npx tsc --noEmit` · `npm test` (52) ·
`npm run i18n:check` · `npm run build`

**Migraciones o pasos pendientes:** ninguno. La migración se aplicó el
2026-09-21 con autorización explícita del usuario
(`node scripts/db-push.mjs push --apply`; `npm run db:status` → 60/60,
0 pendientes). La primera versión aplicada falló por el bug de `account_id`
ambiguo (arriba); se corrigió el archivo de migración y se re-aplicó con
`create or replace function` (idempotente) antes de fusionar el PR, así que
lo que está en `main` y lo que corre en producción son el mismo texto —
verificado con un diff programático entre el archivo y lo último aplicado.
`npm run db:test -- --user=<uuid> --file=rum_006` → 5/5 `passed = true`.

**Riesgos residuales:**
- **Cerrado, no residual:** la diferencia entre "SQL suelto validado" y "función
  PL/pgSQL real" que esta sección advertía sí importó — es exactamente el bug
  de `account_id` ambiguo de arriba. Ya no es un riesgo teórico: se manifestó,
  se corrigió, y `npm run db:test` confirma la función real, no solo la query.
- `p_include_archived` es un parámetro nuevo en la superficie pública de la
  API. Cualquier otro llamador futuro que use el nombre por defecto (`false`)
  obtiene el comportamiento del overload de 2 argumentos (excluye archivadas);
  quien necesite el de 1 argumento debe pasar `true` explícitamente.
- El criterio de aceptación "Total balance reconcilia... con el contrato de
  RUM-002" no se puede cerrar todavía — no existe ese contrato. Cuando RUM-002
  decida el invariante (B-4), puede que summarizeBalances() cambie, pero eso
  es independiente de esta función: ella solo trae los datos, no decide cómo
  sumarlos.
- Los otros cinco sitios que llaman `get_account_balances` de una sola fecha
  (`plan`, `debts`, `debt-planner`, `export/download`, la herramienta de IA) y
  el patrón idéntico de N+1-por-mes en `trend-actions.ts` (un `get_account_balances`
  por cada mes del rango de Trends) **no se tocaron**. `trend-actions.ts` es
  exactamente el mismo problema que este ticket arregla y podría migrarse a la
  misma función nueva sin riesgo adicional — queda como oportunidad explícita,
  no como parte de este cierre, para no ampliar el diff de un ticket que ya
  toca tres pantallas.

**Checklist manual de revisión:**
1. ~~Aplicar la migración~~ — hecho. `npm run db:test -- --user=<uuid>
   --file=rum_006` → 5 checks, todos `passed = true` (confirmado 2026-09-21).
2. Abrir `/dashboard/net-worth`, cambiar de mes varias veces → los totales y
   la evolución de 6 meses se ven idénticos a antes del cambio.
3. Abrir `/dashboard` → el mes actual y la comparación con el mes anterior
   (delta de net worth, insight de "deuda bajando") se ven idénticos.
4. Abrir `/dashboard/accounts`, alternar activas/archivadas → los saldos, el
   total y "vs. mes anterior" se ven idénticos; el orden manual (`@dnd-kit`)
   se conserva.
5. Con una cuenta en COP o CAD: confirmar que el saldo en moneda base no
   cambió respecto a antes del cambio.
6. `RUMBO_PERF=1 npm run dev`, abrir Net worth y Dashboard → cada una debería
   mostrar **una sola** entrada `rpc:get_account_balances_as_of_many` en el
   log `[rumbo-perf]`, no varias. Accounts muestra 2 entradas
   `rpc:get_account_balances` (una sin fecha, una con `prevMonthEnd`) — es
   el comportamiento correcto tras la corrección post-review, no una
   regresión.

**¿Lista para PR?:** sí. Migración aplicada, función corregida y re-aplicada,
gate de base de datos en verde (5/5), gate de app en verde.

**Correcciones al backlog:** ninguna hipótesis de §3.4 se tocó. §6.1 y la
entrada de RUM-006 en el tablero pasan a "Hecho (contrato de RUM-002
pendiente)". Nuevo hallazgo, fuera del alcance de RUM-006, registrado en
`docs/pending-work.md` §7: `BR-006 official balances match posted/pending
entries only` falla contra datos reales — la primera vez que ese check pudo
correr nunca.

---

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

**Métricas (capa C, medida contra producción el 2026-09-21, RLS aplicada):**

`get_account_balances` es el **71 % de todo el tiempo de base de datos** del
proyecto: 2.101 s de 2.976 s en una ventana de 112 días de `pg_stat_statements`.
36.778 buffers (~287 MB) para devolver 22 filas; 192 ms directos, 620 ms de
media en producción.

**Y escala con el historial completo del household, no con la fecha de corte:**

| Household | Transacciones | Buffers | Exec |
|---|---:|---:|---:|
| grande | 4.688 | 36.778 | 194,9 ms |
| pequeño | 231 | 4.058 | 30,2 ms |
| mínimo | 121 | 3.188 | 17,1 ms |

Todas las demás queries están en el ruido del transporte (~285 ms de piso de la
Management API, medido con un probe `select 1`):
`search_household_transactions` **12 ms**, `get_monthly_dashboard_summary`
9,45 ms, `get_monthly_expenses_by_category` 6,99 ms, lookups 0-53 ms netos.

Capa B (servidor) sigue sin medir — ver B-5.

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

**Hallazgos que reescriben otros tickets:**
- **RUM-006 cambia de forma.** No es "reducir llamadas repetidas": cada llamada
  a `get_account_balances` cuesta O(historial). El número de llamadas y el costo
  por llamada son dos problemas, y el segundo crece solo cada mes.
- **RUM-005 es orquestación, no SQL.** Las queries del Dashboard cuestan ~0 en la
  base salvo las dos de balances. Lo caro es esperarlas de una en una.
- **RUM-004 sigue vivo** (corregido tras la revisión de Codex en PR #69). El
  primer probe midió solo un mes — 15 filas, 22 ms — y de ahí salió un "queda
  refutado" que no estaba respaldado. Sobre all-time son **190 ms y 34.791
  buffers**, a la par de `get_account_balances`, y **el offset no cambia los
  buffers**: la RPC materializa todo el conjunto antes del `LIMIT`, así que el
  costo es O(filas que casan), no O(offset).
- **Falta un ticket**: `get_card_cycle_summaries` hace 52.846 buffers y 911 ms de
  media — la peor query por llamada del sistema, y no está en el backlog.
- **Corrección al propio arnés**: suponía que `postgres` daría números
  optimistas. Falso — las RPC comprueban `is_household_member()` en su cuerpo y
  fallan sin `--user`. El aislamiento por household está aplicado dos veces.

**¿Lista para PR?:** sí. Las capas A y C están medidas; la B queda como B-5 y ya
no bloquea a RUM-005/006.

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
| 2026-09-21 | **RUM-005: orquestación del Dashboard (parcial).** Los 7 `await` secuenciales + los 5 en `Promise.all` + `netWorthTrend` (antes al final, sin motivo — solo depende de `selectedMonth`) de `dashboard/page.tsx` se unieron en un solo `Promise.all` de 13 lecturas independientes; solo `recentEntries`/`allocations` (necesitan IDs del batch) y `homeChecklist` (necesita resultados del batch) siguen secuenciales, con el motivo comentado. Segundo hallazgo: el mismo N+1 de balances que RUM-006 corrigió estaba escondido en `trend-actions.ts` — `getDashboardTrend()` hacía 6 llamadas a `get_account_balances` (una por mes) para las métricas de tipo balance; ahora es 1 llamada a `get_account_balances_as_of_many`. Beneficia también a `/dashboard/trends`, que reusa la misma función. Streaming con `Suspense` y cache/invalidación — el resto del alcance de RUM-005 — quedan sin hacer; no se marca "Hecho" en el tablero. |
| 2026-09-21 | **RUM-006 cerrado y fusionado (PR #70), con una corrección post-review.** Codex marcó P1: el nuevo call único de Accounts pasaba `today` a `get_account_balances_as_of_many`, que siempre acota por `transaction_date <= as_of_date` — excluía silenciosamente transacciones con fecha futura del saldo de "hoy" (un caso real y soportado, ver `transaction-form.tsx`). Revertido solo el call de Accounts a sus 2 llamadas originales (`get_account_balances(household)` sin cota + `get_account_balances(household, prevMonthEnd)`); Net worth y Dashboard no se tocan, solo usaron siempre el overload ya acotado por fecha. Hilo de review respondido y resuelto, CI verde, `mergeable_state: clean`, PR #70 fusionado a `main`. |
| 2026-09-21 | **RUM-006: migración aplicada, un segundo bug real encontrado y corregido, `npm run db:test` desbloqueado para toda la suite.** A petición del usuario se aplicó `20260921120000_multi_date_account_balances.sql` (`node scripts/db-push.mjs push --apply`, 60/60). La primera aplicación falló: `account_id` es también una columna del `returns table`, así que dentro de la función es una variable en ámbito, y una referencia sin calificar es ambigua para Postgres (`plpgsql.variable_conflict` es `error` por defecto) — invisible mientras la query solo se validó suelta, fuera de una función real. Corregido calificando cada referencia con su alias de CTE; re-aplicado con `create or replace function` antes de fusionar. Nuevo flag `--user=<uuid>` en `scripts/db-test.mjs`: el runner conectaba como `postgres`, que salta RLS de tabla pero no satisface el `auth.uid()` que una función `SECURITY DEFINER` comprueba por su cuenta, así que toda función gateada por `is_household_member()` fallaba siempre. Con el fix, las 5 pruebas de RUM-006 pasan, y de paso corrió por primera vez `br_003_006_money_invariants.sql` completo: 8 de 9 pasan, y el que falla (`BR-006 official balances match posted/pending entries only`) es un hallazgo real y preexistente, sin relación con este ticket — registrado en `docs/pending-work.md` §7, sin investigar aquí. |
| 2026-09-21 | **RUM-006 cerrado (performance; el contrato de RUM-002 queda pendiente).** Nueva función `get_account_balances_as_of_many(household, dates[], include_archived)`: agrega el ledger una vez y responde N fechas desde esa misma serie acumulada, en vez de N agregaciones completas independientes. Net worth pasa de 7 llamadas a 1 (~1.344 ms/~257k buffers → 207-247 ms/~34,8k buffers medido contra producción), Dashboard de 2 a 1, Accounts de 2 a 1 unificando sus dos overloads distintos con un parámetro `include_archived`. Verificado fila por fila contra ambos overloads existentes, que quedan intactos para sus otros 5 llamadores. Un bug real encontrado y corregido en desarrollo: sin una fila de saldo cero explícita por cuenta, una fecha anterior al primer movimiento de una cuenta la dejaba fuera del resultado en vez de mostrar 0. Migración aditiva sin aplicar — queda para que el usuario la aplique y corra `npm run db:test -- --file=rum_006`. |
| 2026-09-21 | **Revisión de Codex en PR #69: dos hallazgos, ambos correctos.** (P1) `reportPerfAfterResponse` resolvía el colector dentro del callback de `after()`, donde `cache()` ya no memoiza: habría construido uno vacío y **no habría emitido ninguna línea**. Ahora se captura en el registro; test de regresión en `collector.after.test.ts`, que mockea `cache` para reproducir la transición render→after. (P2) El probe de `search_household_transactions` medía solo un mes (15 filas), así que el "RUM-004 refutado" no estaba respaldado: sobre all-time son 190 ms y 34.791 buffers. RUM-004 vuelve a P1, re-scoped. |
| 2026-09-21 | **RUM-001 medido contra producción.** `get_account_balances` = **71 % de toda la base** (2.101 s de 2.976 s en 112 días), 36.778 buffers para 22 filas, y escala con el historial del household, no con la fecha de corte. Todo lo demás está en el ruido: `search_household_transactions` 12 ms. Reescribe RUM-006, reenfoca RUM-005 a orquestación, permite descartar RUM-004 y destapa `get_card_cycle_summaries` (52.846 buffers/llamada) sin ticket. |
| 2026-09-21 | **RUM-001: instrumentación entregada, medición pendiente.** Nuevo módulo `src/lib/perf/` (switch `RUMBO_PERF=1`), `npm run perf:census` (capa A, sin credenciales) y `npm run perf:baseline` (capa C, solo lectura). Informe en `docs/performance-baseline.md`. Corregidos dos conteos de §3.4 #7 y §3.2. Hallazgos nuevos: `auth.getUser()` ×4 y `profiles` ×2 por navegación. Nuevo bloqueo B-5. |
| 2026-09-21 | Documento creado junto al backlog. Ningún ticket iniciado. |
| 2026-09-21 | **RUM-010a cerrado.** Vitest instalado (`npm test`, 11 tests semilla sobre `src/lib/health/score.ts`), integrado en el gate de `rumbo-verify`, `AGENTS.md` y CI. Convenciones en `docs/testing.md`. Bloqueo B-1 cerrado. `@types/node` subió de `^20` a `^22` (requisito de Vitest 5, y lo que ya corría CI). |
| 2026-09-21 | Revisión de Codex en PR #67. **Causa raíz de la discrepancia de net worth encontrada antes de empezar RUM-002**: un pasivo con saldo a favor suma al net worth y muestra `0` en Liabilities; cuadra al centavo en los tres meses. Corregidas cuatro afirmaciones del backlog (invariante, política de FX de saldos, cuatro round trips en Transactions, alcance del mes personalizado). Nuevo bloqueo B-4. |
