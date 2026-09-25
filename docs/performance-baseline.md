# Rumbo — Baseline de performance (RUM-001)

## Status

**Capas A y C medidas contra producción el 2026-09-21. Capa B medida el 2026-09-25 (§4), solo `/dashboard`.** El
ticket [RUM-001](./performance-ux-backlog.md) pide evidencia, no optimización, y
nada aquí cambia comportamiento financiero, esquema, RLS ni caching.

**Titular:** `get_account_balances` es el **71 % de todo el tiempo de base de
datos** del proyecto (2.101 s de 2.976 s, ventana de 112 días en
`pg_stat_statements`), y su costo escala con el **historial completo** del
household, no con la fecha de corte. Es la única query del sistema con costo
medible; todas las demás están en el ruido.

La capa B (timings de servidor con `RUMBO_PERF=1`) se midió el 2026-09-25 con
un build de producción y una cuenta QA (§4). Solo tiene la fila de `/dashboard`;
§4 explica por qué las otras siguen vacías. **Ningún número de este documento está
inventado: lo que no se midió aparece como `—`.**

Household de referencia: 4.688 transacciones, 2022-06-12 → 2026-09-20, 26
cuentas, 158 categorías, 74 payees, 5.524 entries. Los UUIDs no se registran
aquí a propósito.

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

## 3. Los cuellos, con evidencia medida

Reordenados tras medir. La capa A (conteo) y la capa C (tiempo) no coinciden en
el orden, y esa discrepancia es el resultado más útil del ticket: **el problema
del Dashboard es el número de round-trips; el problema de Net worth y Accounts
es una sola query cara.**

### 3.1 `get_account_balances` — el 71 % de toda la base de datos

2.101 s de 2.976 s en 112 días. 36.778 buffers (~287 MB) para devolver 22 filas,
192 ms directos y 620 ms de media en producción. **Y escala con el historial
completo del household, no con la fecha de corte** (§5.5): 20× más
transacciones → 6,5× más tiempo.

Llamada 2× en Dashboard (`page.tsx:276`, `:297`), 2× en Accounts (`:730`,
`:737`) y 7× en Net worth (`:288` + seis en el `Promise.all` de `:293-302`).
En este household, Net worth cuesta ~1,4 s de trabajo de base por carga.

**Esto reescribe RUM-006.** No es "reducir llamadas repetidas": cada llamada es
O(historial), así que el número de llamadas y el costo por llamada son dos
problemas distintos y el segundo es el que crece solo.

### 3.2 `auth.getUser()` cuatro veces por navegación

`layout.tsx:30`, `households/server.ts:27`, `preferences/server.ts:19` y
`dashboard/page.tsx:254`. Cada helper llama a `createClient()` por su cuenta, y
`getUser()` **siempre** revalida el token contra el servidor de Auth — no es un
`getSession()` que lee la cookie. Cuatro round-trips para la misma pregunta.

### 3.3 Once `await` estrictamente secuenciales en el Dashboard

`dashboard/page.tsx` líneas 254, 257, 264, 276, 280, 284, 288, 293, 297, 301,
305. Cada uno espera al anterior. **§3.4 #7 del backlog dice 8** porque miró la
ventana `:276-310` y se dejó fuera el preámbulo de auth/profiles/households.

Medido, el costo de cada uno en la base es ~0 salvo los dos de balances (§5.3).
Es decir: el Dashboard no es lento por sus queries, es lento por **esperarlas de
una en una**. Eso hace de RUM-005 un problema de orquestación, no de SQL.

### 3.4 `search_household_transactions` sobre all-time

190 ms y 34.791 buffers para una página de 50, frente a 22 ms y 2.780 sobre un
mes (§5.4.1). El offset es irrelevante — el costo es O(filas que casan con el
filtro). Hoy no duele porque el periodo por defecto es el mes, pero cualquier
usuario que elija `all-time` paga lo mismo que una carga de Net worth.

### 3.5 `get_card_cycle_summaries` — la peor query por llamada del sistema

52.846 buffers y 911 ms de media (§5.6). Solo 160 llamadas, así que hoy no
duele, pero es peor por llamada que `get_account_balances` y **no está en el
backlog**. Misma forma de problema. Merece ticket propio.

### 3.6 `profiles` leída dos veces por navegación

`households/server.ts:32` y `preferences/server.ts:23`, misma tabla, misma fila,
dentro del mismo `Promise.all` del layout (`layout.tsx:38-41`). Van en paralelo,
así que no cuesta latencia: cuesta una query y esconde el desperdicio.

### Lo que la medición sacó de la lista

- **Los cuatro lookups de Transactions** (accounts/categories/payees/tags) están
  todos en el ruido del transporte. No son un cuello.
- **`/dashboard/accounts` con 11 round-trips** baja de prioridad: 9 de ellos no
  cuestan nada medible; los que importan son sus 2 de balances.

### Lo que la medición NO sacó, aunque la primera versión lo afirmó

**`search_household_transactions` sigue en la lista.** Ver §5.4.1: medirlo solo
sobre un mes dio 22 ms y llevó a declarar RUM-004 refutado; sobre el historial
completo son **190 ms y 34.791 buffers**, a la par de `get_account_balances`.
La conclusión anterior venía de un probe que no ejercitaba el caso del ticket.

> **Ninguno de estos se arregla en RUM-001.** Son la entrada de RUM-005
> (orquestación del Dashboard), RUM-006 (`get_account_balances`) y RUM-007
> (cache). Este ticket solo tenía que demostrarlos.

---

## 4. Capa B — timings de servidor (medida 2026-09-25, `/dashboard`)

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
| `/dashboard` | 26 (22 en frío) | 462 | 402 (mediana de 8) | ~0,30 | 7 |
| `/dashboard/transactions` | — | — | — | — | — |
| `/dashboard/accounts` | — | — | — | — | — |
| `/dashboard/net-worth` | — | — | — | — | — |
| Cambio de mes en `/dashboard` | — | — | — | — | — |

**Cómo se midió (2026-09-25, RUM-005).** `RUMBO_PERF=1 npm start` (build de
producción, no `next dev`), Supabase real, cuenta QA `rum005-qa-…` (78
transacciones, 3 cuentas, 13 meses), 9 cargas completas hechas por
`perf:nav`. Rango de `wallMs` 349–624. Lo que dicen las líneas:

- **~50 ms por round-trip a Supabase** desde el contenedor. Ninguna query es
  cara: el costo es la cantidad (26) por el costo de red.
- **Repetidas en cada carga:** `auth:user` ×5, `from:profiles` ×4,
  `get_account_balances_as_of_many` ×2, `get_monthly_dashboard_summary` ×2.
  Es el mismo patrón que la capa A contó en §3.2.
- `serialRatio` ~0,3: la orquestación de RUM-005 (un `Promise.all`) sí solapa.

**Household real (2026-09-25, lectura solamente):** mismas 26 queries por
render de `/dashboard`; `wallMs` p50 ~447 ms (18 cargas, 391–652), `serialRatio`
~0,31. Con un historial mucho más grande, el render de servidor cuesta casi lo
mismo que en la cuenta QA. Eso confirma que el costo lo pone el número de
round-trips, no el volumen de datos.

**Por qué solo `/dashboard`.** El colector se registra en el layout de
`/dashboard` (`reportPerfAfterResponse`), y una navegación de cliente no vuelve
a renderizar el layout. Por eso solo aparecen las cargas completas (9 líneas
para 8 corridas + el login), no las navegaciones entre pestañas. Llenar las
otras filas pide cargar cada ruta con `page.goto` o mover el hook al nivel de
página.

---

## 5. Capa C — timings de base (medida 2026-09-21)

```bash
npm run perf:baseline -- --household=<uuid> --user=<auth-user-uuid> --runs=9 --pace=700
npm run perf:baseline -- --household=<uuid> --user=<uuid> --explain
npm run perf:baseline -- --household=<uuid> --user=<uuid> --stat-statements
```

### 5.1 `--user` no es opcional

Sin él, la Management API conecta como `postgres`, y **las RPC fallan**: cada
una comprueba `is_household_member()` en su propio cuerpo y lanza
`Not authorized to read ... for this household`. El aislamiento por household
está aplicado **dos veces** — en la policy y dentro de la función. Es una buena
noticia de seguridad y una corrección a la suposición inicial de este arnés, que
decía que `postgres` solo daría números optimistas. No da ninguno.

### 5.2 El piso de transporte

**Cada probe paga ~285 ms que no son PostgreSQL**: HTTPS a `api.supabase.com`,
auth, conexión y el overhead de la propia API. Sin restarlo, leer 26 cuentas
parece una query de 273 ms. La primera fila de la tabla lo mide con `select 1`,
y sin ella la tabla entera engaña.

### 5.3 Resultados (9 corridas, RLS aplicada, mes 2026-09)

| Probe | Filas | p50 | p50 neto | × piso |
|---|---:|---:|---:|---:|
| **PISO DE TRANSPORTE** (`select 1`) | 1 | 287 ms | — | 1,00× |
| `rpc:get_account_balances` | 22 | 478 ms | **190 ms** | **1,66×** |
| `rpc:get_monthly_dashboard_summary` | 1 | 340 ms | 52 ms | 1,18× |
| `rpc:get_monthly_budget_details` | 0 | 321 ms | 33 ms | 1,12× |
| `from:payees` | 74 | 340 ms | 53 ms | 1,18× |
| `from:accounts` | 26 | 341 ms | 53 ms | 1,19× |
| `rpc:get_monthly_expenses_by_category` | 4 | 270 ms | 0 ms | 0,94× |
| `rpc:search_household_transactions` | 15 | 277 ms | 0 ms | 0,96× |
| `from:categories` | 158 | 260 ms | 0 ms | 0,91× |
| `from:tags` | 51 | 294 ms | 6 ms | 1,02× |

Dos pasadas independientes dieron 171 ms y 190 ms netos para
`get_account_balances`; el resto varía entre 0 y 53 ms de una pasada a otra, que
es el ruido del transporte. **Solo `get_account_balances` sobresale.**

### 5.4 `EXPLAIN (ANALYZE, BUFFERS)`

| Query | Exec time | Buffers |
|---|---:|---:|
| **`get_account_balances`** | **192,16 ms** | **36.778** |
| **`search_household_transactions` (all-time)** | **190,07 ms** | **34.791** |
| `search_household_transactions` (un mes) | 22,39 ms | 2.780 |
| `get_monthly_dashboard_summary` | 9,45 ms | 1.800 |
| `get_monthly_expenses_by_category` | 6,99 ms | 1.572 |
| `from:categories` | 3,57 ms | 523 |

36.778 buffers son ~287 MB de tráfico para devolver **22 filas**.

### 5.4.1 El periodo de Transactions decide el costo

**Corrección, tras la revisión de Codex en PR #69.** La primera versión de este
informe midió `search_household_transactions` solo sobre **un mes**, que devolvió
**15 filas** — ni el historial completo ni una página llena — y concluyó que
RUM-004 quedaba refutado. **Esa conclusión no estaba respaldada.** Medido bien:

| Periodo | Offset | Exec | Buffers | Filas |
|---|---:|---:|---:|---:|
| un mes (2026-09) | 0 | 22,4 ms | 2.780 | 15 |
| **all-time** | 0 | **190,1 ms** | **34.791** | 50 |
| all-time | 2.000 | 190,7 ms | 34.791 | 50 |
| all-time | 4.000 | 185,1 ms | 34.791 | 50 |

Dos cosas:

1. **All-time cuesta 12,5× más buffers que un mes**, y queda a la par de
   `get_account_balances`. El periodo por defecto de la pantalla es lo que hoy
   la mantiene barata.
2. **El offset no cambia nada**: 34.791 buffers para la página 1, la 40 y la 80.
   La RPC materializa el conjunto completo antes de aplicar `LIMIT`/`OFFSET`, así
   que el costo es O(filas que casan con el filtro), no O(offset). Paginación
   por keyset no ayudaría; acotar el conjunto sí.

**RUM-004 no queda refutado.** Cambia de forma: no es "Transactions baja años de
datos al cliente" (eso sigue siendo falso, §3.4 #5), sino que **la RPC hace
trabajo proporcional al historial que el filtro abarca**, igual que
`get_account_balances`.

### 5.5 El costo escala con el historial, no con la fecha

Misma función, mismo `current_date`, tres households:

| Household | Transacciones | Cuentas | Buffers | Exec |
|---|---:|---:|---:|---:|
| grande | 4.688 | 22 | 36.778 | 194,9 ms |
| pequeño | 231 | 13 | 4.058 | 30,2 ms |
| mínimo | 121 | 11 | 3.188 | 17,1 ms |

20× más transacciones → 9× más buffers y 6,5× más tiempo. La función
(`20260817120000_balance_fx_revaluation.sql:152`) es un CTE que une
`accounts ⋈ transaction_entries ⋈ transactions` y agrega con seis `filter`, sin
acotar por fecha inferior: **lee el historial completo en cada llamada**.

Consecuencia: este household se vuelve más lento cada mes, para siempre, en toda
pantalla que muestre un saldo. Y la app la llama **2× en Dashboard, 2× en
Accounts y 7× en Net worth**.

### 5.6 `pg_stat_statements` — top por tiempo total

Ventana de 2.694 h (112 días). Total del sistema: **2.976 s**.

| Target | Llamadas | Media | Total | Buffers/llamada |
|---|---:|---:|---:|---:|
| **`rpc:get_account_balances`** | 2.996 | 619,82 ms | **1.857 s** | 28.258 |
| `rpc:get_card_cycle_summaries` | 160 | 911,67 ms | 146 s | **52.846** |
| `rpc:get_account_balances` (otro household) | 5.610 | 24,65 ms | 138 s | 1.658 |
| `rpc:get_monthly_dashboard_summary` | 3.638 | 23,45 ms | 85 s | 2.357 |
| `from:transactions` | 1.017 | 60,92 ms | 62 s | 3.644 |
| `rpc:search_household_transactions` | 431 | 80,47 ms | 35 s | 9.051 |
| `rpc:create_manual_transaction` | 4.520 | 5,74 ms | 26 s | 247 |

**`get_account_balances` suma 2.101 s: el 71 % de toda la base.**

Y un hallazgo que el backlog no tenía: **`get_card_cycle_summaries` es la peor
query por llamada de todo el sistema** — 52.846 buffers y 911 ms de media. Solo
160 llamadas, así que no duele hoy, pero es la misma forma de problema que
`get_account_balances` y merece entrar al backlog.

La media de producción (620 ms) es ~3× la medición directa (190 ms) porque
PostgREST añade su envoltorio y la serialización a JSON, y porque producción
tiene concurrencia.

### 5.7 Límites del arnés

- **Rate limit.** La Management API responde 429 al encadenar probes. El script
  pacea (`--pace`, 250 ms por defecto) y reintenta con backoff exponencial;
  una muestra que tuvo que esperar un 429 **se descarta** en vez de promediarse,
  porque mediría al limitador y no a la query.
- **Solo lectura por construcción.** Lista fija de probes, todas `SELECT`, sin
  SQL arbitrario por CLI. Corre contra producción: no hay staging.
- `EXPLAIN` imprime los literales por los que filtró; el script enmascara UUIDs
  y literales de texto antes de imprimir.

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
| §3.4 #5 y #6 | RUM-004 "queda subordinado a la evidencia de RUM-001" | **Evidencia entregada, y no lo refuta.** Sobre un mes son 22 ms; sobre all-time, **190 ms y 34.791 buffers** (§5.4.1). RUM-004 sigue vivo, re-scoped |
| — | El arnés de este ticket suponía que `postgres` daría números optimistas | **Falso**: las RPC comprueban `is_household_member()` en su propio cuerpo y fallan sin `--user`. Corregido en el script |

Nada de §3.4 se refutó: lo que cambia son conteos que se quedaron cortos por
mirar una ventana de líneas en vez de la ruta completa.

### 9.1 Lo que la medición añade al backlog

- **RUM-006 cambia de forma.** No es "reducir llamadas repetidas de balances":
  cada llamada a `get_account_balances` cuesta O(historial del household). El
  número de llamadas y el costo por llamada son dos problemas, y el segundo
  crece solo con el tiempo.
- **RUM-005 es orquestación, no SQL.** Las queries del Dashboard cuestan ~0 en
  la base salvo las dos de balances. Lo caro es esperarlas de una en una.
- **RUM-004 sigue vivo**, re-scoped: la RPC hace trabajo proporcional al
  historial que abarca el filtro (190 ms all-time vs 22 ms un mes), y el offset
  no influye.
- **Falta un ticket para `get_card_cycle_summaries`** (52.846 buffers, 911 ms de
  media por llamada). Es la peor query por llamada del sistema y no está en el
  backlog.

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
| `scripts/perf-baseline.mjs` | Capa C. Incluye el piso de transporte, pacing y backoff ante 429. |
