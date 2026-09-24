# Rumbo — Backlog de confianza financiera, performance y UX

> Documentation only. Backlog ejecutable RUM-001…RUM-010, derivado de un
> recorrido móvil de ~63 s por Dashboard, Transactions y Accounts sobre un
> household personal con 3–4 años de datos. Cada ticket lleva su propio prompt
> listo para pegar. El índice general de trabajo abierto sigue siendo
> [pending-work.md](./pending-work.md); este documento es la fuente de verdad
> **solo** para los tickets RUM-*.
>
> **Estado de ejecución:** RUM-010a y RUM-001 hechos. **El baseline cambió las
> prioridades**: `get_account_balances` es el 71 % de toda la base de datos y
> escala con el historial del household, mientras que el resto de queries está
> en el ruido. Lee [`performance-baseline.md`](./performance-baseline.md) §3
> antes de tomar RUM-004, RUM-005 o RUM-006. El avance se registra en
> [performance-ux-execution-status.md](./performance-ux-execution-status.md).
>
> **Creado 2026-09-21** sobre `main` después de PR #66. Las hipótesis del
> diagnóstico visual fueron contrastadas contra el código en esa fecha; §3 lista
> cuáles se confirmaron y cuáles resultaron falsas. **El repositorio es la fuente
> de verdad**: si este documento y el código discrepan, el código gana y este
> documento es el bug.

---

## 1. Objetivo

1. Asegurar que las cifras financieras sean coherentes y reproducibles.
2. Identificar con evidencia dónde se consume el tiempo de cada navegación.
3. Reducir la latencia real y percibida de Dashboard, Transactions y Accounts.
4. Simplificar el Dashboard para que comunique prioridades financieras en lugar
   de parecer una colección de funciones.
5. Evitar regresiones en ledger, transferencias, voids, multi-currency,
   household isolation y RLS.

---

## 2. Principios e invariantes

Todo trabajo de este backlog debe preservar:

- Arquitectura household-first.
- Separación entre `transactions`, `transaction_entries` y
  `transaction_allocations`.
- Transferencias como efectos vinculados y neutrales para Income/Expenses.
- Opening balances con linaje reproducible.
- Void/reversal en lugar de eliminación destructiva después de impacto
  financiero.
- Aislamiento por household mediante RLS y controles server-side.
- Histórico reproducible de importes, monedas y tasas de cambio.
- Cálculos financieros centralizados y deterministas.
- Migraciones únicamente aditivas, justificadas y con rollback.
- Precisión decimal; no usar aritmética binaria de JavaScript como fuente
  autoritativa.

### Invariantes financieros mínimos

```text
Net worth = Total assets + Signed liabilities
Displayed liabilities = SUM(max(0, -balance))   # presentacion, no un termino de la ecuacion
Savings = Income - Expenses
Savings rate = Savings / Income, cuando Income != 0
Transfers do not affect Income or Expenses
Voided transactions do not affect totals
Every aggregate is scoped to exactly one household
Historical values use the intended historical date and FX policy
```

Reglas ya documentadas que este backlog **no** puede contradecir sin una
decisión explícita:

| Regla vigente | Documento |
|---|---|
| **Los saldos (stocks) se revalúan** a la tasa vigente en la fecha del snapshot; solo se cae a la suma histórica por entry si el household no tiene tasa para ese par. Los **flujos** (income, expense, budget) conservan la tasa de su propia fecha | `supabase/migrations/20260817120000_balance_fx_revaluation.sql`. **`features/net-worth-fx-policy.md` está desactualizado** en este punto: describe la política anterior a esa migración |
| Las cuentas archivadas se excluyen de net worth actual e histórico (BR-004) | [features/net-worth-fx-policy.md](./features/net-worth-fx-policy.md) |
| Los invariantes de dinero se verifican hoy con SQL de solo lectura, no con un runner de JS | [features/financial-correctness-checks.md](./features/financial-correctness-checks.md) |
| `monthStartDay` personalizado existe pero hoy solo lo consume `/dashboard/reports` | [features/month-start-day.md](./features/month-start-day.md) |

---

## 3. Baseline observado y validación contra el código

### 3.1 Tiempos observados

Aproximaciones visuales sobre video. **No** sustituyen Network waterfall,
Server-Timing, logs del servidor, `pg_stat_statements` ni `EXPLAIN ANALYZE`.

| Interacción | Tiempo aprox. hasta contenido útil | Observación |
|---|---:|---|
| Dashboard → Transactions | 4.25 s | Skeleton inicial, luego varios segundos casi en blanco |
| Transactions → Dashboard | 3.25 s | Skeleton completo hasta mostrar datos |
| Septiembre → Agosto | 0.25–0.50 s | Respuesta rápida |
| Agosto → Julio | 0.25–0.50 s | Respuesta rápida |
| Dashboard → Accounts | 1.50 s | Aceptable, mejorable |
| Accounts → Transactions | 1.75 s | Skeleton seguido de fase casi vacía |
| Transactions → Dashboard (2ª visita) | 3.00 s | Repite trabajo de una pantalla recién visitada |

### 3.2 Señales visuales positivas

- Identidad consistente entre las tres pestañas y dark mode coherente.
- Buena jerarquía y semántica de colores en Transactions.
- Scroll fluido en listas y Dashboard.
- Los cambios de mes en Dashboard responden con rapidez.
- Transactions distingue correctamente Income, Expense, Transfer y Voided.
- Accounts presenta moneda original y conversión aproximada.

### 3.3 Discrepancia financiera observada

| Mes | Assets | Liabilities | Assets − Liabilities | Net worth mostrado |
|---|---:|---:|---:|---:|
| Septiembre | $62,416.70 | $11.78 | $62,404.92 | $62,539.37 |
| Agosto | $63,846.50 | $1,789.05 | $62,057.45 | $62,074.40 |
| Julio | $60,323.19 | $6,152.85 | $54,170.34 | $54,251.18 |

**Causa raíz encontrada** (2026-09-21, tras revisión de Codex en PR #67). No es
redondeo ni FX: es que **la columna `Liabilities` que se muestra no es el término
que entra en la ecuación**.

En `src/app/dashboard/net-worth/page.tsx:90-119`:

```ts
getDisplayedLiabilityBalance = (v) => Math.max(0, -Number(v))   // lo que se muestra
netWorth = totalAssets + signedLiabilities                       // lo que se calcula
```

Una cuenta de pasivo con **saldo a favor** (una tarjeta sobrepagada, saldo
positivo) suma su crédito al net worth, pero aporta `0` al total de Liabilities
mostrado. La diferencia de cada mes es exactamente ese crédito:

| Mes | Assets | Liab. mostrado | Net worth | Crédito implícito |
|---|---:|---:|---:|---:|
| Septiembre | $62,416.70 | $11.78 | $62,539.37 | **$134.45** |
| Agosto | $63,846.50 | $1,789.05 | $62,074.40 | **$16.95** |
| Julio | $60,323.19 | $6,152.85 | $54,251.18 | **$80.84** |

`assets + crédito − liab. mostrado = net worth` cuadra al centavo en los tres
meses. El Dashboard usa la misma convención.

**Consecuencia para RUM-002:** el net worth **no está mal calculado**. Sumar un
saldo a favor al patrimonio es correcto. Lo que falla es la *presentación*: se
muestran dos números que parecen los términos de una resta y no lo son. Exigir
`Net worth = Assets − Liabilities` al centavo, como decía la primera versión de
este backlog, **expulsaría un crédito legítimo del net worth**. RUM-002 pasa de
"arreglar el cálculo" a "decidir y documentar cuál es el invariante, y hacer que
las tres pantallas coincidan con él".

### 3.4 Validación de hipótesis contra el código (2026-09-21)

Barrido de solo lectura sobre `main`. **Leer esta tabla antes de trabajar
cualquier ticket**: varias hipótesis del diagnóstico visual son falsas y
seguirlas produciría trabajo desperdiciado.

| # | Hipótesis del diagnóstico | Veredicto | Evidencia |
|---|---|---|---|
| 1 | Existe un servicio autoritativo de valoración | **Falso** | Tres reducciones independientes en JS: `summarizeBalances()` en `src/app/dashboard/net-worth/page.tsx:95`, cálculo inline (`sumBase`/`totalAssets`/`signedLiabilities`) en `src/app/dashboard/page.tsx:432`, y una tercera en `src/app/dashboard/accounts/page.tsx:63`. Ninguna vive en `src/lib/`. **Sospechoso principal de §3.3.** |
| 2 | `include_in_net_worth` / `is_archived` existen | **Confirmado** | `supabase/migrations/20260601000200_accounts_categories.sql:27`; flag visible en `20260817120000_balance_fx_revaluation.sql:249` |
| 3 | Los saldos se reconstruyen con una query por cuenta (N+1) | **Falso** | `get_account_balances(p_household_id, p_as_of_date)` es una RPC agregada: una llamada trae todas las cuentas |
| 4 | No hay N+1 en ningún lado | **Falso — hay N+1 por mes** | `net-worth/page.tsx:288-302` llama `get_account_balances` **7 veces** (mes + 6 de evolución) dentro de un `Promise.all`; el Dashboard la llama 2 veces (`page.tsx:276`, `:297`) |
| 5 | Transactions descarga el historial completo y filtra en el navegador | **Falso** | RPC única `search_household_transactions` con `p_limit`/`p_offset`, `PAGE_SIZE = 50` (`src/app/dashboard/transactions/page.tsx:715-742`); el rango de fechas va en SQL vía `src/lib/periods/transaction-period.ts` |
| 6 | List, summary y count son llamadas separadas | **Falso** | `total_count` viene en la misma fila del RPC (`transactions/page.tsx:759`); los cuatro lookups (accounts/categories/payees/tags) van en **una sola ola concurrente, pero son cuatro requests HTTP** (`Promise.all` de cuatro builders en `:596-631`; el comentario del código dice "one round trip" y es impreciso) |
| 7 | El Dashboard bloquea el top-of-fold con módulos secundarios | **Confirmado, y peor de lo supuesto** — conteo corregido por RUM-001 | `src/app/dashboard/page.tsx` es un único Server Component sin `Suspense`. **~24 round-trips por carga** (18 de la ruta + 6 del layout que paga toda navegación) y **11 `await` estrictamente secuenciales**, líneas 254-305, no 8: la ventana `:276-310` de la primera lectura se dejó fuera el preámbulo de `auth.getUser()` (`:254`), `profiles` (`:257`) y `households` (`:264`). Solo 5 están paralelizados (`:312-318`). Reproducible con `npm run perf:census`; detalle en [`performance-baseline.md`](./performance-baseline.md) §2 |
| 8 | `Month health` no tiene fórmula | **Falso** | `src/lib/health/score.ts` documenta la fórmula (líneas 1-18), exporta pesos `HEALTH_SAVINGS_WEIGHT = 0.65` / `HEALTH_BUDGET_WEIGHT = 0.35`, umbrales de savings y budget, y grados en `healthGrade()`. Hay tooltip (`page.tsx:811`). **El problema real es que no se muestra el desglose, no que la fórmula no exista.** |
| 9 | El redondeo financiero debe centralizarse en `src/lib/calc.ts` | **Falso** | `calc.ts` es el evaluador de la calculadora del teclado numérico, sin relación con montos. La suma de dinero vive en las RPC de SQL |
| 10 | La precisión decimal se pierde en JS | **Parcial** | No hay `decimal.js` / `big.js`. `src/lib/fx.ts` usa `number` nativo en todo. Falta confirmar si los agregados de SQL usan `numeric` |
| 11 | La política de FX histórica es reproducible | **Riesgo confirmado** | `fetchFxRate` (`src/lib/fx.ts:9-49`) consulta un **CDN externo** (`@fawazahmed0/currency-api`) y **cae a `'latest'` si el archivo del día histórico falla** — una tasa histórica puede cambiar entre ejecuciones |
| 12 | Los límites de periodo dependen de UTC accidentalmente | **Falso — es deliberado** | `src/lib/periods/month.ts:32` y `transaction-period.ts:51-53` documentan el uso de UTC a propósito. No hay timezone de household en el cálculo |
| 13 | `monthStartDay` aplica en todas las pantallas | **Falso** | `month.ts:27-30`: solo lo usa `/dashboard/reports`; las **RPC mensuales** (dashboard, budgets, month closures) usan `date_trunc('month', ...)`. **Transactions no entra aquí**: no tiene un solo `date_trunc`, resuelve sus límites con `transaction-period.ts` a partir de la URL, y `AGENTS.md` lo registra como *a separate concern, not a duplicate* de `periods/month.ts` |
| 14 | Existe una capa de cache (React Query/SWR/`unstable_cache`) | **Falso** | Ninguna de las tres está en el repo. Solo `revalidatePath` en los `actions.ts` (patrón estándar de server actions) |
| 15 | Todas las rutas tienen `loading.tsx` | **Falso** | Existen 17. **Faltan** en `assistant/`, `cash-flow/`, `debt-planner/`, `coming-soon/`, `help/`, `month-review/`, `more/`, `plan/`, `reports/`, `settings/`, `trends/` |
| 16 | Se pueden "añadir tests" en cada ticket | **Era falso — resuelto por RUM-010a (2026-09-21)** | Al escribir esta tabla no había runner de JS/TS: ni Vitest, ni Jest, ni Playwright, ni archivos `*.test.*`, ni fixtures. **Ya lo hay**: Vitest, `npm test`, `vitest.config.mts`, tests co-localizados `<módulo>.test.ts`, fixtures en `tests/fixtures/`, integrado en CI. Convenciones y decisión de stack en [`testing.md`](./testing.md). Los 5 archivos SQL de `supabase/tests/` siguen intactos y conviven vía `npm run db:test` |
| 17 | `Net worth = Assets - Liabilities` es el invariante vigente | **Falso — y explica §3.3** | `net-worth/page.tsx:90-119`: `netWorth = totalAssets + signedLiabilities`, mientras que el total de Liabilities mostrado es `Math.max(0, -balance)`. Un pasivo con saldo a favor suma al net worth y muestra `0` en Liabilities |
| 18 | Los saldos usan la tasa histórica congelada por entry | **Falso** | `supabase/migrations/20260817120000_balance_fx_revaluation.sql` (aplicada) revalúa los **stocks** a la tasa vigente en la fecha del snapshot, con fallback a la suma histórica solo si no hay tasa. `features/net-worth-fx-policy.md` quedó desactualizado |

**Consecuencia de #16 en la priorización:** casi todos los tickets piden "add
tests" y no había dónde escribirlos. Por eso RUM-010 se partió en dos y su
primera mitad (**RUM-010a**, elegir e instalar el stack de tests) subió a P0 y
se ejecutó antes que cualquier ticket que prometa cobertura. **Hecho el
2026-09-21**: la excusa de "no hay runner" del §5 (Definition of Done) ya no
aplica — un ticket que promete tests ahora debe traerlos.

**Consecuencia de #5 y #6 en la priorización:** la causa raíz asumida para
RUM-004 quedó refutada. Los 4.25 s de Transactions no vienen de traer años de
datos al cliente. RUM-004 baja de prioridad y queda estrictamente subordinado a
la evidencia de RUM-001.

**Consecuencia de #7:** RUM-005 es el mejor trade-off del backlog — la causa
está localizada, es barata de arreglar y no toca reglas financieras.

---

## 4. Contrato de ejecución (aplica a todos los tickets)

> Todo prompt de §7 empieza remitiendo aquí. Esta sección es el contrato
> compartido; los prompts solo añaden lo específico del ticket.

### 4.1 Lectura previa (antes de tocar código)

1. Lee `AGENTS.md` y `CLAUDE.md`.
2. De este documento lee **únicamente**: §2 (principios e invariantes), §3.4
   (validación de hipótesis), las dependencias del ticket, la sección completa
   del ticket en §7, y §5 (Definition of Done). No leas los demás tickets.
3. Lee [performance-ux-execution-status.md](./performance-ux-execution-status.md).
4. Inspecciona solamente los módulos, consultas, componentes y pruebas
   relacionados con este ticket. Delega en `scout` antes de abrir archivos
   grandes (`src/app/dashboard/page.tsx` supera las 1.600 líneas).
5. Valida las hipótesis contra el código real. **El repositorio es la fuente de
   verdad.** Si §3.4 ya está desactualizada, corrígela en el mismo cambio.

### 4.2 Autonomía

Trabaja autónomamente **solo dentro del ticket asignado**.

Puedes, sin pedir confirmación intermedia:

- Modificar código relacionado con el ticket.
- Crear o actualizar pruebas.
- Ejecutar formatting, lint, typecheck, tests y build.
- Crear commits y hacer push **únicamente a la rama aislada de esta sesión**.
- Actualizar `docs/performance-ux-execution-status.md`.

### 4.3 Detente y pregunta antes de

- Aplicar migraciones o backfills contra una base remota.
- Modificar datos o configuración de producción.
- Cambiar RLS o el aislamiento por household.
- Cambiar la semántica del ledger, transferencias, balances o FX.
- Hacer merge o deployment.
- Ampliar el trabajo a otro ticket.

Si el ticket **no** requiere una decisión financiera, una migración remota ni un
cambio de seguridad, impleméntalo completo sin pedir confirmaciones intermedias.

### 4.4 Preserva obligatoriamente

- El ledger de doble entrada.
- La separación entre `transactions`, `transaction_entries` y
  `transaction_allocations`.
- Las transferencias vinculadas.
- La trazabilidad de opening balances, voids y reversals.
- El aislamiento por household.
- La reproducibilidad histórica y multi-moneda.
- La consistencia entre Dashboard, Transactions, Accounts y Reports.

### 4.5 Al terminar

1. Ejecuta el gate real del repo (ver `rumbo-verify`): `npm run lint`,
   `npx tsc --noEmit`, `npm run build` cuando sea viable, y la prueba manual del
   flujo tocado.
2. Actualiza `docs/performance-ux-execution-status.md`.
3. Deja todo commiteado y pusheado en la rama de la sesión.
4. **No crees el siguiente ticket.**
5. Entrega: causa raíz confirmada · archivos modificados · comportamiento antes
   y después · tests y comandos ejecutados · métricas antes y después ·
   migraciones o pasos pendientes · riesgos residuales · checklist manual de
   revisión · confirmación de si la rama está lista para PR.

No hagas merge ni deployment.

---

## 5. Definition of Done global

Un ticket no está terminado porque "se siente más rápido". Debe cumplir:

- Causa raíz o decisión documentada.
- Métrica before/after.
- Criterios de aceptación verificados.
- Tests nuevos o actualizados. **RUM-010a ya aterrizó el runner** (`npm test`,
  Vitest; ver [`testing.md`](./testing.md)), así que "no hay dónde escribirlos"
  dejó de ser justificación válida.
- `npm run lint`, `npx tsc --noEmit` y `npm run build` exitosos.
- Sin regresiones en ledger, transfers, voids, opening balances y multi-currency.
- Sin debilitamiento de RLS y sin datos cruzados entre households.
- Sin migración destructiva.
- Estados loading, empty y error definidos.
- Cambios de cache acompañados por estrategia de invalidación.
- Riesgos residuales explícitos.

---

## 6. Priorización, dependencias y orden

### 6.1 Tabla de tickets

Prioridad revisada tras la validación de §3.4. La columna "Cambio" indica cómo
se movió respecto de la propuesta original.

| ID | Ticket | Prioridad | Tamaño | Dependencias | Cambio |
|---|---|---|---:|---|---|
| RUM-010a | Elegir e instalar el stack de tests + fixture mínimo | **P0** | M | Ninguna | ✅ **Hecho 2026-09-21** — Vitest, `npm test`, en CI. Ver [`testing.md`](./testing.md) |
| RUM-001 | Instrumentar baseline y trazabilidad de performance | P0 | M | Ninguna | ✅ **Hecho 2026-09-21** (capa de servidor pendiente, B-5). Ver [`performance-baseline.md`](./performance-baseline.md) |
| RUM-002 | Reconciliar Net worth, Assets, Liabilities y Accounts total | **✅ Hecho 2026-09-21** | L | RUM-010a (para tests) | Servicio único `src/lib/net-worth/valuation.ts`; invariante decidido (`Net worth = Total assets + Signed liabilities`, sin cambios); bug de signo real encontrado y corregido en `accounts/page.tsx`. Ver [`performance-ux-execution-status.md`](./performance-ux-execution-status.md) |
| RUM-005 | Descomponer y optimizar carga del Dashboard | **🟡 Orquestación + streaming hechos 2026-09-21** (cache/invalidación deferida) | M/L | RUM-001, RUM-002 | Los 7 awaits secuenciales + los 5 en paralelo + `netWorthTrend` al final se unieron en un solo `Promise.all` de 13; se encontró y corrigió el mismo patrón N+1 de RUM-006 escondido en `trend-actions.ts` (6 llamadas a `get_account_balances` por mes → 1 a `get_account_balances_as_of_many`). Todo lo debajo del fold ahora streamea detrás de un `<Suspense>` (primer uso en el repo) en `src/app/dashboard/secondary-widgets.tsx`. Cache/invalidación selectiva queda deferida a propósito: no hay capa de cache hoy, introducir una es su propia decisión arquitectónica. Ver [`performance-ux-execution-status.md`](./performance-ux-execution-status.md) |
| RUM-003 | Formalizar periodos históricos, FX y precisión decimal | **✅ Hecho 2026-09-22** | L | RUM-002 | Fallback silencioso de FX a `'latest'` eliminado (`source: requested/future/fallback` + log); bug de snapshot corregido (mes actual ahora usa "hoy", no fin de mes) en Dashboard/Net worth/trend; `roundToCents` centralizado, sin tipo decimal (evidencia: schema ya es `numeric`). UTC y `monthStartDay` fuera de Reports quedan documentados como decisiones explícitas, no implementados. Ver [`performance-ux-execution-status.md`](./performance-ux-execution-status.md) |
| RUM-006 | Reducir llamadas repetidas de balances (Accounts y Net worth) | **✅ Hecho 2026-09-21** | M/L | RUM-001, RUM-002 | 7+2+2 llamadas → 1+1+1, cada una al costo de una sola fecha. Ver [`performance-ux-execution-status.md`](./performance-ux-execution-status.md) §4 |
| RUM-007 | Cache, prefetch y continuidad de loading states | **✅ Hecho 2026-09-24** | M | RUM-001; coordinar 004–006 | Sin cache nueva a propósito (B-5 bloquea afinar `staleTimes` sin timings reales); 11 `loading.tsx` añadidos, `prefetch={true}` nativo de Next en las 3 pestañas principales, invalidación existente (`revalidatePath`) auditada y sin cambios. Ver [`performance-ux-execution-status.md`](./performance-ux-execution-status.md) |
| RUM-004 | Optimizar consultas de Transactions | **P1** | M | RUM-001 | **Re-scope, no descarte.** `search_household_transactions` cuesta 22 ms sobre un mes pero **190 ms y 34.791 buffers sobre all-time**, y el offset no influye ([baseline §5.4.1](./performance-baseline.md)) |
| RUM-008 | Simplificar arquitectura de información del Dashboard | P2 | M | RUM-002 | Sin cambio |
| RUM-009 | Corregir semántica de Month health, Insights y secundarios | P2 | M | RUM-002, RUM-008 | Re-enfocado: la fórmula existe (§3.4 #8) |
| RUM-010b | Suite de regresión, carga y release gate | P0 transversal | M/L | Todos | Resto de RUM-010 |

### 6.2 Mapa de dependencias

```text
RUM-010a Stack de tests
   └── habilita la cobertura de todos los demás tickets

RUM-001 Instrumentación
   ├── RUM-005 Dashboard performance
   ├── RUM-006 Balances repetidos
   ├── RUM-004 Transactions performance
   └── RUM-007 Cache, prefetch y loading UX

RUM-002 Contrato financiero y reconciliación
   ├── RUM-003 Histórico y multi-currency
   ├── RUM-005 Dashboard performance
   ├── RUM-006 Balances repetidos
   ├── RUM-008 Dashboard IA
   └── RUM-009 Métricas e insights secundarios

RUM-010b QA y release gate cubre todos los tickets
```

### 6.3 Orden recomendado

**Fase 1 — Herramientas y evidencia**

1. RUM-010a — stack de tests (desbloquea la cobertura del resto).
2. RUM-001 — instrumentación.
3. RUM-002 — reconciliación financiera.

No optimizar agresivamente antes de conocer consultas, planes y contrato
financiero.

**Fase 2 — Performance principal**

4. RUM-005 — Dashboard (mejor relación evidencia/costo del backlog).
5. RUM-006 — balances repetidos.
6. RUM-007 — cache y loading, coordinado con los anteriores.

**Fase 3 — Precisión y producto**

7. RUM-003 — histórico, FX y precisión decimal.
8. RUM-004 — Transactions, solo si RUM-001 lo justifica.
9. RUM-008 — arquitectura del Dashboard.
10. RUM-009 — métricas e insights secundarios.

**Fase 4 — Release gate**

11. RUM-010b — suite completa, baseline final, validación en Preview con el
    dataset grande. Desplegar solo después de reconciliación financiera y QA.

### 6.4 Alcance sugerido para un sprint

El backlog completo no cabe en un sprint para una sola persona. Sprint enfocado
al mayor riesgo:

- RUM-010a completo.
- RUM-001 completo.
- RUM-002 completo.
- RUM-005 completo.
- RUM-006 completo.
- RUM-007 limitado a: eliminar la pantalla vacía, conservar datos previos y
  cache segura básica.
- RUM-010b limitado a los tests críticos y al informe before/after.

Mover al siguiente sprint si falta capacidad: RUM-004, reestructuración profunda
del Dashboard (RUM-008), Month health e Insights (RUM-009), personalización de
módulos y mejoras no críticas de copy.

---

## 7. Tickets

Cada ticket incluye un **prompt listo para pegar**. El prompt asume que quien lo
ejecuta seguirá el Contrato de ejecución de §4 de este mismo documento.

---

### RUM-010a — Elegir e instalar el stack de tests

> ✅ **Hecho el 2026-09-21.** Stack elegido: **Vitest**. Decisión, alternativas
> descartadas y convenciones en [`testing.md`](./testing.md); registro de
> ejecución en
> [performance-ux-execution-status.md](./performance-ux-execution-status.md).
> El texto de abajo se conserva como el enunciado original del ticket.

**Prioridad:** P0 · **Tipo:** Tooling/QA · **Tamaño:** M · **Dependencias:** ninguna
**Bloquea:** la cobertura prometida por RUM-002…RUM-009 y toda RUM-010b
**Desbloqueado:** el bloqueo B-1 queda cerrado

#### Problema

El repo no tenía runner de tests de JS/TS (§3.4 #16). `docs/features/financial-correctness-checks.md`
ya registra este vacío como follow-up pendiente: *"A future BR should add a real
automated runner, either SQL-based or Vitest-based, once the project chooses a
test stack."* Hasta resolverlo, cualquier ticket que diga "añade tests" no puede
cumplirse.

#### Alcance

- Elegir el stack (recomendación por defecto: Vitest, por afinidad con Vite/Next
  y coste de configuración bajo). Documentar la decisión.
- Instalar y configurar el runner con un script en `package.json`.
- Escribir 3–5 tests semilla sobre lógica pura ya existente y determinista
  (`src/lib/health/score.ts` es el mejor candidato: fórmula documentada, pesos
  exportados, sin I/O).
- Definir dónde viven los tests y los fixtures, y documentarlo en `AGENTS.md`.
- Dejar el runner integrado en el gate de `rumbo-verify` y en CI si ya existe.
- **No** reescribir los invariantes SQL de `supabase/tests/`: conviven.

#### Criterios de aceptación

- `npm test` (o el script elegido) corre en local y en CI sin base de datos.
- Los tests semilla pasan y fallan de verdad si se rompe la lógica que cubren.
- La elección de stack está justificada por escrito.
- El gate documentado (`rumbo-verify`, `AGENTS.md`) incluye el nuevo comando.
- Los 5 archivos SQL de `supabase/tests/` siguen funcionando vía `npm run db:test`.

#### Fuera de alcance

- Fixtures de varios años (eso es RUM-010b).
- Tests de integración contra Supabase.
- E2E / Playwright.

#### Prompt listo para pegar

```text
Trabaja en el ticket "RUM-010a" de Rumbo directamente sobre este repositorio.

Sigue el Contrato de ejecución de la §4 de docs/performance-ux-backlog.md
(lectura previa, autonomía, paradas obligatorias, invariantes y entrega final).
Lee también la §3.4 de ese documento: la validación #16 es la razón de ser de
este ticket.

Objetivo: el repositorio no tiene runner de tests de JS/TS. Elige, instala y
documenta uno.

Requisitos:
1. Evalúa Vitest frente a las alternativas para un proyecto Next.js 16 + React
   19 + TypeScript. Recomienda uno y justifica la decisión por escrito.
2. Instala y configura el runner. Añade el script correspondiente a
   package.json. No debe requerir una base de datos para correr.
3. Escribe entre 3 y 5 tests semilla sobre lógica pura existente. Usa
   src/lib/health/score.ts como primer objetivo: tiene la formula documentada,
   los pesos exportados (HEALTH_SAVINGS_WEIGHT, HEALTH_BUDGET_WEIGHT), umbrales
   y healthGrade(). Verifica que cada test falla si rompes la logica a
   proposito.
4. Define y documenta la convencion de ubicacion de tests y fixtures.
5. Actualiza AGENTS.md y la skill rumbo-verify para que el gate incluya el nuevo
   comando.
6. Si existe workflow de CI, integra el runner ahi.
7. No toques los 5 archivos SQL de supabase/tests/: siguen corriendo con
   npm run db:test y deben seguir funcionando.
8. No escribas fixtures de varios anos ni tests de integracion contra Supabase:
   eso es RUM-010b.

No cambies comportamiento financiero, esquema, RLS ni caching de produccion en
este ticket.
```

---

### RUM-001 — Instrumentar baseline y trazabilidad de performance

> ✅ **Hecho el 2026-09-21.** Instrumentación, censo estático y medición contra
> producción en [`performance-baseline.md`](./performance-baseline.md).
> **Resultado que cambia el backlog:** `get_account_balances` es el 71 % de todo
> el tiempo de base de datos y su costo escala con el historial completo del
> household; el resto de las queries está en el ruido del transporte. Queda
> pendiente solo la capa de timings de servidor (`RUMBO_PERF=1`), registrada
> como B-5, que ya no bloquea a RUM-005 ni a RUM-006.

**Prioridad:** P0 · **Tipo:** Investigación/observabilidad · **Tamaño:** M · **Dependencias:** ninguna
**Bloquea:** RUM-004, RUM-005, RUM-006 y las decisiones grandes de RUM-007

#### Problema

El video mide latencia percibida pero no separa PostgreSQL, Supabase, Server
Components, server actions, red, hidratación ni render del cliente. Optimizar sin
instrumentación traslada el costo o introduce cache incorrecto.

#### Alcance

- Medir navegación fría y caliente para Dashboard, Transactions y Accounts.
- Añadir timings por request y por operación relevante.
- Registrar duración, filas leídas/devueltas, payload y cache status donde sea
  seguro.
- Obtener un Network waterfall reproducible.
- Revisar `pg_stat_statements` o el mecanismo equivalente disponible.
- Ejecutar `EXPLAIN (ANALYZE, BUFFERS)` sobre las queries candidatas, en un
  entorno seguro.
- Identificar consultas duplicadas, seriales y N+1.
- Producir un informe before/after utilizable por los tickets de optimización.

**Puntos de partida ya localizados** (§3.4): los 8 `await` secuenciales de
`src/app/dashboard/page.tsx:276-310`; las 7 llamadas a `get_account_balances` en
`src/app/dashboard/net-worth/page.tsx:288-302`; las 2 del Dashboard
(`page.tsx:276`, `:297`); la RPC `search_household_transactions`
(`src/app/dashboard/transactions/page.tsx:715-742`).

#### Criterios de aceptación

- Existe una tabla con cada request/query, duración p50/p75/p95, filas y payload.
- Se diferencian cold navigation, warm navigation y cambio de periodo.
- Los headers o logs permiten atribuir el tiempo total a etapas concretas.
- Se documentan las cinco consultas más costosas.
- No se exponen PII, SQL sensible ni parámetros financieros en logs públicos.
- El baseline es reproducible y trae instrucciones de ejecución.

#### Fuera de alcance

- Crear índices o reescribir consultas antes de completar el baseline.
- Cambiar reglas financieras.

#### Presupuestos de performance propuestos

Objetivos iniciales, a confirmar contra el baseline real. No deben usarse para
esconder errores ni sacrificar exactitud financiera.

| Flujo | Objetivo inicial |
|---|---:|
| Feedback visual al tocar una pestaña | ≤ 100 ms |
| Reentrada con datos cacheados | Contenido previo inmediato; revalidación en background |
| Dashboard top-of-fold, navegación caliente | p75 ≤ 1.0 s |
| Dashboard top-of-fold, navegación fría | p75 ≤ 1.5 s |
| Transactions de un mes, navegación caliente | p75 ≤ 0.8 s |
| Transactions de un mes, navegación fría | p75 ≤ 1.5 s |
| Accounts | p75 ≤ 1.2 s |
| Cambio de mes | p75 ≤ 0.5 s |
| Query individual interactiva | p95 ≤ 300 ms, salvo justificación documentada |
| Pantalla vacía entre skeleton y contenido | 0 ms |

#### Prompt listo para pegar

```text
Trabaja en el ticket "RUM-001" de Rumbo directamente sobre este repositorio.

Sigue el Contrato de ejecución de la §4 de docs/performance-ux-backlog.md.
Lee también la §3.4 del mismo documento: los puntos 3, 4, 5, 6, 7 y 14 ya
acotan dónde mirar.

Objetivo: producir evidencia, no optimizar. No reescribas consultas ni crees
índices en este ticket.

Requisitos:
1. Mide navegación fría y caliente para Dashboard, Transactions y Accounts.
2. Mide cada query o RPC de servidor importante por separado.
3. Captura duración de request, duración de query, filas devueltas, tamaño de
   respuesta cuando esté disponible, y cache hit/miss.
4. Añade cabeceras Server-Timing seguras o salida de timing estructurada solo
   para desarrollo, usando los patrones que el repositorio ya soporta.
5. Confirma y cuantifica los cuellos ya localizados:
   - Los 8 await secuenciales de src/app/dashboard/page.tsx:276-310.
   - Las 7 llamadas a get_account_balances en
     src/app/dashboard/net-worth/page.tsx:288-302.
   - Las 2 llamadas del Dashboard en page.tsx:276 y :297.
   - La RPC search_household_transactions en
     src/app/dashboard/transactions/page.tsx:715-742, que ya pagina en servidor.
6. Identifica llamadas duplicadas, secuenciales y comportamiento N+1 adicional.
7. Prepara instrucciones seguras de EXPLAIN (ANALYZE, BUFFERS) para las queries
   relevantes. Nunca ejecutes SQL destructivo.
8. Usa pg_stat_statements o el equivalente de Supabase si está configurado.
9. Compara: Dashboard top-of-fold, Dashboard completo, lista/summary/count
   mensual de Transactions, y balances de Accounts.
10. No registres descripciones de transacciones, email de usuario, nombres de
    household ni contenido sensible.

Entregables:
- Código de instrumentación protegido para desarrollo/observabilidad.
- Un informe Markdown de baseline con p50/p75/p95 donde sea repetible.
- Tabla de timings de red/request/query.
- Los cinco cuellos principales con evidencia, no suposiciones.
- Comandos y pasos de prueba.
- Archivos modificados y riesgos residuales.

No cambies comportamiento financiero, esquema, RLS ni caching de producción en
este ticket.
```

---

### RUM-002 — Reconciliar Net worth, Assets, Liabilities y Accounts total

**Prioridad:** P0 · **Tipo:** Integridad financiera · **Tamaño:** L
**Dependencias:** RUM-010a para la cobertura de tests; por lo demás puede ir en paralelo con RUM-001

#### Problema

Net worth no reconcilia con Assets − Liabilities (§3.3) y el total de Accounts
parece incompatible con el Dashboard para el mismo household y periodo. Esto
ataca directamente la confianza en el producto.

**Causa raíz probable, ya localizada** (§3.4 #1): las tres pantallas leen la
misma RPC `get_account_balances` pero agregan con **tres reducciones de JS
distintas y no compartidas**:

| Pantalla | Agregación | Ubicación |
|---|---|---|
| Net worth | `summarizeBalances()` | `src/app/dashboard/net-worth/page.tsx:95` |
| Dashboard | inline `sumBase` / `totalAssets` / `signedLiabilities` | `src/app/dashboard/page.tsx:432` |
| Accounts | reducción propia con su propio tipo `AccountBalance` | `src/app/dashboard/accounts/page.tsx:63` |

Ninguna vive en `src/lib/`. Confirmar antes de asumir.

#### Alcance

- Trazar la fuente de Net worth, Assets, Liabilities y Accounts total.
- Definir exactamente qué cuentas y estados participan en cada métrica.
- Verificar signos de credit cards, loans, cash, investments y cuentas con saldo
  positivo/negativo.
- Revisar el tratamiento de `is_archived` e `include_in_net_worth`.
- Unificar snapshot/date boundary y base currency.
- Centralizar la valoración en **un** servicio autoritativo en `src/lib/`.
- Documentar las diferencias legítimas entre `Total balance` y `Net worth`, si de
  verdad son conceptos distintos.

#### Criterios de aceptación

- El invariante vigente queda **decidido y documentado**. El de partida es el
  del código: `Net worth = Total assets + Signed liabilities`. **No** impongas
  `Net worth = Assets − Liabilities` sin redefinir antes qué es "Liabilities":
  hoy la cifra mostrada es `max(0, -balance)` y no es un término de la ecuación.
- Un pasivo con saldo a favor (tarjeta sobrepagada) **sigue sumando** al net
  worth, y la pantalla ya no presenta dos cifras que parecen una resta sin
  serlo.
- Las tres pantallas reconcilian al centavo entre sí para todos los meses
  probados.
- Dashboard, Accounts y Net worth comparten el mismo contrato de valoración.
- Toda exclusión de una cuenta tiene una razón visible o documentada.
- Los signos de las liability accounts están cubiertos por tests.
- Cuentas archivadas e inversiones tienen reglas explícitas.
- No existen correcciones hardcoded en componentes de React.
- Se documenta la causa raíz de las discrepancias de §3.3.

#### Prompt listo para pegar

```text
Trabaja en el ticket "RUM-002" de Rumbo directamente sobre este repositorio.

Sigue el Contrato de ejecución de la §4 de docs/performance-ux-backlog.md.
Lee también la §3.3 (discrepancia observada) y la §3.4 puntos 1, 2 y 12.

Invariante de partida, tomado del código (NO lo cambies sin decidirlo
explícitamente conmigo):
Net worth = Total assets + Signed liabilities

OJO, esto es lo primero que debes entender antes de tocar nada: la cifra de
Liabilities que se muestra en pantalla es Math.max(0, -balance)
(getDisplayedLiabilityBalance en net-worth/page.tsx:90), mientras que el cálculo
real es totalAssets + signedLiabilities (línea 118). Un pasivo con saldo a favor
—una tarjeta sobrepagada— suma su crédito al net worth pero aporta 0 al total de
Liabilities mostrado. Esa es la causa raíz de la discrepancia de la §3.3 del
backlog, y cuadra al centavo en los tres meses observados.

Por lo tanto el net worth NO está mal calculado: sumar un saldo a favor al
patrimonio es correcto. Lo que falla es la presentación. Si fuerzas
Net worth = Assets - Liabilities al centavo, expulsas un crédito legítimo del
patrimonio. Tu trabajo es decidir y documentar el invariante, y hacer que las
tres pantallas coincidan con él, no "corregir" el número.

Hipótesis de causa raíz ya localizada, confírmala antes de actuar: las tres
pantallas llaman la misma RPC get_account_balances pero agregan con tres
reducciones de JS distintas y no compartidas:
  - summarizeBalances() en src/app/dashboard/net-worth/page.tsx:95
  - cálculo inline (sumBase / totalAssets / signedLiabilities) en
    src/app/dashboard/page.tsx:432
  - una tercera reducción con su propio tipo AccountBalance en
    src/app/dashboard/accounts/page.tsx:63

Investiga, con evidencia:
- Qué cuentas entran en cada métrica.
- Cuentas activas frente a archivadas (is_archived ya se filtra en la RPC
  as-of por BR-004; ver docs/features/net-worth-fx-policy.md).
- El flag include_in_net_worth y dónde se aplica realmente.
- Saldos de tarjeta de crédito positivos y negativos.
- Cuentas de préstamo, efectivo e inversión.
- Snapshots de balance actual frente a histórico, y qué p_as_of_date pasa cada
  pantalla.
- Moneda base, y fecha/fuente de FX.
- Convenciones de redondeo y de signo.
- Si Accounts total y Dashboard Net worth pretenden ser idénticos o representan
  conceptos distintos. Si son distintos, deben quedar etiquetados como tales en
  la UI.

Crea un único servicio autoritativo de valoración en src/lib/ y haz que las tres
pantallas lo usen. No parchees números en componentes de React.

Política de FX vigente, tomada de la migración aplicada
supabase/migrations/20260817120000_balance_fx_revaluation.sql: los STOCKS (los
saldos de cuenta a una fecha) se revalúan a la tasa vigente en esa fecha, y solo
caen a la suma histórica por entry cuando el household no tiene tasa para el par.
Los FLUJOS (income, expense, budget) conservan la tasa de su propia fecha.
Preserva ese comportamiento: el servicio autoritativo que crees debe coincidir
con las RPC, no revertirlas.

ATENCIÓN: docs/features/net-worth-fx-policy.md describe la política ANTERIOR a
esa migración ("no revalúa con tasas de cierre de mes") y está desactualizado.
No lo tomes como fuente. Corregir ese documento es parte de la entrega de este
ticket.

Añade tests que cubran:
- Solo assets.
- Solo liabilities.
- Assets y liabilities mezclados.
- Tarjeta de crédito con deuda.
- Tarjeta de crédito con saldo a favor.
- Cuenta archivada.
- Cuenta excluida de net worth.
- Cuentas en CAD y en COP.
- Mes actual y mes histórico.
- Reconciliación exacta al centavo.

Si RUM-010a aún no ha aterrizado el runner de tests, dilo explícitamente y
escribe los casos como invariantes SQL en supabase/tests/ siguiendo el patrón de
br_003_006_money_invariants.sql.

No hagas una migración de esquema salvo que el modelo actual no pueda expresar
el contrato correcto. Si hace falta una migración, detente primero y explica la
migración aditiva propuesta y su rollback.

Entrega: causa raíz, definiciones finales de cada métrica, archivos modificados,
tests y resultados, ejemplos de reconciliación, y confirmación de que Dashboard,
Accounts y Net worth son consistentes o están claramente etiquetados cuando la
diferencia es intencional.
```

---

### RUM-005 — Descomponer y optimizar carga del Dashboard

**Prioridad:** P0 · **Tipo:** Full-stack/performance · **Tamaño:** M/L · **Dependencias:** RUM-001, RUM-002

#### Problema

El Dashboard tarda ~3–3.25 s incluso al regresar a él. **Causa confirmada**
(§3.4 #7): `src/app/dashboard/page.tsx` es un único Server Component sin
`Suspense` que hace ~16 round-trips por carga, de los cuales **8 son `await`
estrictamente secuenciales** (`:276-310`): `get_account_balances` ×2,
`get_monthly_dashboard_summary` ×2, `get_monthly_expenses_by_category`,
`categories`, `get_monthly_budget_details` y un `count` de transactions. Solo las
5 últimas están paralelizadas (`:312-318`). Nada se renderiza hasta que las 16
terminan.

Es el mejor trade-off del backlog: causa localizada, arreglo barato, sin tocar
reglas financieras.

#### Widgets y su ubicación actual

Casi todo vive en el mismo archivo de 1.600+ líneas; no hay subcomponentes por
widget.

| Widget | Ubicación |
|---|---|
| Month health | inline `page.tsx:810-850` + `src/lib/health/score.ts` |
| Insights | inline `page.tsx:547-610` + `src/components/insight-card.tsx` |
| Upcoming payments | datos en `page.tsx:313`, render `:590` y `:904-906` |
| Review queue | `needsReviewCount` en `page.tsx:317`, render `:1042-1047` |
| Budget | inline `page.tsx:831-892` + `src/components/category-donut.tsx` |
| Debts | inline `page.tsx:981-986` |
| Goals | inline `page.tsx:1011-1014` |
| Recent activity | `src/components/recent-activity.tsx`, usado en `page.tsx:1053` |

#### Alcance

- Paralelizar las 8 llamadas secuenciales que sean independientes entre sí.
- Cargar primero Net worth y métricas mensuales.
- Hacer streaming/deferred loading de los módulos inferiores con `Suspense`.
- Evitar recalcular el mismo agregado para varios widgets.
- Reutilizar el contrato de valoración de RUM-002.
- Definir granularidad de cache e invalidación por mutación.

#### Criterios de aceptación

- El top-of-fold no espera Budget, Insights, Debts, Goals ni Recent activity.
- Ninguna de las 8 llamadas de `:276-310` sigue siendo secuencial sin una
  dependencia real que lo justifique y esté comentada.
- No hay consultas duplicadas para la misma métrica y periodo.
- Cada widget puede mostrar loading/error sin bloquear la pantalla entera.
- La segunda visita puede usar datos existentes mientras revalida.
- Las mutaciones invalidan únicamente los datos afectados.
- Before/after documentado con los números de RUM-001.

#### Prompt listo para pegar

```text
Trabaja en el ticket "RUM-005" de Rumbo directamente sobre este repositorio.

Sigue el Contrato de ejecución de la §4 de docs/performance-ux-backlog.md.
Usa las mediciones de RUM-001 y el contrato financiero de RUM-002. Lee la §3.4
punto 7 y la tabla de widgets de la sección RUM-005.

Causa raíz ya confirmada: src/app/dashboard/page.tsx es un único Server
Component sin Suspense, con ~16 round-trips por carga. Ocho de ellos son await
estrictamente secuenciales en las líneas 276-310 (get_account_balances x2,
get_monthly_dashboard_summary x2, get_monthly_expenses_by_category, categories,
get_monthly_budget_details, count de transactions). Solo cinco están
paralelizados en las líneas 312-318. Nada se renderiza hasta que terminan todos.

Prioriza el top-of-fold:
- Mes seleccionado.
- Net worth, Assets y Liabilities.
- Income, Expenses, Savings y Savings rate.

Los módulos secundarios (Month health, Budget, desglose por categoría, actividad
programada, Insights, Debts, Goals y Recent activity) no deben bloquear el
render del top-of-fold.

Requisitos:
- Paraleliza las operaciones de servidor independientes. Para cada await que
  dejes secuencial, comenta la dependencia real que lo obliga.
- Reutiliza agregados compartidos en vez de recalcularlos por widget.
- Usa streaming o carga diferida para las secciones secundarias con los patrones
  de Next.js que el repositorio ya soporta.
- Da a cada módulo su propio estado de loading, error y vacío.
- Extrae widgets a subcomponentes solo donde sea necesario para el streaming; no
  conviertas esto en una refactorización total del archivo.
- Preserva los límites de household y RLS.
- Define claves de cache seguras que incluyan household, periodo, contexto de
  moneda y filtros relevantes.
- Define invalidación selectiva tras cambios de transacción, cuenta, presupuesto
  y deuda.
- No caches los datos de un household bajo la clave de otro.
- No sacrifiques frescura financiera sin documentar el trade-off.

Mide navegación fría y caliente antes y después. Añade tests de cambio de
household, cambio de periodo, respuestas obsoletas e invalidación. Reporta
archivos modificados, timings y riesgos residuales.
```

---

### RUM-003 — Formalizar periodos históricos, FX y precisión decimal

> ✅ **Hecho el 2026-09-22.** Alcance real, más acotado que el título: el
> fallback silencioso de `fetchFxRate` a `'latest'`, el snapshot de balances
> del mes actual (usaba fin de mes en vez de hoy), y la duplicación de
> `roundToCents`. UTC y la extensión de `monthStartDay` quedan como
> decisiones documentadas, no implementadas — ninguna migración en este
> ticket. Ver la entrada RUM-003 en
> [`performance-ux-execution-status.md`](./performance-ux-execution-status.md),
> [`fx-rate-resolution.md`](./features/fx-rate-resolution.md) y
> [`period-semantics.md`](./features/period-semantics.md).

**Prioridad:** P0 · **Tipo:** Integridad financiera/multi-currency · **Tamaño:** L · **Dependencia:** RUM-002

#### Problema

Los valores históricos deben ser reproducibles. El riesgo mayor **no** es el que
suponía el diagnóstico original. Lo confirmado (§3.4):

1. **El fallback de FX rompe la reproducibilidad** (#11): `fetchFxRate`
   (`src/lib/fx.ts:9-49`) consulta un CDN externo
   (`@fawazahmed0/currency-api`) y, si el archivo del día histórico falla, **cae
   a `'latest'`**. La misma transacción histórica puede resolver una tasa
   distinta en dos ejecuciones, y el fallo es silencioso.
2. **No hay tipo decimal** (#10): ni `decimal.js` ni `big.js`; `fx.ts` usa
   `number` nativo. Falta confirmar si los agregados en SQL usan `numeric`.
3. **Los límites de periodo son UTC a propósito** (#12), documentado en
   `src/lib/periods/month.ts:32` y `transaction-period.ts:51-53`. **No es un
   descuido**; cambiarlo a timezone de household es una decisión de producto, no
   un bugfix.
4. **`monthStartDay` solo aplica a `/dashboard/reports`** (#13). Las RPC
   mensuales (dashboard, budgets, month closures) usan `date_trunc('month',
   ...)`. Esa inconsistencia es real y es candidata de este ticket — pero su
   alcance es **BR-036 slice 2**, ya descrito en
   [features/month-start-day.md](./features/month-start-day.md).
   **Transactions queda fuera**: no usa `date_trunc` en ningún sitio, resuelve
   sus límites desde la URL con `transaction-period.ts` (PR #66) y `AGENTS.md`
   lo registra como *a separate concern, not a duplicate*. Meterlo aquí
   pisaría el comportamiento de periodo recién unificado y su compatibilidad
   con los enlaces antiguos.
5. `src/lib/calc.ts` **no** tiene relación con el redondeo de dinero (#9): es el
   evaluador de la calculadora del teclado numérico.

#### Alcance

- Eliminar o hacer explícito el fallback silencioso a `'latest'`.
- Definir el comportamiento cuando falta una tasa de FX.
- Definir `asOf` para meses actuales e históricos.
- Decidir, como producto, si los límites de periodo siguen en UTC o pasan a
  timezone del household. **Documentar la decisión sea cual sea.**
- Decidir si `monthStartDay` debe extenderse más allá de Reports.
- Centralizar el redondeo en un único lugar.
- Evaluar si hace falta un tipo decimal o si basta con delegar la suma a
  `numeric` en SQL.
- Asegurar que Dashboard, Transactions, Accounts y Reports usan el mismo
  contrato.

#### Criterios de aceptación

- Una tasa histórica resuelve el mismo valor en dos ejecuciones distintas, o el
  fallo es visible y trazable.
- Mes actual: flujos desde el inicio del mes hasta ahora; snapshot a la fecha
  actual.
- Mes histórico: mes calendario completo; snapshot al cierre del último día.
- La política de límites de fecha está documentada y es la misma en todas las
  pantallas, o las diferencias están justificadas por escrito.
- Los agregados reconcilian al centavo.
- No aparecen `NaN`, `Infinity` ni diferencias por redondeo de componentes.

#### Prompt listo para pegar

```text
Trabaja en el ticket "RUM-003" de Rumbo directamente sobre este repositorio.

Sigue el Contrato de ejecución de la §4 de docs/performance-ux-backlog.md.
Lee la §3.4 puntos 9, 10, 11, 12 y 13, y
docs/features/net-worth-fx-policy.md, docs/features/exchange-rates.md y
docs/features/month-start-day.md.

Riesgo principal ya localizado: fetchFxRate en src/lib/fx.ts:9-49 consulta un
CDN externo (@fawazahmed0/currency-api) y cae silenciosamente a 'latest' cuando
el archivo del día histórico falla. Eso rompe la reproducibilidad histórica sin
avisar. Empieza por ahí.

Correcciones al diagnóstico original que debes respetar:
- src/lib/calc.ts es el evaluador de la calculadora del teclado numérico. No
  tiene relación con el redondeo de dinero. No lo toques por ese motivo.
- Los límites de periodo usan UTC de forma deliberada y comentada
  (src/lib/periods/month.ts:32 y transaction-period.ts:51-53). No es un bug
  silencioso. Cambiarlo a timezone de household es una decisión de producto:
  detente y propónmela antes de implementarla.
- monthStartDay existe pero hoy solo lo consume /dashboard/reports; las RPC
  mensuales (dashboard, budgets, month closures) usan date_trunc('month', ...).
  Esa inconsistencia sí es candidata de este ticket, y su alcance es BR-036
  slice 2 (ver docs/features/month-start-day.md).
- NO metas Transactions en ese trabajo. No usa date_trunc en ningún sitio:
  resuelve sus límites desde la URL con transaction-period.ts, que AGENTS.md
  registra explícitamente como "a separate concern, not a duplicate" de
  periods/month.ts. Cambiar sus presets pisaría el periodo unificado de PR #66 y
  la compatibilidad con los enlaces antiguos, y requiere una decisión de
  producto aparte.

Define y centraliza:
1. Qué ocurre cuando falta una tasa de FX. El fallo debe ser explícito y
   trazable, nunca un fallback silencioso.
2. Semántica del mes actual: desde el inicio del mes hasta ahora, snapshot a
   ahora.
3. Semántica del mes histórico: mes calendario completo, snapshot al cierre.
4. Política de FX histórica para transacciones y para saldos de cuenta,
   coherente con docs/features/net-worth-fx-policy.md.
5. Reglas de redondeo y de unidad mínima, en un solo lugar.
6. Si hace falta un tipo decimal en JS o basta con delegar la suma a numeric en
   SQL. Justifica la decisión con evidencia, no por costumbre.

Asegura que Dashboard, Transactions, Accounts y Reports usan utilidades y
definiciones compatibles. Nunca revalúes flujos históricos con la tasa de hoy a
menos que esa sea la regla de producto documentada.

Añade tests de límites de mes, cambios de horario de verano, CAD/COP, tasas
faltantes, valores negativos, orden de agregación y reconciliación al centavo.

No modifiques esquema ni datos históricos sin presentarme primero un plan de
migración/backfill aditivo con rollback. Reporta definiciones finales, archivos
modificados, cualquier propuesta de migración y riesgos residuales.
```

---

### RUM-006 — Reducir llamadas repetidas de balances (Accounts y Net worth)

> ✅ **Performance hecha y migración aplicada el 2026-09-21.** Nueva función
> `get_account_balances_as_of_many`, y las tres pantallas movidas a ella: Net
> worth 7→1 llamadas, Dashboard 2→1, Accounts 2→1. Medido contra producción,
> verificado fila por fila contra ambos overloads existentes —
> `npm run db:test -- --file=rum_006` pasa 5/5 contra la función real, ya
> aplicada. Registro completo en
> [`performance-ux-execution-status.md`](./performance-ux-execution-status.md)
> §4. El criterio "reconcilia con el contrato de RUM-002" ya se satisface:
> RUM-002 (2026-09-21) centralizó ese contrato en
> `src/lib/net-worth/valuation.ts` y las pantallas que este ticket toca ya lo
> usan. De paso, este ticket desbloqueó `npm run db:test` para toda la suite
> (nuevo flag `--user`), lo que reveló un hallazgo preexistente y no
> relacionado — `docs/pending-work.md` §7.

**Prioridad:** P1 · **Tipo:** Backend/performance · **Tamaño:** M · **Dependencias:** RUM-001, RUM-002

#### Problema

**Re-scoped tras §3.4.** La hipótesis original —una query por cuenta— es falsa:
`get_account_balances(p_household_id, p_as_of_date)` es una RPC agregada que
trae todas las cuentas del household en una llamada (#3).

El N+1 real es **por mes, no por cuenta** (#4):

- `src/app/dashboard/net-worth/page.tsx:288-302` llama `get_account_balances`
  **7 veces** (mes seleccionado + 6 meses de evolución) dentro de un
  `Promise.all` — paralelo, pero 7 round-trips a Postgres en cada carga.
- El Dashboard la llama 2 veces (`page.tsx:276` y `:297`).

Cada llamada re-escanea el ledger desde el origen para calcular su snapshot.
Accounts tarda ~1.5 s con 22 cuentas: RUM-001 debe atribuir ese tiempo antes de
optimizar.

#### Alcance

- Medir lista, balances, total y FX en las tres pantallas.
- Evaluar una RPC que acepte varias fechas `as-of` y devuelva todos los snapshots
  en una sola llamada.
- Confirmar que el coste crece con el tamaño del ledger, no con el número de
  cuentas.
- Conservar moneda original y base amount.
- Reutilizar la valoración autoritativa de RUM-002.
- Revisar archived, vistas grouped/list y el orden manual.

#### Criterios de aceptación

- El número de llamadas a `get_account_balances` por carga de Net worth baja de
  7 a un número acotado y justificado.
- El número de queries no crece linealmente con el número de cuentas
  (ya se cumple; añadir una prueba que lo fije).
- Total balance reconcilia con sus componentes y con el contrato de RUM-002.
- No se pierde el orden configurado de cuentas (`@dnd-kit`).
- CAD/COP e inversiones conservan presentación y exactitud.
- Before/after documentado.

#### Prompt listo para pegar

```text
Trabaja en el ticket "RUM-006" de Rumbo directamente sobre este repositorio.

Sigue el Contrato de ejecución de la §4 de docs/performance-ux-backlog.md.
Usa las mediciones de RUM-001 y el contrato de valoración de RUM-002/RUM-003.
Lee la §3.4 puntos 3 y 4.

Corrección importante al diagnóstico original: NO hay N+1 por cuenta. La RPC
get_account_balances(p_household_id, p_as_of_date) es agregada y trae todas las
cuentas del household en una sola llamada. No pierdas tiempo buscando ese
patrón.

El N+1 real es por mes:
- src/app/dashboard/net-worth/page.tsx:288-302 llama get_account_balances 7
  veces (mes seleccionado + 6 meses de evolución) dentro de un Promise.all.
- El Dashboard la llama 2 veces: src/app/dashboard/page.tsx:276 y :297.
Cada llamada re-escanea el ledger desde el origen para su snapshot.

Requisitos:
- Determina con EXPLAIN si el coste de cada llamada crece con el tamaño del
  ledger. Si es así, evalúa una RPC que acepte un array de fechas as-of y
  devuelva todos los snapshots en una sola llamada, o una agregación incremental.
- Trae metadatos y balances de cuentas en un número acotado de operaciones de
  servidor.
- Preserva la moneda original de la cuenta y su equivalente en moneda base.
- Preserva el orden de cuentas, las vistas grouped/list, el comportamiento de
  archivadas y los permisos de cuenta.
- Asegura que Total balance reconcilia con las filas devueltas bajo el contrato
  documentado en RUM-002.
- Mantén RLS y aislamiento por household.
- Añade índices solo con evidencia de EXPLAIN, mediante migraciones aditivas con
  rollback. Recuerda: prepara la migración, no la apliques contra remoto.
- Prueba con 0, 1, 22 y un número alto de cuentas; CAD/COP; tarjetas de crédito
  positivas y negativas; cuentas archivadas y excluidas; y snapshots históricos.

Reporta número de queries y latencia antes/después, planes, payloads, archivos
modificados, tests y riesgos.
```

---

### RUM-007 — Cache, prefetch y continuidad de loading states

**Prioridad:** P1 · **Tipo:** Frontend/full-stack performance · **Tamaño:** M
**Dependencia:** RUM-001; coordinar con RUM-004, RUM-005 y RUM-006

#### Problema

La app muestra feedback inicial, pero en algunas rutas el skeleton desaparece
antes de que el contenido esté disponible, y regresar a Home vuelve a producir
varios segundos de espera.

**Contexto confirmado** (§3.4 #14, #15): no hay React Query, SWR ni
`unstable_cache` en el repo. La única invalidación es `revalidatePath` en los
`actions.ts`, que es el patrón estándar de server actions y no un sistema de
cache. Existen 17 `loading.tsx`; **faltan** en `assistant/`, `cash-flow/`,
`debt-planner/`, `coming-soon/`, `help/`, `month-review/`, `more/`, `plan/`,
`reports/`, `settings/` y `trends/`.

#### Alcance

- Mantener skeleton o datos previos hasta success o error.
- Eliminar la pantalla vacía intermedia.
- Añadir los `loading.tsx` que faltan en las 11 rutas listadas.
- Prefetch de las pestañas principales cuando sea seguro.
- Reutilizar datos recientes durante la revalidación.
- Definir stale time e invalidación selectiva.
- Proteger la cache por household, periodo, moneda y filtros.
- Evitar race conditions al cambiar mes o household rápidamente.

#### Criterios de aceptación

- Nunca existe un estado sin contenido, skeleton o error.
- El tab activo responde inmediatamente.
- Las reentradas calientes muestran contenido anterior inmediatamente o dentro
  del presupuesto de §RUM-001.
- No aparece información de otro household durante las transiciones.
- Los resultados obsoletos no reemplazan una selección más reciente.
- Las mutaciones reflejan cambios mediante invalidación controlada.

#### Prompt listo para pegar

```text
Trabaja en el ticket "RUM-007" de Rumbo directamente sobre este repositorio.

Sigue el Contrato de ejecución de la §4 de docs/performance-ux-backlog.md.
Lee la §3.4 puntos 14 y 15.

Contexto confirmado: el repositorio NO usa React Query, SWR ni unstable_cache.
La única invalidación es revalidatePath en los actions.ts. No introduzcas una
librería de datos nueva a menos que la arquitectura actual no pueda cumplir los
requisitos, y en ese caso explícame primero el trade-off.

Arregla la secuencia observada: skeleton -> pantalla vacía -> contenido.

Requisitos:
- Una ruta siempre debe mostrar contenido previo, un skeleton, un estado vacío
  explícito o un error.
- Añade los loading.tsx que faltan. Existen 17; faltan en assistant/,
  cash-flow/, debt-planner/, coming-soon/, help/, month-review/, more/, plan/,
  reports/, settings/ y trends/.
- Mantén visibles los datos válidos previos durante la revalidación en segundo
  plano cuando sea financieramente seguro.
- Haz prefetch de las tres pestañas principales usando el comportamiento
  soportado por Next.js.
- Usa claves de cache que incluyan household, periodo, moneda base y filtros.
- Evita cualquier fuga de cache entre households.
- Ignora o cancela respuestas obsoletas cuando el mes o el household cambian
  rápido.
- Define invalidación selectiva tras crear, editar, anular, transferir o cambiar
  cuentas.
- Preserva la frescura en las mutaciones financieras.
- Añade anuncios de carga accesibles sin ruido excesivo para lectores de
  pantalla.

Mide navegación fría y caliente antes y después. Prueba cambio rápido de
pestaña, cambio rápido de mes, comportamiento offline y de error, cambio de
household e invalidación por mutación. Reporta decisiones de arquitectura y
riesgos restantes.
```

---

### RUM-004 — Optimizar consultas de Transactions

**Prioridad:** P2 · **Tipo:** Backend/performance · **Tamaño:** M · **Dependencia:** RUM-001

#### Problema

El primer acceso a Transactions tarda ~4.25 s. **La causa asumida quedó
refutada** (§3.4 #5, #6):

- La pantalla **sí** pagina en servidor: RPC única
  `search_household_transactions` con `p_limit`/`p_offset` y `PAGE_SIZE = 50`
  (`src/app/dashboard/transactions/page.tsx:715-742`).
- El rango de fechas **sí** se aplica en SQL, resuelto por
  `src/lib/periods/transaction-period.ts`.
- `total_count` viene **en la misma fila** del RPC (`:759`), no es una llamada
  aparte.
- Los cuatro lookups (accounts/categories/payees/tags) van en **un solo round
  trip** (`:592`).

Es decir: no se descarga el historial completo y no hay tres llamadas separadas.
Los 4.25 s vienen de otro sitio. **Este ticket no debe empezar hasta que RUM-001
diga dónde.** Por eso baja a P2.

#### Alcance

- Atribuir los 4.25 s con la evidencia de RUM-001 antes de cambiar nada.
- Revisar el plan de `search_household_transactions` con `EXPLAIN (ANALYZE,
  BUFFERS)` sobre el dataset real de varios años.
- Revisar los joins internos de la RPC (accounts, categories, payees,
  allocations, tags).
- Confirmar que selecciona solo los campos usados.
- Revisar índices alineados con household, fecha, status y joins.
- Evaluar keyset vs offset **solo si** la profundidad de página real lo justifica.

#### Criterios de aceptación

- La causa raíz de los 4.25 s está documentada con evidencia, no supuesta.
- List, summary y count tienen planes documentados.
- No existen consultas por fila.
- La lista y los agregados respetan los mismos filtros.
- Transferencias y voids conservan su semántica.
- Se reporta mejora before/after con el dataset grande.
- No se debilita RLS.

#### Prompt listo para pegar

```text
Trabaja en el ticket "RUM-004" de Rumbo directamente sobre este repositorio.

Sigue el Contrato de ejecución de la §4 de docs/performance-ux-backlog.md.
Usa las mediciones de RUM-001. Lee la §3.4 puntos 5 y 6.

ANTES DE OPTIMIZAR NADA: la causa raíz asumida originalmente está refutada. La
pantalla ya hace todo esto bien:
- Pagina en servidor con la RPC única search_household_transactions, con
  p_limit/p_offset y PAGE_SIZE = 50
  (src/app/dashboard/transactions/page.tsx:715-742).
- Aplica el rango de fechas en SQL, resuelto por
  src/lib/periods/transaction-period.ts.
- Devuelve total_count en la misma fila del RPC (línea 759), sin llamada aparte.
- Resuelve los cuatro lookups (accounts/categories/payees/tags) en una sola ola
  concurrente (líneas 596-631). Cuidado: el comentario del código dice "one
  round trip" y es impreciso — son CUATRO requests HTTP en paralelo. Instrumenta
  los cuatro por separado; contarlos como uno esconde tres operaciones de red y
  de base de datos dentro de los 4.25 s.

No reimplementes nada de lo anterior. Los 4.25 s vienen de otro sitio y tu
primera tarea es atribuirlos con la evidencia de RUM-001. Si RUM-001 no está
hecho, detente y dímelo.

Una vez atribuido el tiempo:
- Ejecuta EXPLAIN (ANALYZE, BUFFERS) sobre search_household_transactions con el
  dataset real de varios años.
- Revisa los joins internos de la RPC: entries, allocations, accounts,
  categories, payees, tags.
- Confirma que selecciona solo las columnas que la UI usa.
- Revisa índices alineados con household_id, fecha, status y los joins.
- Añade un índice solo cuando EXPLAIN demuestre que sirve; usa migración
  aditiva con rollback y no la apliques contra remoto.
- Compara paginación offset frente a keyset solo si los datos de profundidad de
  página real lo justifican.
- Preserva el vínculo de transferencias, la semántica de void, el linaje de
  opening balances y los importes multi-moneda.
- Mantén RLS como autoridad.

Evalúa los objetivos contra el baseline medido, incluyendo navegación fría y
caliente con el dataset de varios años.

Entrega timings antes/después, planes de consulta, tamaños de payload, archivos
modificados, migraciones si las hay, tests y riesgos residuales.
```

---

### RUM-008 — Simplificar arquitectura de información del Dashboard

**Prioridad:** P2 · **Tipo:** Product/UI · **Tamaño:** M · **Dependencia:** RUM-002

#### Problema

El Dashboard contiene demasiadas secciones consecutivas y varios empty states.
Se siente como un catálogo de funciones en lugar de un resumen accionable. La
lista de widgets y sus ubicaciones está en la tabla de RUM-005.

#### Jerarquía propuesta

1. Periodo y posición financiera.
2. Income, Expenses, Savings y Savings rate.
3. Obligaciones o actividad programada que requiere atención.
4. Una o dos señales accionables.
5. Recent activity limitada.
6. Módulos sin configuración, agrupados en un bloque compacto o fuera de Home.

#### Criterios de aceptación

- El top-of-fold responde: cuánto tengo, cómo fue el mes y qué requiere atención.
- No aparecen múltiples tarjetas vacías consecutivas.
- Recent activity no intenta reemplazar Transactions.
- El copy usa el mes seleccionado, no siempre `This month`.
- El Dashboard se mantiene usable en 320, 375 y 430 px.
- No se altera ninguna lógica financiera durante el rediseño.

#### Prompt listo para pegar

```text
Trabaja en el ticket "RUM-008" de Rumbo directamente sobre este repositorio.

Sigue el Contrato de ejecución de la §4 de docs/performance-ux-backlog.md.
Lee la tabla de widgets de la sección RUM-005: te dice dónde vive cada módulo.
Si RUM-005 ya extrajo widgets a subcomponentes, trabaja sobre esa estructura.

Objetivo: simplificar la arquitectura de información del Dashboard SIN cambiar
ningún cálculo financiero.

Preserva el lenguaje visual establecido de Rumbo: header, selector de household
en la app bar, bottom navigation y botón central de añadir.

Reorganiza Home alrededor de:
1. Periodo mensual seleccionado.
2. Net worth / Assets / Liabilities.
3. Income / Expenses / Savings / Savings rate.
4. Actividad programada u obligaciones que requieren atención.
5. Un número pequeño de insights accionables.
6. Actividad reciente limitada, con enlace a Transactions.

Requisitos:
- No muestres varios módulos vacíos de tamaño completo en secuencia.
- Consolida los módulos de Budget/Debt/Goal sin configurar en una sola zona
  compacta de setup, o sácalos de Home manteniéndolos accesibles en otro sitio.
- Usa el nombre del mes seleccionado en vez de una etiqueta estática
  'This month'. Pasa el texto nuevo por la skill i18n-scribe; no edites los
  diccionarios a mano.
- No dupliques la funcionalidad completa de Transactions.
- Mantén el comportamiento responsive desde 320px y el contraste y tamaño de
  áreas táctiles accesibles.
- Aísla los estados de loading, error y vacío por módulo.
- No modifiques esquema de base de datos, reglas de ledger ni cálculos.

Entrega capturas antes/después en modo oscuro y claro, archivos modificados,
comprobaciones de accesibilidad, tests y resultado del build.
```

---

### RUM-009 — Corregir semántica de Month health, Insights y módulos secundarios

**Prioridad:** P2 · **Tipo:** Product logic/UX · **Tamaño:** M · **Dependencias:** RUM-002, RUM-008

#### Problema

Varias funciones se leen como opacas o inconsistentes:

- `Month health: B / 66` no explica su fórmula en pantalla.
- `Insights LIVE` usa una etiqueta poco informativa.
- El insight de deuda puede no coincidir con el Debt Planner.
- `Upcoming payments` mezcla ingresos y gastos; el nombre no corresponde.
- `Review queue` muestra un backlog histórico enorme sin contexto.

**Corrección importante** (§3.4 #8): **la fórmula de Month health sí existe y
está documentada**. `src/lib/health/score.ts` documenta el cálculo (líneas 1-18)
y exporta `HEALTH_SAVINGS_WEIGHT = 0.65`, `HEALTH_BUDGET_WEIGHT = 0.35`, los
umbrales de savings (−20 %→0, 0 %→50, +20 %→100), los de budget (≤100 %
usado→100, degradando a 0 en 150 %) y los grados en `healthGrade()`. Además hay
un tooltip (`page.tsx:811` vía `dashboard.healthScoreTooltip`).

El problema real **no** es que la fórmula falte, sino que **no se muestra el
desglose numérico**: el usuario ve una nota sin saber qué la produjo. Este ticket
es de exposición, no de invención. **No inventes una fórmula nueva ni elimines el
score sin una razón mejor que "parece opaco".**

#### Decisiones requeridas

- Exponer el desglose de Month health (entradas, pesos, umbrales, acciones), no
  reemplazar la fórmula.
- Retirar `LIVE` salvo que represente una actualización real documentada.
- Diferenciar las liabilities de cuenta de los registros del Debt Planner.
- Renombrar `Upcoming payments` a `Scheduled activity` cuando incluya ingresos.
- Ocultar o degradar `Review queue` si no forma parte del flujo principal.

#### Criterios de aceptación

- Ninguna puntuación aparece sin una explicación accesible y con números.
- Los insights son deterministas, trazables y accionables.
- No hay contradicción visible entre la deuda de cuentas y el Debt Planner.
- El nombre de Scheduled activity coincide con su contenido.
- Review queue tiene contexto, acción y reglas de visibilidad.

#### Prompt listo para pegar

```text
Trabaja en el ticket "RUM-009" de Rumbo directamente sobre este repositorio.

Sigue el Contrato de ejecución de la §4 de docs/performance-ux-backlog.md.
Lee la §3.4 punto 8 antes de tocar Month health.

CORRECCIÓN AL DIAGNÓSTICO ORIGINAL: la fórmula de Month health sí existe y está
documentada en src/lib/health/score.ts (docstring en las líneas 1-18), con pesos
exportados HEALTH_SAVINGS_WEIGHT = 0.65 y HEALTH_BUDGET_WEIGHT = 0.35, umbrales
de savings (-20% -> 0, 0% -> 50, +20% -> 100), umbrales de budget (<=100% usado
-> 100, degradando a 0 en 150%) y grados en healthGrade(). Ya hay un tooltip en
src/app/dashboard/page.tsx:811. El score también lo consume month-review.

El problema real es que el desglose numérico no se muestra, no que la fórmula
falte. No inventes una fórmula nueva, no uses un valor generado por IA y no
elimines el score. Expón lo que ya se calcula:
- Muestra las entradas, el peso de cada una y el umbral aplicado.
- Añade acciones claras derivadas del componente más débil.
- Mantén score.ts como única fuente: dashboard y month-review deben seguir
  coincidiendo.

Para Insights:
- Haz cada insight determinista y trazable a agregados concretos.
- Quita el badge decorativo LIVE salvo que exista comportamiento de
  actualización en vivo real.
- Añade una acción relevante cuando sea posible.

Para deuda:
- Distingue explícitamente las liabilities de cuenta de los registros del Debt
  Planner.
- No digas 'sin deuda' mientras se reporta movimiento de deuda sin explicar la
  distinción.

Para elementos programados:
- Renombra Upcoming payments a Scheduled activity si incluye ingresos y gastos.
- Preserva signos, fechas de vencimiento y semántica de recurrencia.
- Pasa el texto nuevo por la skill i18n-scribe; no edites los diccionarios a
  mano.

Para Review queue:
- No muestres un conteo histórico enorme en Home sin contexto y sin una acción
  útil.
- Preserva los datos de revisión subyacentes; cambia solo visibilidad y
  comportamiento de producto.

Añade tests unitarios para cada insight y métrica determinista. No añadas IA
generativa ni llamadas externas. Entrega definiciones finales, cambios de UI y
capturas.
```

---

### RUM-010b — Suite de regresión, carga y release gate

**Prioridad:** P0 transversal · **Tipo:** QA/reliability · **Tamaño:** M/L
**Dependencias:** RUM-010a primero; se completa después de los demás tickets

#### Alcance

- Crear fixtures representativos de varios años.
- Probar datasets pequeños y grandes.
- Cubrir los invariantes financieros de §2.
- Cubrir cold/warm navigation e invalidación de cache.
- Establecer un release checklist con métricas before/after.
- Verificar RLS y household switching.

#### Dataset de prueba recomendado

- 2 households.
- 3–4 años de transactions.
- Miles de transactions y allocations.
- 20–30 accounts.
- CAD y COP.
- Transfers, opening balances, voids y reversals.
- Credit cards con saldo positivo y negativo.
- Accounts activas, archivadas y excluidas.
- Escenario controlado de FX faltante.
- Scheduled transactions, budgets, debts y goals opcionales.

#### Criterios de aceptación

- Todos los invariantes de §2 tienen pruebas automatizadas.
- Se documentan p75/p95 before/after.
- No hay cross-household leakage.
- El build de producción termina correctamente.
- El release no se aprueba si las cifras no reconcilian.
- No se aprueba una optimización que solo oculte la demora.

#### Prompt listo para pegar

```text
Trabaja en el ticket "RUM-010b" de Rumbo directamente sobre este repositorio.

Sigue el Contrato de ejecución de la §4 de docs/performance-ux-backlog.md.
RUM-010a debe estar terminado antes de empezar este ticket: si no hay runner de
tests instalado, detente y dímelo.

Reutiliza el stack de tests elegido en RUM-010a y los 5 archivos de invariantes
SQL de supabase/tests/ (ver docs/features/financial-correctness-checks.md). No
introduzcas un stack de tests paralelo.

Crea fixtures representativos con:
- Dos households aislados.
- Tres a cuatro años de historial de transacciones.
- Miles de transactions, entries y allocations.
- 20 a 30 cuentas.
- CAD y COP.
- Transferencias, opening balances, voids y reversals.
- Tarjetas de crédito con deuda y con saldo a favor.
- Cuentas activas, archivadas y excluidas.
- FX histórico y un caso controlado de tasa faltante.

Los fixtures no pueden contener datos financieros reales del usuario. Genéralos.

Automatiza pruebas para:
- El invariante de net worth tal y como RUM-002 lo haya dejado decidido y
  documentado. El de partida es Net worth = Total assets + Signed liabilities.
  NO escribas un test que afirme Net worth = Assets - Liabilities: la cifra de
  Liabilities que se muestra es max(0, -balance), así que ese test fallaría —
  correctamente — en cuanto un pasivo tenga saldo a favor. Incluye un caso
  explícito de tarjeta sobrepagada.
- Savings = Income - Expenses.
- Comportamiento de savings rate con ingreso cero.
- Neutralidad de las transferencias.
- Exclusión de las transacciones anuladas.
- Aislamiento por household y RLS.
- Límites de mes actual e histórico.
- Reconciliación entre Dashboard, Accounts y Net worth.
- Consistencia entre lista, summary y count de Transactions.
- Claves de cache e invalidación.
- Cambio rápido de pestaña, mes y household.
- Ausencia de la transición skeleton -> pantalla vacía.

Añade scripts repetibles de performance para navegación fría y caliente, sin
meter aserciones de una sola ejecución en los tests unitarios normales: son
inestables.

Produce un release checklist con p75/p95 antes/después, número de queries,
tamaños de payload, resultados de build y riesgos conocidos.

Entrega archivos modificados, cómo correr la suite y los criterios de
aprobación.
```

---

## 8. Resultado esperado del programa

Al completar el backlog:

- Dashboard, Accounts y Net worth tendrán un único contrato de valoración
  reconciliado.
- Los periodos históricos y las conversiones serán reproducibles, con el fallo de
  FX visible en vez de silencioso.
- El Dashboard mostrará el top-of-fold antes que los módulos secundarios, sin
  cadenas de `await` secuenciales.
- Los snapshots de balances se resolverán en un número acotado de llamadas.
- Las reentradas usarán cache segura y revalidación controlada.
- No existirá la fase de pantalla vacía después del skeleton.
- El Dashboard será más corto, explicable y accionable.
- El proyecto tendrá un runner de tests de JS/TS y un release gate con métricas.
