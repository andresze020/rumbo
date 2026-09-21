# Rumbo — Baseline de performance (RUM-001)

## Status

**Instrumentación implementada; medición parcial.** El ticket
[RUM-001](./performance-ux-backlog.md) pide evidencia, no optimización, y nada
aquí cambia comportamiento financiero, esquema, RLS ni caching.

Lo que **sí** está cerrado: el censo estático de round-trips (reproducible con
`npm run perf:census`), la instrumentación en runtime (`RUMBO_PERF=1`) y el
arnés de medición contra la base (`npm run perf:baseline`).

Lo que **no**: los números. Esta sesión no tiene credenciales de app
(`NEXT_PUBLIC_SUPABASE_*` no están definidas, así que la app no arranca contra
datos reales) y las lecturas contra producción quedaron bloqueadas a mitad del
trabajo. Las tablas de §4 y §5 están construidas pero vacías, con el comando
exacto que las llena. **Ningún número de este documento está inventado: lo que
no se midió aparece como `—`.**

---

## 1. Por qué tres capas y no una

Los 4,25 s del video son un solo número que esconde cuatro costos distintos.
Optimizar contra ese número es lo que el ticket llama "trasladar el costo". Así
que el baseline se mide en tres capas que se suman, cada una con su herramienta:

| Capa | Qué mide | Herramienta | ¿Necesita credenciales? |
|---|---|---|---|
| **A. Forma** | Cuántos round-trips hace una ruta y en qué orden | `npm run perf:census` | No |
| **B. Servidor** | Lo que el Server Component espera por cada query | `RUMBO_PERF=1` | Sí (app corriendo) |
| **C. Base** | Lo que PostgreSQL tarda, sin red ni PostgREST | `npm run perf:baseline` | Sí (token) |

**B menos C es el costo de red + PostgREST + TLS.** Ninguna de las tres ve el
navegador: navegación, streaming, hidratación y render del cliente se miden con
el perfil de Chrome (§6) y se suman aparte. Es deliberado — un solo número que
lo mezclara todo sería el mismo problema que el video.

---

## 2. Capa A — censo estático (medido)

`npm run perf:census`. Cuenta código, no ejecuta nada. **Reproducible sin
credenciales**, así que sirve de control: si la capa B mide menos round-trips
que los que el censo ve, falta instrumentación; si mide más, hay un bucle.

### 2.1 Las seis rutas más caras

| Ruta | Round-trips | Secuenciales | Concurrentes |
|---|---:|---:|---:|
| `/dashboard` | 18 | **11** | 7 |
| `/dashboard/transactions/import` | 9 | 9 | 0 |
| `/dashboard/debts` | 7 | 7 | 0 |
| `/dashboard/budgets` | 10 | 6 | 4 |
| `/dashboard/assistant` | 6 | 6 | 0 |
| `/dashboard/transactions` | 12 | 5 | 7 |

20 rutas · 138 round-trips · 98 secuenciales.

### 2.2 El costo que paga *toda* navegación

Antes de que la ruta empiece, el layout y sus helpers gastan **6 round-trips**:

| Archivo | Round-trips | De ellos `auth.getUser()` |
|---|---:|---:|
| `src/app/dashboard/layout.tsx` | 1 | 1 |
| `src/lib/households/server.ts` | 3 | 1 |
| `src/lib/preferences/server.ts` | 2 | 1 |

Sumados a los 18 de `/dashboard`, una carga fría del Dashboard son **~24
round-trips de servidor**, no los ~16 que estimó §3.2 del estado de ejecución.

### 2.3 Llamadas repetidas dentro de una misma carga

| Ruta | Llamada | Veces |
|---|---|---:|
| `/dashboard` | `from:transactions` | 3 |
| `/dashboard` | `rpc:get_account_balances` | 2 |
| `/dashboard` | `rpc:get_monthly_dashboard_summary` | 2 |
| `/dashboard/accounts` | `from:transaction_entries` | 3 |
| `/dashboard/accounts` | `rpc:get_account_balances` | 2 |
| `/dashboard/net-worth` | `rpc:get_account_balances` | 2 en código, **7 en ejecución** |
| `/dashboard/settings` | `from:accounts` | 2 |
| `/dashboard/notes` | `from:notes` | 2 |

El caso de `net-worth` es la razón por la que el censo estático no basta:
`net-worth/page.tsx:294` mapea `getPreviousMonths(selectedMonth, 6)`, así que
**dos apariciones en el código son siete llamadas en ejecución** (1 del mes
seleccionado en `:288` + 6 de la evolución). Un conteo estático nunca ve un
bucle. La capa B sí.

---

## 3. Los cinco cuellos, con evidencia

Ordenados por round-trips evitables, no por sospecha.

### 3.1 `auth.getUser()` cuatro veces por navegación

`layout.tsx:30`, `households/server.ts:27`, `preferences/server.ts:19` y
`dashboard/page.tsx:254`. Cada helper llama a `createClient()` por su cuenta, y
`getUser()` **siempre** revalida el token contra el servidor de Auth — no es un
`getSession()` que lee la cookie. Son cuatro round-trips para responder cuatro
veces la misma pregunta.

### 3.2 `profiles` leída dos veces por navegación

`households/server.ts:32` y `preferences/server.ts:23`, en la misma tabla, en la
misma fila, dentro del mismo `Promise.all` del layout (`layout.tsx:38-41`). Que
vayan en paralelo esconde el desperdicio: no cuesta latencia, cuesta una query.

### 3.3 Once `await` estrictamente secuenciales en el Dashboard

`dashboard/page.tsx` líneas 254, 257, 264, 276, 280, 284, 288, 293, 297, 301,
305. Cada uno espera al anterior antes de empezar. Solo después llega el
`Promise.all` de `:318`. **§3.4 #7 del backlog dice 8** porque miró la ventana
`:276-310` y se dejó fuera el preámbulo de auth/profiles/households.

### 3.4 Siete `get_account_balances` en Net worth

`net-worth/page.tsx:288` más seis dentro del `Promise.all` de `:293-302`. Van en
paralelo, así que el costo no es latencia de pared sino siete ejecuciones de la
RPC más cara del sistema. Confirmado: `getPreviousMonths(selectedMonth, 6)` en
`:266`.

### 3.5 `/dashboard/accounts`: 11 round-trips para una lista

Con `transaction_entries` leída tres veces (`:755`, `:795`, `:977`) y
`get_account_balances` dos (`:730`, `:737`).

> **Ninguno de estos cinco se arregla en RUM-001.** Son la entrada de RUM-005
> (Dashboard), RUM-006 (balances) y RUM-007 (cache). Este ticket solo tenía que
> demostrarlos.

---

## 4. Capa B — timings de servidor (pendiente de medir)

### Cómo se corre

```bash
RUMBO_PERF=1 npm run dev
```

Navega la ruta, y por cada respuesta aparece una línea en el log del servidor:

```
[rumbo-perf] {"route":"/dashboard","queries":24,"wallMs":1840,"busyMs":1620,
              "sumMs":1980,"maxConcurrency":5,"serialRatio":0.818,
              "repeats":[{"label":"rpc:get_account_balances","calls":2}],
              "byLabel":[...]}
```

Para quedarte solo con eso: `RUMBO_PERF=1 npm run dev 2>&1 | grep rumbo-perf`.

**`serialRatio` es el número que hay que mover.** Es `busyMs / sumMs`: 1,0
significa que nada se solapó nunca (todo secuencial); 0,25 significa que el
trabajo tomó un cuarto de lo que suman sus partes. RUM-005 tiene que bajarlo en
`/dashboard`.

### Qué llenar

Tres cargas por celda, mediana. Frío = primera carga tras reiniciar el dev
server; caliente = segunda navegación a la misma ruta.

| Ruta | Queries | wallMs frío | wallMs caliente | serialRatio | maxConcurrency |
|---|---:|---:|---:|---:|---:|
| `/dashboard` | — | — | — | — | — |
| `/dashboard/transactions` | — | — | — | — | — |
| `/dashboard/accounts` | — | — | — | — | — |
| `/dashboard/net-worth` | — | — | — | — | — |
| Cambio de mes en `/dashboard` | — | — | — | — | — |

---

## 5. Capa C — timings de base (pendiente de medir)

```bash
npm run perf:baseline -- --household=<uuid> --user=<auth-user-uuid> --runs=7
npm run perf:baseline -- --household=<uuid> --user=<uuid> --explain
npm run perf:baseline -- --household=<uuid> --stat-statements
```

**`--user` importa.** Sin él, la Management API conecta como `postgres` y **RLS
no se aplica**: los números salen optimistas porque la app sí paga los
predicados de las policies. Con `--user=<uuid>` el script hace
`set local role authenticated` y fija `request.jwt.claims`, que es lo que
realmente ocurre en producción. Anota siempre en qué modo mediste.

| Probe | Filas | Frío | p50 | p75 | p95 |
|---|---:|---:|---:|---:|---:|
| `rpc:get_account_balances` | — | — | — | — | — |
| `rpc:get_monthly_dashboard_summary` | — | — | — | — | — |
| `rpc:get_monthly_expenses_by_category` | — | — | — | — | — |
| `rpc:get_monthly_budget_details` | — | — | — | — | — |
| `rpc:search_household_transactions` | — | — | — | — | — |
| `from:accounts` / `categories` / `payees` / `tags` | — | — | — | — | — |

`pg_stat_statements` **está instalado** en el proyecto (verificado el
2026-09-21), así que `--stat-statements` funciona sin habilitar nada.

### Seguridad del arnés

- **Solo lectura por construcción.** La lista de probes es fija y todas son
  `SELECT`; no hay forma de pasar SQL arbitrario por CLI. Las funciones que
  ejecuta son las mismas que la app llama en cada carga de página, así que
  correrlo es tan seguro como abrir el Dashboard.
- **Corre contra producción.** No hay copia de staging. No hace DDL ni DML.
- `EXPLAIN` imprime los literales por los que filtró un plan. El script enmascara
  UUIDs y cualquier literal de texto antes de imprimir, para que un nombre de
  payee o una descripción no acabe en una terminal, un log o este documento.

---

## 6. Capa D — el navegador (manual)

Lo que ninguna de las tres capas anteriores ve. Con DevTools:

1. **Network waterfall reproducible**: Network → Disable cache → Fast 4G →
   grabar la navegación → "Save all as HAR". Guarda el HAR **fuera del repo**:
   lleva cookies de sesión y URLs con filtros.
2. **Performance**: grabar la navegación, leer LCP, el hueco entre el skeleton y
   el contenido, y el costo de hidratación.
3. Repetir en frío (hard reload) y en caliente (navegación entre pestañas).

Presupuestos objetivo: §"Presupuestos de performance propuestos" del ticket.

---

## 7. Qué NO se puede atribuir, y por qué

- **No hay cabeceras `Server-Timing`.** Un Server Component no puede escribir
  headers en su propia respuesta, y el middleware (`src/proxy.ts`) corre *antes*
  de la página, así que no conoce los timings. El ticket admite
  "cabeceras Server-Timing **o** salida de timing estructurada"; esto es lo
  segundo. Ponerlas exigiría mover la atribución al middleware, que no puede
  verla.
- **El nombre de ruta es best-effort.** Next no promete una cabecera con la ruta
  resuelta; `logPerfSnapshot` prueba las que sí existen y si no cae a
  `(unknown route)`. Por eso el método dice medir una ruta a la vez.
- **Fuera de un render, el colector se comparte en el proceso.** `cache()` de
  React solo memoiza durante un render. En un route handler o una server action
  el instrumento cae a un colector compartido, que bajo carga concurrente
  mezclaría dos peticiones. Es otra razón por la que `RUMBO_PERF` es un
  interruptor opt-in y no algo que se deje encendido.
- **No se mide el tamaño de payload cuando falta `content-length`.** No se clona
  la respuesta para medirla: leer el cuerpo consumiría el stream que el llamante
  va a parsear. Se reporta `null`, no un cero engañoso.

---

## 8. Privacidad

El instrumento **nunca** registra valores de filtro. `src/lib/perf/label.ts`
usa una allowlist: solo `select`, `order`, `limit`, `offset`, `columns` y
`on_conflict` conservan su valor, porque describen la forma de la consulta y no
pueden contener texto de una persona. Todo lo demás aporta la clave y nada más.

Los argumentos de una RPC no aparecen en absoluto: PostgREST los manda en el
cuerpo del POST, que el instrumento no lee. Es deliberado —
`search_household_transactions` recibe `p_search`, el texto que escribió el
usuario. Una ruta de storage se reduce a `storage:object` porque un nombre de
archivo puede ser elegido por una persona.

Hay tests que lo comprueban, no solo comentarios: `label.test.ts` afirma que ni
un término de búsqueda ni un UUID sobreviven a la serialización, y
`collector.test.ts` lo vuelve a verificar de extremo a extremo.

---

## 9. Correcciones al backlog

Verificadas contra el código de `main` el 2026-09-21:

| Dónde | Decía | Dice ahora |
|---|---|---|
| §3.4 #7 | "8 son `await` estrictamente secuenciales (`:276-310`)" | **11**, líneas 254-305: la ventana original se dejó fuera auth, profiles y households |
| §3.2 (estado) | Dashboard ~16 round-trips | **~24**, contando los 6 del layout que paga toda navegación |
| §3.4 #4 | "el Dashboard la llama 2 veces" | Correcto, y además `from:transactions` ×3 en la misma carga |

Nada de §3.4 se refutó: lo que cambia son conteos que se quedaron cortos por
mirar una ventana de líneas en vez de la ruta completa.

---

## 10. Archivos

| Archivo | Qué es |
|---|---|
| `src/lib/perf/label.ts` | URL → etiqueta segura. Allowlist de parámetros. |
| `src/lib/perf/stats.ts` | Percentiles, `serialRatio`, rollup y repetidos. |
| `src/lib/perf/collector.ts` | El `fetch` instrumentado y el colector por petición. |
| `src/lib/supabase/server.ts` | Tres líneas: extiende el cliente cuando el switch está encendido. |
| `src/app/dashboard/layout.tsx` | Una línea: registra el volcado en `after()`. |
| `scripts/perf-census.mjs` | Capa A. |
| `scripts/perf-baseline.mjs` | Capa C. |
