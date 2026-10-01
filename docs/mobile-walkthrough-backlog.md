# Rumbo — Backlog del recorrido móvil 2026-09-30

> Documentation only. Backlog ejecutable MQ-001…MQ-020, derivado de una grabación
> de pantalla de ~4 min (Brave en Android, modo oscuro, household real con
> 20+ cuentas y años de historial) que recorre Dashboard, Transactions,
> Accounts, Debts, More, Categories, Payees, Tags, Budgets, Goals y Recurring.
> Cada ticket termina con un **Prompt**: basta con pedirle a Claude "trabaja en
> el ticket MQ-0XX" (§2 explica el contrato común).
> El índice general de trabajo abierto sigue siendo
> [pending-work.md](./pending-work.md); este documento es la fuente de verdad
> **solo** para los tickets MQ-*. La prioridad sigue
> [alpha-finding-triage-rules.md](./alpha/alpha-finding-triage-rules.md).
>
> **Creado 2026-09-30** sobre `main` en `167e801`. Las rutas `archivo:línea`
> se verificaron contra el código en esa fecha; las causas marcadas como
> *hipótesis* no se reprodujeron todavía. **El repositorio es la fuente de
> verdad**: si este documento y el código discrepan, el código gana.
>
> **Privacidad:** los montos y saldos reales se omiten a propósito. Los
> hallazgos se describen de forma estructural (qué tarjeta, qué signo, qué
> color), nunca con cifras.

---

## 1. Resumen

| ID | Prioridad | Estado | Categoría | Área | Hallazgo en una línea |
|---|---|---|---|---|---|
| [MQ-001](#mq-001--today-y-el-mes-actual-se-calculan-en-utc) | P0 | Abierto | Funcionamiento | Fechas (global) | "Hoy" y "mes actual" se calculan en UTC: a las 23:31 locales del 30-sep la app ya vive en octubre. |
| [MQ-002](#mq-002--el-shell-se-desplaza-header-y-bottom-nav-se-van-de-la-pantalla) | P1 | ✅ Hecho (`fix/mq-002-shell-document-scroll`) | UI | Shell / navegación | Al llegar al final del scroll el header y la bottom nav se desplazan y dejan media pantalla vacía. |
| [MQ-003](#mq-003--el-empty-state-de-transactions-parpadea-y-miente) | P1 | ✅ Hecho (`fix/mq-003-transactions-empty-state`) | Funcionamiento | Transactions | El empty state alterna solo entre dos variantes cada 1,5–3 s y dice "No transactions yet" con miles de transacciones. |
| [MQ-004](#mq-004--el-botón-del-asistente-tapa-contenido-y-la-tab-more) | P1 | ✅ Hecho (`fix/mq-004-assistant-in-header`) | UI | Global | El botón flotante del asistente tapa montos, botones de fila y la tab "More". |
| [MQ-005](#mq-005--comparativas-de-mes-en-curso-contra-mes-completo) | P1 | ✅ Hecho (`fix/mq-005-month-to-date-deltas`) | Funcionamiento | Dashboard / Budgets / Accounts | Deltas "−100 % vs Sep", "0,0 %" en verde y un Month health "C+" calculados sin datos del mes. |
| [MQ-006](#mq-006--goals-resumen-que-ignora-metas-en-otra-moneda-y-cuentas-vinculables-incorrectas) | P1 | ✅ Hecho (`fix/mq-006-goals-summary-accounts`) | Funcionamiento | Goals | El resumen ignora metas en moneda no base; se puede vincular una meta de ahorro a una cuenta de deuda. |
| [MQ-007](#mq-007--sugerencias-de-autofill-del-navegador-en-campos-de-la-app) | P2 | ✅ Hecho (`fix/mq-007-no-autofill`) | UX | Formularios | Brave ofrece nombres de contactos, montos viejos y tarjetas en campos de nombre y monto. |
| [MQ-008](#mq-008--selects-nativos-con-listas-largas) | P2 | ✅ Hecho (`fix/mq-008-searchable-pickers`) | UX | Budgets / Goals / Debts | `<select>` nativos con 20–60 opciones planas, sin búsqueda ni jerarquía. |
| [MQ-009](#mq-009--skeletons-en-cada-navegación-incluida-una-página-estática) | P2 | ✅ Hecho (`fix/mq-009-fewer-skeletons`) | Performance | Navegación | Skeleton de 0,5–2 s en cada módulo, incluso en More (estático); "Loading form…" en blanco; skeleton de Budgets no coincide con el resultado. |
| [MQ-010](#mq-010--sheets-con-teclado-autofocus-que-tapa-el-formulario) | P2 | ✅ Hecho (`fix/mq-010-no-keyboard-on-open`) | UX | Debts / Goals / Budgets | El autofocus abre el teclado al instante y tapa casi todo el formulario. |
| [MQ-011](#mq-011--debts-no-reconoce-las-cuentas-de-pasivo-existentes) | P2 | ✅ Hecho (`fix/mq-011-track-existing-liabilities`) | UX | Debts | Debts muestra 0 deudas en rojo mientras existe una cuenta tipo Debt con saldo; no ofrece vincularla. |
| [MQ-012](#mq-012--tipografía-monoespaciada-en-montos) | P2 | ✅ Hecho (`fix/mq-012-proportional-amounts`) | UI | Debts / Budgets / Goals | Montos en `font-mono` con caracteres espaciados, distinto al resto de la app. |
| [MQ-013](#mq-013--símbolo--para-montos-en-cop-y-fecha-ddmmyyyy-con-ui-en-inglés) | P2 | ✅ Hecho (`fix/mq-013-currency-prefix-dates`) | UX | Formularios multi-moneda | Montos en COP con prefijo "$"; inputs de fecha nativos en `dd/mm/yyyy` con la UI en inglés. |
| [MQ-014](#mq-014--dashboard-de-mes-nuevo-cinco-empty-states-seguidos) | P2 | ✅ Hecho (`fix/mq-014-quiet-empty-months`) | UX | Dashboard / Budgets / Goals | Mes sin actividad = cinco tarjetas vacías seguidas; KPIs en cero empujan el empty state fuera de la vista. |
| [MQ-015](#mq-015--payees-cuatro-acciones-por-fila) | P2 | ✅ Hecho (`fix/mq-015-payee-row-menu`) | UI | Payees | Cuatro acciones por fila truncan el nombre y parten el meta en tres líneas. |
| [MQ-016](#mq-016--categories-kpi-filtros-y-acciones-ambiguas) | P2 | ✅ Hecho (`fix/mq-016-categories-clarity`) | UX | Categories | KPI "Active" no sigue el filtro, tabs truncadas, icono `←\|` sin explicación, chevron con doble función. |
| [MQ-017](#mq-017--accounts-delta-neutro-en-verde-e-indicador-de-swipe-sobre-el-saldo) | P2 | ✅ Hecho (`fix/mq-017-accounts-long-names`) | UI | Accounts | "↑ 0,0 %" en verde; el indicador de swipe "‹" se dibuja encima del saldo. |
| [MQ-018](#mq-018--more-lista-plana-de-20-ítems) | P3 | Abierto | UX | More | Lista plana de 20+ ítems que repite las tabs de la bottom nav. |
| [MQ-019](#mq-019--budgets-fila-de-línea-y-detalle-poco-legibles) | P3 | Abierto | UX | Budgets | Fila colapsada sin el planificado, detalle en 5 tiles apilados, copy "0 over budget", banner persistente. |
| [MQ-020](#mq-020--recurring-semántica-de-auto-y-secciones-duplicadas) | P3 | Abierto | UX | Recurring | Plantillas "Auto" vencidas sin postear, chips que envuelven, "Upcoming" y "Upcoming occurrences" duplicadas. |

**Orden sugerido:** MQ-001 primero y solo (toca 30+ sitios y probablemente
una migración). Luego MQ-002 + MQ-004 juntos (ambos son el shell móvil), luego
MQ-003, MQ-005 y MQ-006. Los P2 se pueden agrupar por área en sprints chicos.

---

## 2. Contrato de ejecución (aplica a todos los tickets)

> Cada ticket trae un **Prompt** al final. Basta con decirle a Claude
> "trabaja en el ticket MQ-0XX": la sesión encuentra este documento, lee esta
> sección y la del ticket, y trabaja sola. Los prompts solo añaden lo
> específico de cada ticket; todo lo de abajo aplica siempre.

### 2.1 Antes de tocar código

1. Lee `AGENTS.md` y `CLAUDE.md`.
2. De este documento lee **solo** esta §2 y la sección completa del ticket
   asignado. No leas ni trabajes otros tickets.
3. Confirma que el working tree está limpio y `main` al día con `origin/main`.
   Crea la rama `fix/mq-0XX-<slug-corto>` (o `feat/` si el ticket es de UX
   nueva) desde `main`. No uses worktrees.
4. Las rutas `archivo:línea` del ticket son de 2026-09-30: verifícalas. Delega
   en `scout` antes de abrir archivos grandes; nunca leas enteros los de más
   de ~700 líneas. **El código es la fuente de verdad**: si el ticket está
   desactualizado, corrígelo en este documento en el mismo cambio.
5. Si el ticket es un bug (MQ-001…MQ-006), sigue `/arreglar`: instrumenta y
   confirma la causa antes de cambiar código. Las causas marcadas como
   *hipótesis* no están probadas.

### 2.2 Autonomía

Puedes, sin pedir confirmación: modificar código y pruebas relacionados con el
ticket, añadir traducciones (vía `i18n-scribe`), actualizar docs de la
feature afectada y hacer commits en la rama del ticket.

**Detente y pregunta** solo si:

- El arreglo cambia una regla financiera (qué cuenta como ingreso/gasto,
  saldos, conversión FX) más allá de lo que describe el ticket.
- Hace falta una migración: redáctala con `migration-drafter`, **no la
  apliques**, no ejecutes `npx supabase db push`, y entrega los comandos
  manuales.
- El ticket pide elegir entre opciones y su prompt no trae la decisión.
- La causa real resulta ser otra y el arreglo sale del alcance del ticket.

No hagas `push`, PR ni merge sin que el usuario lo pida. Ningún comando
destructivo de git.

### 2.3 Invariantes

Reglas de `rumbo-ledger-rules`: saldos desde `transaction_entries`,
reportes y presupuestos desde `transaction_allocations`, transferencias
neutrales, nada de borrado físico de registros financieros, RLS y aislamiento
por household intactos. Si el ticket toca algo de esto, corre `ledger-guard`
sobre el diff antes de entregar.

### 2.4 Definition of Done

1. Gate de `rumbo-verify` en verde vía `verify-runner` (lint,
   `npx tsc --noEmit`, tests, build).
2. Si el ticket toca UI o rutas: `qa-smoke` sin errores en las rutas
   afectadas.
3. En este documento: el estado del ticket en §1 pasa a `✅ Hecho (rama)` y
   su sección lleva una línea `> ✅ Hecho el AAAA-MM-DD — <resumen de una
   línea>` bajo el título.
4. Respuesta final con el formato de `CLAUDE.md` (archivos, impacto en BD,
   comandos, pruebas manuales, comandos de Supabase) y, para lo que no se
   pudo verificar en un teléfono real, los pasos exactos para que el usuario
   lo pruebe.

---

## 3. P0 — Bloqueantes

### MQ-001 — "Today" y el mes actual se calculan en UTC

| Campo | Valor |
|---|---|
| Prioridad | **P0** (Alpha blocker: períodos, vencimientos y reportes equivocados) |
| Categoría | Funcionamiento |
| Evidencia | 0:00 · 0:34 · 0:51 · 0:55 · 1:20 · 2:14 · 3:37 · 3:56 (reloj del teléfono: 23:31, miércoles 30-sep) |
| Impacto BD | Probable migración aditiva (`households.timezone`) — ver "Qué hacer" |

**Síntoma.** La grabación se hizo el 30-sep a las 23:31 hora local, pero:

- Dashboard abre en **October 2026**, el checklist pide "Close September 2026"
  y la tarjeta Spending compara "por este día en septiembre".
- Transactions abre en **Oct 2026** (vacío), Accounts muestra
  "TOTAL BALANCE · OCT 2026", Budgets abre en October 2026 (el usuario creó
  el presupuesto de octubre creyendo que era el mes en curso).
- Scheduled activity / Recurring marcan el alquiler del **1-oct** como
  "Due today" / "Due & overdue".
- El formulario Create debt propone `Balance date = 01/10/2026`.
- En cambio el formulario de transacción y el date picker nativo dicen
  **Today = Sep 30** (usan la hora del cliente). La app se contradice a sí misma.

**Causa (confirmada).** `todayIsoDate()` y `currentMonth()` en
`src/lib/periods/transaction-period.ts:55-61` usan
`new Date().toISOString().slice(0, 10)`, es decir **UTC**. El comentario de la
línea 51 asume que el problema era un servidor detrás de UTC, pero el usuario
está al **oeste** de UTC: desde las 20:00 (EDT) hasta medianoche la app vive en
el día siguiente, y la última noche de cada mes, en el mes siguiente. Hay
**37** usos de `toISOString().slice(0, 10)` en `src/`, más copias locales en
`src/lib/analysis/server.ts:79-82`, `src/app/dashboard/budgets/page.tsx:96-100`,
`src/app/dashboard/plan/page.tsx:57-64`,
`src/app/dashboard/debts/debt-create-form.tsx:35` y
`src/app/dashboard/assistant/assistant-chat.tsx:45-46`. No existe columna de
zona horaria en `households` ni en `user_settings`.

**Qué hacer.**

1. Decidir la fuente de la zona: recomendado `households.timezone`
   (IANA, p. ej. `America/Toronto`), inicializada desde
   `Intl.DateTimeFormat().resolvedOptions().timeZone` del navegador en el
   onboarding y editable en Settings. Mientras no exista la columna, un cookie
   `tz` escrito por el cliente sirve de puente. La migración la redacta
   `migration-drafter`; no se aplica automáticamente.
2. Un único helper server-side `todayIsoDate(tz)` / `currentMonth(tz)` con
   `Intl.DateTimeFormat('en-CA', { timeZone: tz, year, month, day })`.
   Borrar las copias locales y hacer que todo el código las use.
3. Revisar en particular: clasificación Due/Upcoming de Recurring, el
   auto-post de plantillas "Auto" (si corre por cron, que use la zona del
   household), el checklist mensual, los defaults de período de Dashboard,
   Transactions, Budgets y Accounts, y el default de `Balance date`.
4. Tests unitarios de borde: 23:59 local / 00:00 UTC, último día del mes, y
   cambio de horario (DST).

**Criterio de aceptación.** A las 23:30 del último día del mes en
`America/Toronto`, todas las pantallas muestran ese mes, "Due today" refleja la
fecha local y el formulario de transacción y el servidor coinciden en "hoy".

#### Prompt

```text
Trabaja en el ticket MQ-001 de Rumbo. Sigue el Contrato de ejecución (§2) de
docs/mobile-walkthrough-backlog.md y lee la sección completa del ticket MQ-001.

Objetivo: que "hoy" y "el mes actual" se calculen en la zona horaria del
usuario, no en UTC, en todo el servidor.

1. Inventaría con scout cada cálculo de fecha actual en src/ (todayIsoDate,
   currentMonth, currentMonthParam, toISOString().slice(0, 10), new Date() usado
   como "hoy"). Distingue los que son "hoy" de los que formatean una fecha ya
   dada: solo los primeros cambian.
2. Fuente de la zona en este ticket: cookie `rumbo-tz` escrita por un pequeño
   componente cliente montado en src/app/dashboard/layout.tsx con
   Intl.DateTimeFormat().resolvedOptions().timeZone; si el cookie cambia o no
   existía, un único router.refresh(). Fallback del servidor: UTC (el
   comportamiento actual), nunca un error.
3. Centraliza en src/lib/periods/transaction-period.ts: todayIsoDate(tz) y
   currentMonth(tz) con Intl.DateTimeFormat('en-CA', { timeZone }), más un
   helper server-only getRequestTimeZone() que lee y valida el cookie. Borra las
   copias locales (analysis/server.ts, budgets/page.tsx, plan/page.tsx,
   debt-create-form.tsx, assistant-chat.tsx) y reemplaza todos los usos.
4. Cubre en particular: clasificación Due/Upcoming de Recurring y el posteo
   de plantillas "Auto", checklist mensual, defaults de período de Dashboard,
   Transactions, Budgets y Accounts, y el default de Balance date.
5. Tests Vitest de borde: 23:59 local / 03:59 UTC en America/Toronto, último
   día de mes, y cambio de horario (DST).

Parada obligatoria: si encuentras un proceso sin request (cron, Edge Function,
job de Supabase) que dependa de "hoy", no inventes la zona: redacta con
migration-drafter una columna aditiva households.timezone (IANA, default
'UTC'), no la apliques, y detente con los comandos manuales para el usuario.
Corre ledger-guard antes de entregar: el ticket toca vencimientos y períodos.
```

---

## 4. P1 — Importantes

### MQ-002 — El shell se desplaza: header y bottom nav se van de la pantalla

> ✅ Hecho el 2026-10-01 — `main#app-scroll` pasa a `relative` (un `absolute` sin
> ancestro posicionado ya no agranda el documento), `html:has(#app-scroll)` queda
> en `overflow: hidden` y `overscroll-behavior-y: none` pasa también a `html`
> (Chromium no lo lee de `body`). Detalle en
> [features/mobile-app-shell.md](./features/mobile-app-shell.md).

| Campo | Valor |
|---|---|
| Prioridad | **P1** |
| Categoría | UI |
| Evidencia | 0:10–0:17 (final del Dashboard) · 0:25–0:31 (pull-to-refresh arriba) |
| Impacto BD | Ninguno |

**Síntoma.** Al llegar al final del Dashboard el contenido sigue subiendo: el
header (logo, selector de household, tema) desaparece y la bottom nav queda
flotando a media pantalla con la mitad inferior en negro (0:12–0:16). Arriba,
tirar hacia abajo dispara el pull-to-refresh del navegador (spinner a las 0:26)
y vuelve a desplazar el shell (0:30–0:31). Solo el botón del asistente queda
fijo en su sitio.

**Dónde mirar.** El shell es `flex h-dvh overflow-hidden`
(`src/app/dashboard/layout.tsx:79`) con un único scroller
`overflow-y-auto overscroll-contain` (`layout.tsx:107`) y la bottom nav como
fila del flex (`layout.tsx:118`). Eso **no debería** poder pasar, así que algo
hace que el *documento* sea más alto que el viewport.
*Hipótesis:* `h-dvh` cambia cuando Brave oculta su barra y el documento queda
con scroll propio; o un portal/elemento `fixed` (toasts, `vv-pin-*`) agranda el
`scrollHeight`; `overscroll-behavior-y: none` en `body`
(`src/app/globals.css:129`) no aplica si el que hace scroll es `html`.

**Antes de nada, lee
[features/mobile-app-shell.md](./features/mobile-app-shell.md).** El síntoma
del video (top bar desaparecida, nav flotando a media pantalla) es el mismo que
dejó PR #59, y ese doc explica por qué el header y la nav **no** son
`position: fixed`: tres regresiones seguidas (PR #48–#59) vinieron de anclar la
chrome al layout viewport. **No vuelvas a `fixed`** (ni el shell entero con
`fixed inset-0`): eso reabre el mismo problema por otro lado.

**Qué hacer.** Instrumentar antes de adivinar (`/arreglar`): en el teléfono,
loguear `document.scrollingElement.scrollHeight` vs `innerHeight` y
`visualViewport.height` al llegar al final. El arreglo debe conservar el shell
de un viewport con flex y `app-scroll` como único scroller: encontrar qué
elemento hace desbordar el *documento* y quitar ese desborde en su origen
(y, si hace falta, `overflow: hidden` + `overscroll-behavior: none` también en
`html` para las rutas de dashboard). Si resulta ser una regresión de un PR
posterior a #61, nombrarlo.

**Criterio de aceptación.** En Brave y Chrome Android, con la barra del
navegador visible y oculta, header y bottom nav no se mueven nunca; no hay
área negra al final del scroll; el pull-to-refresh del navegador no se dispara
dentro del dashboard.

#### Prompt

```text
Trabaja en el ticket MQ-002 de Rumbo. Sigue el Contrato de ejecución (§2) de
docs/mobile-walkthrough-backlog.md y lee la sección completa del ticket MQ-002.

Objetivo: que el header y la bottom nav del dashboard no se muevan nunca en
móvil (Brave/Chrome Android), ni al final del scroll ni con pull-to-refresh.

0. Lee docs/features/mobile-app-shell.md antes de tocar nada. Prohibido hacer
   fixed el header, la bottom nav o el shell (fixed inset-0): esa ruta ya
   produjo tres regresiones (PR #48-#59) y el síntoma de este ticket es el de
   PR #59.
1. Usa /arreglar: instrumenta antes de cambiar nada. Añade un log temporal en
   el cliente que reporte document.scrollingElement.scrollHeight,
   window.innerHeight, visualViewport.height y el elemento que hace scroll
   cuando el usuario llega al final del Dashboard. Si no puedes reproducirlo
   con Playwright en viewport móvil (360x780, con y sin barra del navegador),
   deja el log listo y pide al usuario la lectura desde su teléfono.
2. Encuentra qué hace que el documento sea más alto que el viewport (portal,
   toast, elemento vv-pin-*, h-dvh vs barra dinámica).
3. Arreglo esperado: quitar el desborde del documento en su origen,
   conservando el shell de un viewport con flex y app-scroll como único
   scroller (src/app/dashboard/layout.tsx); si hace falta, overflow hidden +
   overscroll-behavior none también en html para las rutas de dashboard, sin
   romper el zoom pinch ni los estilos vv-pin-* de src/app/globals.css. Si es
   una regresión de un PR posterior a #61, identifícalo en la entrega.
4. Quita la instrumentación antes de entregar.

Verifica con qa-smoke que ninguna ruta del dashboard queda con scroll del
documento, y deja en la entrega los pasos exactos para probarlo en el teléfono.
```

---

### MQ-003 — El empty state de Transactions parpadea y miente

> ✅ Hecho el 2026-10-01 — el copy ya no depende de la forma de la URL sino de
> los datos (`src/lib/transactions/empty-state.ts`, con test): "No transactions
> yet" solo para un household sin transacciones; con historia, "No transactions
> in {período}" + "Add transaction" / "Show all time". La tab Transactions
> (bottom nav y sidebar) navega a la URL del alcance recordado, leído al tocar
> (`src/lib/filters/transaction-scope-link.ts`).
>
> **Causa confirmada** (build de producción contra un Supabase simulado): el
> mismo octubre vacío decía *yet* en `/dashboard/transactions` y *found* en
> `?month=2026-10`, así que cualquier re-render que solo cambiara la forma de
> la URL volteaba la tarjeta y su botón. El punto 4 era el Router Cache: la tab
> hace prefetch completo de la URL pelada, cuyo render depende de la cookie
> `af_tx_scope`; un re-tap reproducía el render viejo (el mes anterior) y su
> `RememberTransactionScope` reescribía la cookie con ese mes. El disparador
> exacto del parpadeo periódico del video no se reprodujo en headless; con el
> copy derivado de los datos ambas formas de URL pintan la misma tarjeta.

| Campo | Valor |
|---|---|
| Prioridad | **P1** |
| Categoría | Funcionamiento |
| Evidencia | 0:34–0:51 (análisis cuadro a cuadro) |
| Impacto BD | Ninguno |

**Síntoma.**

1. Sin tocar nada, la tarjeta alterna entre **"No transactions yet"** y
   **"No transactions found for these filters"**: 34,0–36,5 s *yet* →
   37,0–39,5 s *found* → 40,0–41,0 s *yet* → 41,5–45,0 s *found* → 47,5–48,5 s
   *yet* → 49,0–50,5 s *found*.
2. Como el botón cambia ("Add transaction" ↔ "Clear filters"), el toque de las
   0:41 sobre "Add transaction" cae en el momento del cambio y no abre nada.
3. "No transactions yet" se muestra en un household con miles de transacciones.
4. Tras "Clear filters" se ve "All time"; volver a tocar la tab Transactions
   devuelve el período a Oct 2026 (y el mes está mal por MQ-001).

**Dónde mirar.** El título depende de `hasActiveFilters`
(`src/app/dashboard/transactions/page.tsx:581-582`), que incluye
`hasPeriodParam(params)`. *Hipótesis:* la URL "pelada" pinta *yet*, luego la
restauración de `rememberedScopeQuery` (`page.tsx:591`) reescribe la URL con
el período y pinta *found*, y algo vuelve a navegar a la URL pelada →
bucle. Confirmar con logs de navegación (`router.replace`) en el cliente.

**Qué hacer.**

- Cortar el bucle de restauración (una sola restauración por aterrizaje).
- El copy depende de si el **household** tiene transacciones, no de los
  filtros: si tiene, "No transactions in {período}" + acciones "Add
  transaction" y "Show all time"; "No transactions yet" solo para household
  vacío.
- No cambiar el botón bajo el dedo: mientras se resuelve el estado, mostrar
  skeleton.

**Criterio de aceptación.** El empty state es estable (grabar 30 s sin
cambios), el copy es correcto para household con y sin datos, y el período
elegido sobrevive al re-tap de la tab.

#### Prompt

```text
Trabaja en el ticket MQ-003 de Rumbo. Sigue el Contrato de ejecución (§2) de
docs/mobile-walkthrough-backlog.md y lee la sección completa del ticket MQ-003.

Objetivo: empty state de Transactions estable y con copy correcto, y período
que sobrevive al re-tap de la tab.

1. Usa /arreglar: reproduce el parpadeo (grabación del ticket, 0:34–0:51) con
   Playwright o logs de navegación (router.replace / push, valor de
   searchParams) y confirma o descarta la hipótesis del bucle de
   restauración de rememberedScopeQuery en
   src/app/dashboard/transactions/page.tsx (~L581-591). Arregla la causa, no el
   síntoma: una sola restauración por aterrizaje.
2. Copy: "No transactions yet" solo si el household no tiene ninguna
   transacción (consulta barata tipo exists/limit 1). Si tiene, "No
   transactions in {período}" con acciones "Add transaction" y "Show all
   time"; con filtros generales activos, "No transactions found for these
   filters" + "Clear filters". Textos nuevos vía i18n-scribe.
3. Re-tocar la tab Transactions no debe resetear el período elegido.

Test: un test que fije la decisión de copy (household vacío / período vacío /
filtros activos). No toques BF-024: ese comportamiento de Apply debe seguir
igual.
```

---

### MQ-004 — El botón del asistente tapa contenido y la tab More

> ✅ Hecho el 2026-10-01 — en móvil (< lg) el asistente se abre desde un botón
> en el header, junto al toggle de tema (`MobileNav` → `useOpenAssistant()`), y
> el botón flotante es solo de escritorio. El sheet vive en `AssistantProvider`
> (`src/components/assistant-drawer.tsx`), que envuelve el shell. En 360 px
> cabe sin quitar nada del header.

| Campo | Valor |
|---|---|
| Prioridad | **P1** |
| Categoría | UI |
| Evidencia | 0:00 (sobre Net worth) · 0:10 (sobre la tab More) · 0:51 / 1:25 (saldo de una cuenta truncado) · 1:33–1:47 (acciones de subcategorías) · 2:20 ("Copy previous") · 3:41 / 3:52 (montos de Recurring) |
| Impacto BD | Ninguno |

**Síntoma.** El botón circular del asistente (icono Bot, abajo a la derecha)
se dibuja encima de: montos de filas (Accounts, Recurring), el botón de acción
de cada subcategoría, "Copy previous" en Budgets y, cuando el shell se desplaza
(MQ-002), la propia tab **More**. En Accounts el saldo de una cuenta queda
cortado a la mitad.

**Dónde mirar.** `src/components/assistant-drawer.tsx:112-123`
(`fixed bottom-[calc(6rem+env(safe-area-inset-bottom))] right-6 z-50`, se
desvanece con `data-away` al bajar, pero vuelve a aparecer encima del
contenido al detenerse).

**Qué hacer.** Elegir una:
(a) moverlo al header (icono junto al toggle de tema) o como ítem de More;
(b) mantenerlo flotante pero reservar espacio: `padding-bottom` del scroller
≥ altura del botón + margen, y alinearlo a la columna de chevrons para que
nunca caiga sobre montos;
(c) versión "peek" (media pastilla pegada al borde). Recomendado (a) en móvil:
ya hay un FAB "+" central y dos botones flotantes compiten.

**Criterio de aceptación.** En 360 px de ancho ningún monto, botón de fila ni
tab queda debajo del botón en ninguna pantalla del recorrido.

#### Prompt

```text
Trabaja en el ticket MQ-004 de Rumbo. Sigue el Contrato de ejecución (§2) de
docs/mobile-walkthrough-backlog.md y lee la sección completa del ticket MQ-004.

Objetivo: que el botón flotante del asistente no tape ningún contenido ni
tab en móvil.

Decisión ya tomada: en móvil (< lg) el acceso al asistente pasa al header,
como icono junto al toggle de tema, y el botón flotante desaparece; en lg+ se
queda como está. Si el header no tiene espacio a 360 px, alternativa: ítem en
More. No implementes las dos.

1. Componente: src/components/assistant-drawer.tsx (L112-123) y el header en
   src/app/dashboard/layout.tsx. El drawer debe seguir abriéndose igual.
2. Revisa que nada dependiera del botón flotante (data-away, padding inferior
   del scroller) y limpia lo que sobre.
3. aria-label traducido vía i18n-scribe si hace falta texto nuevo.

Verifica con qa-smoke en 360 px que Accounts, Categories, Budgets y Recurring
no tienen nada encima de montos ni botones.
```

---

### MQ-005 — Comparativas de mes en curso contra mes completo

> ✅ Hecho el 2026-10-01 — Cash flow (Dashboard y Month review) compara el mes
> abierto contra el mes anterior **hasta el mismo día** ("vs same day in Sep",
> `src/lib/dashboard/month-comparison.ts`, con tests de 31-mar vs febrero y
> bisiesto) leyendo ingresos y gastos diarios de `transaction_allocations` con
> los filtros del RPC (`daily-cash-flow.ts`, antes `daily-expenses.ts`); sin
> movimientos posteados no hay delta. Month health sin actividad muestra "Not
> enough data yet" (`monthHealth`, con test) y el snapshot de cierre no guarda
> nota. Budgets oculta el % por línea mientras el mes está abierto. Delta 0 →
> gris y sin flecha (Accounts y Budgets); esto cubre también la mitad "0,0 %
> en verde" de MQ-017. `ledger-guard`: sin hallazgos críticos; sus 4 menores
> quedaron resueltos en la misma rama.

| Campo | Valor |
|---|---|
| Prioridad | **P1** (cifras de reporte engañosas) |
| Categoría | Funcionamiento |
| Evidencia | 0:04 (Cash flow) · 0:05 (Month health) · 0:51 (Accounts) · 2:42–2:45 (Budget line "Last month") |
| Impacto BD | Ninguno |

**Síntoma.** Con el mes recién empezado (y además adelantado por MQ-001):

- Cash flow: Income, Spent y Saved muestran "↓ 100 % vs Sep" — Income y Saved
  en rojo, Spent en verde. Compara 0 del mes en curso contra el mes anterior
  **completo**.
- Budget line: "Last month … −100 %" en verde, misma causa.
- Accounts: "↑ 0,0 % vs. previous month" en verde con flecha hacia arriba.
- Month health: nota "C+" / 50 puntos sin ningún ingreso ni gasto registrado.

**Dónde mirar.** `src/app/dashboard/page.tsx:92-100` (`renderPctDelta`);
`src/lib/dashboard/spending-pace.ts:29,58-82` ya calcula
`previousAtSameDay`, pero Cash flow no lo usa; `src/lib/health/score.ts:28-37`
(componente de ahorro neutral = 50 cuando no hay ingreso);
`src/app/dashboard/accounts/page.tsx:975-978,1094-1100` (color ≥ 0 → verde).

**Qué hacer.**

- Cash flow y Budget "Last month": comparar contra el mismo día del mes
  anterior (reusar `previousAtSameDay`) o no mostrar delta hasta que el mes en
  curso tenga datos. Etiquetar "vs. same day in Sep".
- Delta = 0 → gris y sin flecha (Accounts y en general).
- Month health: si no hay ingresos **ni** gastos posteados, mostrar
  "Not enough data yet" en lugar de una nota.

**Criterio de aceptación.** El día 1 de un mes sin movimientos no aparece
ningún "−100 %", ningún 0 % coloreado, ni una nota de salud.

#### Prompt

```text
Trabaja en el ticket MQ-005 de Rumbo. Sigue el Contrato de ejecución (§2) de
docs/mobile-walkthrough-backlog.md y lee la sección completa del ticket MQ-005.

Objetivo: eliminar comparaciones y notas engañosas cuando el mes en curso
tiene pocos o ningún dato.

1. Cash flow (src/app/dashboard/page.tsx, renderPctDelta ~L92-100): comparar
   contra el mismo día del mes anterior reutilizando previousAtSameDay de
   src/lib/dashboard/spending-pace.ts, y rotular "vs same day in {mes}". Si el
   valor de referencia es 0 o el mes en curso no tiene movimientos posteados,
   no mostrar delta.
2. Budget line "Last month": misma regla.
3. Delta = 0 en cualquier badge (incluido Accounts, page.tsx ~L1091-1102): gris
   y sin flecha.
4. Month health (src/lib/health/score.ts y month-health-breakdown.tsx): sin
   ingresos ni gastos posteados en el mes, mostrar "Not enough data yet" en
   lugar de puntaje y nota. No cambies la fórmula para los casos con datos.

Los cálculos usan transaction_allocations como hoy; no cambies la fuente.
Tests Vitest para la regla de "mismo día" (incluye meses de distinta
longitud: 31-mar vs febrero) y para el caso sin datos de la nota de salud.
Corre ledger-guard antes de entregar.
```

---

### MQ-006 — Goals: resumen que ignora metas en otra moneda y cuentas vinculables incorrectas

> ✅ Hecho el 2026-10-01 — "Total saved" (Goals y Plan) suma metas en cualquier
> moneda, convertidas a la última tasa del household con `get_exchange_rate`
> (la búsqueda de net worth); una moneda sin tasa se nombra aparte
> (`src/lib/goals/summary.ts`, con test). "Linked account" depende del tipo:
> ahorro → solo activos, `debt_payoff` → solo pasivos; se limpia al cambiar de
> tipo y el server action valida lo mismo (`canLinkAccountToGoal`). Bajo el
> selector, una línea explica que el progreso sale de "Add funds", no del
> saldo de la cuenta (decisión abierta 1 de `features/goals.md`).

| Campo | Valor |
|---|---|
| Prioridad | **P1** (total mostrado incorrecto) |
| Categoría | Funcionamiento |
| Evidencia | 3:04–3:27 |
| Impacto BD | Ninguno (solo cálculo y filtro) |

**Síntoma.**

1. Tras crear una meta en COP, "Total saved" sigue en cero y dice
   "Of $0.00 target, CAD goals": la meta nueva no cuenta.
2. El selector "Linked account" lista las 22 cuentas, **incluidas** la cuenta
   tipo Debt y las tarjetas de crédito.
3. La meta se vinculó a una cuenta de ahorro con saldo positivo y aun así
   muestra progreso 0 %. Puede ser intencional (aportes explícitos), pero la
   UI no lo explica.

**Dónde mirar.** `src/app/dashboard/plan/page.tsx:153-160` (`totalSaved` filtra
`g.currency_code === baseCurrency`); opciones de cuenta en
`src/app/dashboard/goals/goal-form.tsx` (select en línea 32).

**Qué hacer.** Convertir a moneda base con la misma fuente de FX que net worth
(o mostrar un subtotal por moneda); hacer que las cuentas vinculables
dependan del tipo de meta: las metas de ahorro (emergency fund, down payment,
travel, retirement, custom) solo cuentas de activo, y `debt_payoff`
(`src/lib/goals/shared.ts:4-10`) solo cuentas de pasivo, que es justo lo que
esa meta busca saldar; bajo el selector, una línea que diga si el progreso
sigue el saldo de la cuenta o los aportes ("Add funds").

**Criterio de aceptación.** Una meta en COP aparece en el resumen (convertida
o por moneda); una meta de ahorro no se puede vincular a un pasivo, y una
meta `debt_payoff` sí puede vincularse a su pasivo; el usuario entiende de
dónde sale el progreso.

#### Prompt

```text
Trabaja en el ticket MQ-006 de Rumbo. Sigue el Contrato de ejecución (§2) de
docs/mobile-walkthrough-backlog.md y lee la sección completa del ticket MQ-006.

Objetivo: resumen de Goals correcto con metas en varias monedas y cuentas
vinculables coherentes.

1. "Total saved" (src/app/dashboard/plan/page.tsx ~L153-160): incluye metas en
   moneda no base convirtiéndolas con la misma fuente y tasa que usa net
   worth. Si no hay tasa disponible para una moneda, muestra un subtotal por
   esa moneda en lugar de excluirla en silencio. Ajusta el texto "Of X target,
   CAD goals".
2. Selector "Linked account" (src/app/dashboard/goals/goal-form.tsx): las
   opciones dependen del tipo de meta. Metas de ahorro: solo cuentas de
   activo no archivadas. debt_payoff (src/lib/goals/shared.ts): solo cuentas
   de pasivo no archivadas. Al cambiar el tipo, si la cuenta elegida deja de
   ser válida, se limpia. Valida la misma regla en el server action (no solo
   en la UI).
3. Lee docs/features/goals.md para confirmar si el progreso sigue el saldo de
   la cuenta vinculada o los aportes ("Add funds"), y agrega una línea de
   ayuda bajo el selector que lo explique. Si el doc no lo define, no cambies
   la lógica: detente y pregunta.

Sin cambios de esquema. Test Vitest del total con metas en dos monedas.
Actualiza docs/features/goals.md si cambia lo que muestra el resumen.
```

---

## 5. P2 — Fricción de UX

### MQ-007 — Sugerencias de autofill del navegador en campos de la app

> ✅ Hecho el 2026-10-01 — `autoComplete` es `"off"` por defecto en los
> primitivos `Input` y `Textarea` (todo campo de texto de la app pasa por
> ellos, incluido `AmountInput`); un token explícito gana, así que login y el
> email/contraseña de Settings conservan el autofill. Los cuatro buscadores de
> lista sueltos (Categories, Payees, Tags, Notes) pasan a `type="search"` con
> `autoComplete="off"`.

**Evidencia:** 1:16–1:19 (Debt name), 2:34 (Planned amount), 2:56–3:04 (Goal
name), 3:14 (Target amount). **Categoría:** UX. **BD:** ninguno.

**Síntoma.** Encima del teclado aparecen chips del autofill de Brave: nombres
de personas y de cuentas en "Debt name"/"Name", montos de formularios
anteriores en los campos de monto, y la barra de contraseña/tarjeta/dirección.
Ruido y riesgo de mezclar datos.

**Dónde mirar.** `src/components/amount-input.tsx:161-189` no define
`autoComplete`; los inputs de nombre en `debt-create-form.tsx` y `goal-form.tsx`
tampoco.

**Qué hacer.** `autoComplete="off"` en `AmountInput` y en los campos de nombre
libres (o el token semántico correcto cuando aplique). Verificar en Brave y
Chrome Android.

#### Prompt

```text
Trabaja en el ticket MQ-007 de Rumbo. Sigue el Contrato de ejecución (§2) de
docs/mobile-walkthrough-backlog.md y lee la sección completa del ticket MQ-007.

Objetivo: que el navegador no sugiera autofill en campos de monto ni de
nombre libre de la app.

1. Añade autoComplete="off" en src/components/amount-input.tsx y en los campos
   de nombre libre de los formularios de Debts, Goals, Budgets, Categories,
   Payees y Tags. Busca con scout cualquier otro <input> de texto libre en
   src/app/dashboard sin autoComplete.
2. No toques los formularios de login/signup: ahí el autofill es deseado.

Entrega con los pasos para verificarlo en Brave Android (abrir Create debt y
New goal: no deben aparecer chips sobre el teclado).
```

---

### MQ-008 — Selects nativos con listas largas

> ✅ Hecho el 2026-10-01 — `SearchablePicker` (`src/components/searchable-picker.tsx`)
> reusa el `SelectorSheet` del formulario de transacciones: en móvil, hoja a
> pantalla completa con búsqueda (sin acentos ni mayúsculas) y opciones
> agrupadas o indentadas; desde `sm`, `<select>` nativo con `<optgroup>`. Lo
> usan "Add budget line" (padres y subcategorías indentadas), "Linked account"
> de Goals y "Existing liability account" de Debts (cuentas agrupadas por
> tipo). **Corrección del ticket:** `category-picker.tsx` no tiene búsqueda
> (son dos selects padre/hijo); el patrón con búsqueda es `SelectorSheet`.
> `FormDialog` pasa a `translate-none` en móvil: con `translate-x-0
> translate-y-0` seguía siendo containing block de sus `fixed` y la hoja del
> picker quedaba del alto del diálogo.

**Evidencia:** 2:24–2:30 (categoría de línea de presupuesto, ~60 opciones),
3:07–3:11 (cuenta vinculada, 22 opciones), 1:16 (Create debt). **Categoría:**
UX. **BD:** ninguno.

**Síntoma.** `<select>` nativos abren el picker de Android a pantalla completa:
lista plana, sin búsqueda, subcategorías como "Padre / Hijo" mezcladas al
final, sin agrupar por tipo de cuenta. Elegir una categoría exige scroll largo
de ida y vuelta (2:26–2:30).

**Dónde mirar.** `nativeSelectCls` en `src/lib/form-styles.ts:7-8`, usado en
`src/app/dashboard/budgets/page.tsx:84`,
`src/app/dashboard/goals/goal-form.tsx:32` y
`src/app/dashboard/debts/debt-create-form.tsx:22`. El formulario de
transacción ya tiene pickers propios
(`src/app/dashboard/transactions/category-picker.tsx`,
`payee-picker.tsx`).

**Qué hacer.** Reusar el picker de categorías de transacciones (con búsqueda y
jerarquía) en "Add budget line"; un picker de cuentas agrupado por tipo
(o al menos `<optgroup>`) para Goals y Debts. Los selects cortos (Type,
Currency) pueden quedarse nativos.

#### Prompt

```text
Trabaja en el ticket MQ-008 de Rumbo. Sigue el Contrato de ejecución (§2) de
docs/mobile-walkthrough-backlog.md y lee la sección completa del ticket MQ-008.

Objetivo: reemplazar los <select> nativos de listas largas por pickers con
búsqueda.

1. "Add budget line" (src/app/dashboard/budgets/page.tsx): reutiliza
   src/app/dashboard/transactions/category-picker.tsx (búsqueda + jerarquía),
   limitado a categorías de gasto que no estén ya presupuestadas.
2. Selector de cuenta en goal-form.tsx y debt-create-form.tsx: si existe un
   picker de cuentas en el formulario de transacciones, reutilízalo; si no,
   como mínimo <optgroup> por tipo de cuenta. No crees un tercer patrón de
   picker.
3. Los selects cortos (Type, Currency) se quedan nativos.

No cambies qué opciones son válidas (eso es MQ-006 para Goals). Verifica con
qa-smoke que los tres formularios abren y que el valor elegido llega al server
action.
```

---

### MQ-009 — Skeletons en cada navegación, incluida una página estática

> ✅ Hecho el 2026-10-01 — More: su `loading.tsx` renderiza la propia página
> (no tiene datos; borrarlo habría mostrado el skeleton del Dashboard, que es
> el límite padre) y la tab More hace prefetch completo. Budgets: skeleton con
> el marco real de la página y un bloque neutro, sin "Loading" ni 4 KPIs. FAB
> "+": stale-while-revalidate de `getQuickAddFormData` (solo la primera
> apertura espera; BF-011 se mantiene porque cada apertura revalida). Medido
> en build de producción contra Supabase simulado con 150 ms por petición:
> More 394 ms con skeleton → 110 ms sin skeleton; 2.ª apertura del formulario
> 1011 ms → ~105 ms. Las pantallas con datos (Goals, Recurring, Budgets) siguen
> mostrando skeleton mientras cargan, como corresponde. Los enlaces de More ya
> usaban el prefetch por defecto de `<Link>`.

**Evidencia:** 1:28, 1:52, 2:00, 2:02, 2:48, 2:51, 3:35 (skeletons de More,
Categories, Payees, Tags, Goals, Recurring); 2:13 (Budgets); 0:54 ("Loading
form…"). **Categoría:** Performance. **BD:** ninguno.

**Síntoma.**

- Cada entrada a un módulo pinta skeleton 0,5–2 s.
- **More** muestra "Loading more options and preferences" en cada visita,
  aunque es una lista estática de enlaces.
- El skeleton de Budgets dibuja 4 KPIs + líneas con el rótulo "Loading" sobre
  el título, y el resultado es un empty state de una sola tarjeta (salto de
  layout).
- El FAB "+" abre una hoja casi vacía con "Loading form…" ~1 s.

**Dónde mirar.** `src/app/dashboard/more/loading.tsx`, `more/page.tsx:18`; los
`loading.tsx` de `categories`, `payees`, `budgets`, `goals`; la carga
perezosa del formulario global (BF-010 / BF-011: refetch en cada apertura).

**Qué hacer.** Quitar `loading.tsx` de More (o hacer la página estática); que
los enlaces de More prefetcheen; que cada skeleton tenga la forma del estado
más probable (en Budgets, el empty state si no hay budget); cachear los
datos de referencia del formulario global con revalidación en vez de
refetch bloqueante. Medir antes/después con el método de
[performance-baseline.md](./performance-baseline.md).

#### Prompt

```text
Trabaja en el ticket MQ-009 de Rumbo. Sigue el Contrato de ejecución (§2) de
docs/mobile-walkthrough-backlog.md y lee la sección completa del ticket MQ-009.

Objetivo: reducir esperas visibles al navegar entre módulos.

1. Mide primero (método de docs/performance-baseline.md) el tiempo hasta
   contenido de More, Categories, Payees, Budgets, Goals y Recurring, y la
   apertura del formulario global (FAB "+").
2. More: elimina src/app/dashboard/more/loading.tsx o haz la página estática;
   no debe mostrar skeleton.
3. Enlaces de More con prefetch.
4. Budgets: el skeleton debe tener la forma del estado más probable; quita el
   rótulo "Loading" sobre el título.
5. Formulario global: muestra el formulario con los datos de referencia en
   caché y revalida en segundo plano, sin romper BF-011 (una categoría recién
   creada debe aparecer al abrir el formulario).

Entrega una tabla antes/después. No cambies consultas financieras ni caching de
saldos (eso fue RUM-*).
```

---

### MQ-010 — Sheets con teclado autofocus que tapa el formulario

> ✅ Hecho el 2026-10-01 — `FormDialog` en móvil enfoca la hoja (no el primer
> campo) cuando el formulario tiene más de dos campos visibles; con dos o menos
> mantiene el comportamiento por defecto. La fila de acciones (`formActionsCls`
> → marcador `form-actions`) queda sticky al borde inferior de la hoja, y con
> el teclado abierto `ViewportPin` publica `data-vv-keyboard` para que la hoja
> se apoye encima del teclado. Detalle en
> [features/mobile-app-shell.md](./features/mobile-app-shell.md).

**Evidencia:** 1:16–1:21 (Create debt), 2:56 (New goal), 2:34 (Add budget
line). **Categoría:** UX. **BD:** ninguno.

**Síntoma.** Al abrir la hoja, el foco va al primer campo y el teclado ocupa
~55 % de la pantalla: en Create debt solo se ven dos campos y no se ve el
botón de guardar. La hoja no se reacomoda al teclado; el usuario tiene que
cerrar el teclado para orientarse.

**Qué hacer.** En móvil, no hacer autofocus al abrir una hoja con más de dos
campos (o hacerlo tras la animación y con la hoja anclada al
`visualViewport`); botón primario pegado al borde inferior visible
(sticky footer) por encima del teclado.

#### Prompt

```text
Trabaja en el ticket MQ-010 de Rumbo. Sigue el Contrato de ejecución (§2) de
docs/mobile-walkthrough-backlog.md y lee la sección completa del ticket MQ-010.

Objetivo: que abrir una hoja de formulario en móvil no tape el formulario con
el teclado.

1. Localiza con scout el componente de hoja/diálogo compartido (FormDialog o
   similar) y los formularios Create debt, New goal y Add budget line.
2. En móvil: sin autofocus al abrir hojas con más de dos campos; con dos o
   menos, autofocus después de la animación de apertura.
3. Botón primario en un footer sticky visible por encima del teclado
   (visualViewport), sin romper el comportamiento con zoom (vv-pin-*).

Verifica con Playwright en viewport móvil que al abrir cada hoja el título y
el botón primario están visibles.
```

---

### MQ-011 — Debts no reconoce las cuentas de pasivo existentes

> ✅ Hecho el 2026-10-01 — Debts lista las cuentas de pasivo activas sin fila
> en `debts` ("Liability accounts not in the planner"), con su saldo y "Track
> this debt", que abre Create debt con esa cuenta preseleccionada
> (`?mode=create&account=…`; el server action ya vinculaba sin crear cuenta ni
> movimiento). La tarjeta resumen se oculta sin deudas activas y un total 0 no
> va en rojo. La tarjeta Debts del Dashboard enlaza a esta lista.

**Evidencia:** 0:07 (tarjeta Debts del Dashboard), 1:12–1:14 (página Debts),
1:26 (existe una cuenta tipo Debt con saldo). **Categoría:** UX. **BD:**
ninguno.

**Síntoma.** El Dashboard dice "No debts in the Debt Planner yet. Your
accounts owe [monto] … which the planner doesn't track". La página Debts
muestra "TOTAL DEBT · 0 ACTIVE" con el cero en **rojo**, tres métricas en
"$0.00 / N/A / N/A" y luego el empty state. El usuario no tiene forma directa
de convertir su cuenta de pasivo en deuda del planner.

**Qué hacer.** En el empty state de Debts, listar las cuentas de pasivo sin
registro `debts` con un botón "Track this debt" que abra Create debt con
"Existing liability account" preseleccionada; ocultar la tarjeta resumen
cuando hay 0 deudas; cero en color neutro. Respeta la regla "pasivo +
extensión `debts`".

#### Prompt

```text
Trabaja en el ticket MQ-011 de Rumbo. Sigue el Contrato de ejecución (§2) de
docs/mobile-walkthrough-backlog.md y lee la sección completa del ticket MQ-011.

Objetivo: que Debts ofrezca convertir las cuentas de pasivo existentes en
deudas del planner.

1. En el empty state de src/app/dashboard/debts/page.tsx, lista las cuentas de
   pasivo activas sin fila en la tabla debts, cada una con "Track this debt",
   que abre Create debt con "Existing liability account" preseleccionada.
2. Con 0 deudas, oculta la tarjeta resumen (TOTAL DEBT / Monthly payment /
   Average rate / Next due day). Un total 0 nunca en rojo.
3. Aplica lo mismo al texto de la tarjeta Debts del Dashboard si enlaza aquí.

Reglas: pasivo + extensión debts; no crees cuentas nuevas ni movimientos al
vincular. Corre ledger-guard antes de entregar. Textos nuevos vía
i18n-scribe.
```

---

### MQ-012 — Tipografía monoespaciada en montos

> ✅ Hecho el 2026-10-01 — `font-mono` fuera de Debts (página y tarjeta),
> Budgets (KPIs, filas, detalle), Goals, Categories, Debt planner y el hero de
> Net worth; todos conservan `tabular-nums` sobre la sans base. Solo el display
> de la calculadora de `amount-input.tsx` sigue en mono.

**Evidencia:** 1:12 (Debts), 2:17–2:45 (Budgets), 3:26 (Goals).
**Categoría:** UI. **BD:** ninguno.

**Síntoma.** Debts, Budgets y Goals usan `font-mono` para montos ("$0 . 00",
"N/A", "COP 0" con espaciado de máquina de escribir), mientras Dashboard,
Accounts, Transactions y Recurring usan la sans proporcional. Se ve como otra
app.

**Dónde mirar.** `src/app/dashboard/debts/page.tsx`,
`src/app/dashboard/budgets/page.tsx`, `budgets/budget-line-row.tsx`,
`src/app/dashboard/goals/goal-card.tsx`.

**Qué hacer.** Reemplazar `font-mono` por `tabular-nums` sobre la fuente base
(alineación de dígitos sin cambiar de familia). Mantener mono solo en el
display de la calculadora de `amount-input.tsx` si se quiere.

#### Prompt

```text
Trabaja en el ticket MQ-012 de Rumbo. Sigue el Contrato de ejecución (§2) de
docs/mobile-walkthrough-backlog.md y lee la sección completa del ticket MQ-012.

Objetivo: misma tipografía de montos en toda la app.

1. Reemplaza font-mono por tabular-nums sobre la fuente base en
   src/app/dashboard/debts/page.tsx, src/app/dashboard/budgets/page.tsx,
   src/app/dashboard/budgets/budget-line-row.tsx y
   src/app/dashboard/goals/goal-card.tsx. Busca con grep otros font-mono
   aplicados a montos o métricas en src/app/dashboard.
2. Deja el display de la calculadora de src/components/amount-input.tsx como
   está.

Cambio solo visual. Verifica con qa-smoke que las páginas tocadas cargan.
```

---

### MQ-013 — Símbolo "$" para montos en COP y fecha dd/mm/yyyy con UI en inglés

> ✅ Hecho el 2026-10-01 — `AmountInput` usa `getCurrencyPrefix` (símbolo CLDR en
> inglés salvo el "$" de USD, que pasa a "US$": COP, CA$, US$, €; con test) y
> mide el ancho real del prefijo para el padding. `DateInput`
> (`src/components/date-input.tsx`) muestra bajo el input nativo la fecha en el
> idioma de la UI ("Thu, Oct 1, 2026"); lo usan Create debt, Register payment
> y New/Edit goal. El formulario de transacciones no tiene un date picker propio
> reutilizable (usa input nativo + chips de fecha relativa).

**Evidencia:** 3:12–3:27 (Target amount "$ …" con "In COP." debajo),
1:20 y 3:04–3:23 (inputs de fecha). **Categoría:** UX. **BD:** ninguno.

**Síntoma.** En formularios, el prefijo del monto es siempre "$" aunque la
moneda sea COP (la moneda solo aparece en un texto chico debajo). Los inputs
de fecha nativos muestran `dd/mm/yyyy` (locale del sistema) mientras la UI
está en inglés y los listados usan "Oct 31, 2026" — "01/10/2026" es ambiguo.

**Qué hacer.** Prefijo con el código o símbolo desambiguado de la moneda
seleccionada ("COP", "CA$"); debajo de cada input de fecha, la fecha
formateada en el idioma de la UI ("Thu, Oct 1, 2026"), o un date picker
propio como el de transacciones.

#### Prompt

```text
Trabaja en el ticket MQ-013 de Rumbo. Sigue el Contrato de ejecución (§2) de
docs/mobile-walkthrough-backlog.md y lee la sección completa del ticket MQ-013.

Objetivo: que los inputs de monto muestren la moneda real y las fechas no
sean ambiguas.

1. src/components/amount-input.tsx: el prefijo usa el código o símbolo
   desambiguado de la moneda que recibe (COP, CA$, US$) en lugar de "$" fijo.
   Revisa todos los lugares que lo usan para que le pasen la moneda correcta
   (Goals, Budgets, Debts, transacciones, saldos de apertura).
2. Inputs de fecha nativos de Debts y Goals: debajo de cada uno, la fecha
   elegida formateada en el idioma de la UI (p. ej. "Thu, Oct 1, 2026"). Si el
   formulario de transacciones ya tiene un date picker propio reutilizable,
   úsalo en su lugar.

Sin cambios de esquema ni de cómo se guardan montos o fechas.
```

---

### MQ-014 — Dashboard de mes nuevo: cinco empty states seguidos

> ✅ Hecho el 2026-10-01 — Dashboard sin movimientos: una tarjeta "{mes} is just
> starting" (Add transaction / Post due recurring / Set up the budget) en lugar
> de Spending + Cash flow; By category oculto e Insights oculto si no hay
> ninguno. Budgets sin líneas oculta KPIs y "How this month was paid"; Goals sin
> metas oculta sus KPIs y con metas los compacta. Sin cambios de cálculo.
> Detalle en [features/dashboard-layout.md](./features/dashboard-layout.md).

**Evidencia:** 0:00–0:11 (Dashboard), 2:17 (Budgets recién creado),
2:52–2:54 (Goals). **Categoría:** UX. **BD:** ninguno.

**Síntoma.** En un mes sin movimientos el Dashboard apila: gráfico Spending
plano con un solo punto y eje Y sin etiquetas, Cash flow en ceros, "No posted
income or expense activity…", "By category — No expenses…", "Insights — Add
transactions…", "Finish setting up". Budgets vacío muestra 4 KPIs en $0.00/N/A
y "How this month was paid" antes del empty state; Goals muestra tres KPIs a
pantalla completa en 0 que empujan "No goals yet" fuera de la vista.

**Qué hacer.** Dashboard: una sola tarjeta "New month" (qué falta: postear lo
vencido, copiar budget) y ocultar By category/Insights/Spending hasta tener
datos. Budgets/Goals: si no hay líneas/metas, mostrar el empty state arriba y
ocultar KPIs; con datos, KPIs en grilla compacta de 2–3 columnas.

#### Prompt

```text
Trabaja en el ticket MQ-014 de Rumbo. Sigue el Contrato de ejecución (§2) de
docs/mobile-walkthrough-backlog.md y lee la sección completa del ticket MQ-014.

Objetivo: que un mes sin actividad no muestre una pila de tarjetas vacías.

1. Dashboard (delega en scout: src/app/dashboard/page.tsx es muy grande): si el
   mes no tiene movimientos posteados, muestra una sola tarjeta "New month" con
   lo que falta (postear lo vencido, copiar el budget) y oculta Spending, By
   category e Insights. Revisa docs/features/dashboard-layout.md y
   actualízalo.
2. Budgets sin líneas: el empty state va primero y los KPIs y "How this month
   was paid" se ocultan. Con líneas, KPIs en grilla compacta.
3. Goals sin metas: el empty state va primero, sin los tres KPIs en cero. Con
   metas, KPIs en grilla de 3 columnas.

No cambies ningún cálculo. Verifica con qa-smoke.
```

---

### MQ-015 — Payees: cuatro acciones por fila

> ✅ Hecho el 2026-10-01 — En móvil la fila de un payee (icono + nombre + meta)
> es un solo enlace a sus transacciones y un único botón "⋯" despliega Edit /
> Merge / Archive (o Restore) bajo la fila, con la confirmación de Archive
> intacta; en sm+ quedan los iconos de siempre. El nombre y "N transactions ·
> last used …" usan todo el ancho. Tags usa el mismo patrón (Edit / Archive).
> Sin textos nuevos: reutiliza "Actions", "Edit" y "Merge".

**Evidencia:** 1:55–1:58. **Categoría:** UI. **BD:** ninguno.

**Síntoma.** Cada fila tiene 4 controles (transacciones, editar, merge,
Archive). En 360 px el nombre se trunca y "N transactions · last used
[fecha]" se parte en tres líneas.

**Dónde mirar.** `src/app/dashboard/payees/payee-row.tsx:23-80+`.

**Qué hacer.** En móvil: fila tocable que abre las transacciones del payee +
un único menú "⋯" con Edit / Merge / Archive (o swipe, como Accounts).
Desktop puede quedarse igual.

#### Prompt

```text
Trabaja en el ticket MQ-015 de Rumbo. Sigue el Contrato de ejecución (§2) de
docs/mobile-walkthrough-backlog.md y lee la sección completa del ticket MQ-015.

Objetivo: filas de Payees legibles en móvil.

1. src/app/dashboard/payees/payee-row.tsx: en móvil, la fila completa abre las
   transacciones del payee y un único menú "⋯" agrupa Edit, Merge y Archive
   (confirmaciones intactas). En sm+ puede quedar como hoy.
2. El nombre usa todo el ancho disponible; "N transactions · last used …"
   cabe en una o dos líneas a 360 px.

Mismo patrón para Tags si su fila tiene la misma estructura; menciónalo en
la entrega. Textos nuevos vía i18n-scribe.
```

---

### MQ-016 — Categories: KPI, filtros y acciones ambiguas

> ✅ Hecho el 2026-10-01 — Los dos KPI móviles cuentan la lista filtrada (tipo,
> búsqueda y archivadas; "Archived" cuando se ven archivadas). Las tabs de tipo
> ya no se encogen: la fila se desliza, un fade marca el borde con más tabs y
> la activa se centra al llegar (`categories/type-tabs.tsx`). En móvil el
> chevron de un padre solo pliega/despliega sus subcategorías; tocar la fila o
> "⋯" abre detalles y acciones, y "←|" pasa a ese panel como "Move to main
> level" con texto visible (en desktop sigue en la fila, con aria-label). El
> panel se monta solo al abrirse: sin cierre a medias ni botones invisibles en
> el orden de tabulación. "Income" dentro de Income es un dato del household,
> no de la UI: no se tocó (el ticket prohíbe cambiar jerarquía).

**Evidencia:** 1:33–1:48. **Categoría:** UX. **BD:** ninguno.

**Síntoma.**

- Al filtrar por Expense, "Subcategories" cambia pero "Active" no: mezcla
  un total global con uno filtrado.
- La fila de tabs corta "Adjustmen…" sin indicio de que se puede deslizar.
- Cada subcategoría tiene un botón `←|` sin etiqueta ni tooltip.
- El chevron de una categoría padre abre un panel de detalles (Active,
  Type, Edit, Archive) en lugar de plegar las subcategorías, que siempre
  están visibles; la animación de cierre deja la fila en un estado
  intermedio (1:41).
- Hay una categoría padre llamada igual que la sección ("Income" dentro de
  Income).

**Dónde mirar.** `src/app/dashboard/categories/page.tsx:213-221`
(`activeCategories` sale de `allCategories`, sin el filtro de tipo).

**Qué hacer.** Ambos KPI sobre el conjunto filtrado (o rotular "Active (all
types)"); fade/sombra en el borde de las tabs; `aria-label` + texto visible o
menú para la acción de subcategoría; separar "plegar hijos" (chevron) de
"ver detalles/acciones" (tap en la fila o "⋯").

#### Prompt

```text
Trabaja en el ticket MQ-016 de Rumbo. Sigue el Contrato de ejecución (§2) de
docs/mobile-walkthrough-backlog.md y lee la sección completa del ticket MQ-016.

Objetivo: Categories coherente y entendible en móvil.

1. src/app/dashboard/categories/page.tsx (~L213-221): "Active" y
   "Subcategories" sobre el mismo conjunto filtrado.
2. Tabs de tipo: indicio visual de que la fila se desliza (fade en el borde) y
   la tab activa visible al cambiar.
3. Botón "←|" de cada subcategoría: averigua qué hace y dale aria-label y
   texto visible o muévelo a un menú "⋯" junto a Edit/Archive.
4. Separa "plegar/desplegar subcategorías" (chevron) de "ver detalles y
   acciones" (tap en la fila o "⋯"), y revisa la animación que queda a medias.

No cambies jerarquía ni tipos de categorías. Textos nuevos vía i18n-scribe.
```

---

### MQ-017 — Accounts: delta neutro en verde e indicador de swipe sobre el saldo

> ✅ Hecho el 2026-10-01 — (1) El delta 0 gris y sin flecha ya lo resolvió
> MQ-005. (2) La app no tiene swipe en ninguna fila (Accounts, Payees ni
> otra; solo long-press en Transactions): el "‹" en un círculo del video es el
> indicador del gesto "atrás" de Android al arrastrar desde el borde, fuera
> del control de la app. Sin cambio. (3) Bajo `sm` la fila de una cuenta pone
> el nombre en la primera línea a todo el ancho (hasta dos líneas) y el saldo
> en la segunda, alineado a la derecha junto al subtítulo; a 360 px el nombre
> pasa de 84 px a 226 px y ya no se corta. Desde `sm` la fila queda como antes.

**Evidencia:** 0:51 (badge), 1:04 y 1:10 (indicador "‹" sobre el saldo de la
primera cuenta). **Categoría:** UI. **BD:** ninguno.

**Síntoma.** El badge "↑ 0.0 % vs. previous month" se pinta verde con flecha
(ver MQ-005). La pista de swipe ("‹" en un círculo) se dibuja encima del
monto de la fila. Nombres largos de cuentas se truncan ("…") mientras el
monto en COP ocupa media fila.

**Dónde mirar.** `src/app/dashboard/accounts/page.tsx:1091-1102`; el
componente de fila con swipe de Accounts.

**Qué hacer.** Delta 0 neutro; la pista de swipe a la derecha del chevron o
solo como animación única la primera vez; permitir dos líneas para el nombre
o mover el equivalente en moneda base a la segunda línea.

#### Prompt

```text
Trabaja en el ticket MQ-017 de Rumbo. Sigue el Contrato de ejecución (§2) de
docs/mobile-walkthrough-backlog.md y lee la sección completa del ticket MQ-017.

Objetivo: detalles visuales de Accounts.

1. Badge "vs. previous month" (src/app/dashboard/accounts/page.tsx
   ~L1091-1102): con delta 0, gris y sin flecha. Si MQ-005 ya lo arregló, salta
   este punto.
2. Indicador de swipe "‹": que no se dibuje encima del saldo (a la derecha del
   chevron o solo como animación única la primera vez).
3. Nombres largos: permitir dos líneas o mover el equivalente en moneda base a
   la segunda línea para que el nombre no se trunque a 360 px.

Cambio solo visual. Verifica con qa-smoke.
```

---

## 6. P3 — Mejoras

### MQ-018 — More: lista plana de 20+ ítems

**Evidencia:** 1:28, 2:11–2:12, 3:31–3:34. **Categoría:** UX.

**Síntoma.** More es una lista única de 20+ enlaces (Dashboard, Net Worth,
Month review, Transactions, Accounts, Categories, Payees, Tags, Notes, Import
CSV, Budgets, Goals & funds, Debts, Debt planner, Recurring, Installments,
Reports, Trends, Cash flow, Calendar, …). Repite tres tabs de la bottom nav y
no tiene agrupación, aunque `more/page.tsx:18` ya itera `navGroups`.

**Qué hacer.** Secciones con encabezado (Plan: Budgets, Goals, Debts, Debt
planner, Recurring, Installments · Analyze: Net worth, Month review, Reports,
Trends, Cash flow, Calendar · Organize: Categories, Payees, Tags, Notes,
Import CSV · Settings); quitar los ítems que ya están en la bottom nav.

#### Prompt

```text
Trabaja en el ticket MQ-018 de Rumbo. Sigue el Contrato de ejecución (§2) de
docs/mobile-walkthrough-backlog.md y lee la sección completa del ticket MQ-018.

Objetivo: More agrupado y sin duplicados.

1. src/app/dashboard/more/page.tsx y la definición de navGroups: secciones con
   encabezado — Plan (Budgets, Goals & funds, Debts, Debt planner, Recurring,
   Installments), Analyze (Net worth, Month review, Reports, Trends, Cash flow,
   Calendar), Organize (Categories, Payees, Tags, Notes, Import CSV) y
   Settings.
2. Quita de More los destinos que ya están en la bottom nav (Dashboard,
   Transactions, Accounts), solo en móvil.
3. No cambies la navegación de escritorio salvo que comparta la misma
   fuente; en ese caso conserva sus ítems.

Encabezados nuevos vía i18n-scribe.
```

---

### MQ-019 — Budgets: fila de línea y detalle poco legibles

**Evidencia:** 2:17–2:45. **Categoría:** UX.

**Síntoma.** La fila colapsada muestra solo "gastado" y "%", sin el
planificado, así que "$0.00 / 0 %" parece un error. El detalle apila 5 tiles a
ancho completo (Planned, Spent, Remaining, Used, Last month). El subtítulo
dice "October 2026 - 0 over budget." y el banner "Budget created." queda fijo
mientras se navega la página.

**Qué hacer.** Fila: "gastado of planificado" + barra; detalle en grilla 2×2;
copy "No lines over budget" (o "1 line over budget"); el banner de éxito se
descarta solo (toast).

#### Prompt

```text
Trabaja en el ticket MQ-019 de Rumbo. Sigue el Contrato de ejecución (§2) de
docs/mobile-walkthrough-backlog.md y lee la sección completa del ticket MQ-019.

Objetivo: líneas de presupuesto legibles.

1. Fila colapsada (src/app/dashboard/budgets/budget-line-row.tsx): "gastado of
   planificado" + barra.
2. Detalle expandido: grilla 2×2 (Planned, Spent, Remaining, Used) y Last
   month debajo.
3. Subtítulo: "No lines over budget" / "1 line over budget" / "N lines over
   budget" con pluralización.
4. El aviso "Budget created." se descarta solo (toast) en lugar de quedar fijo.

Sin cambios de cálculo. Textos vía i18n-scribe.
```

---

### MQ-020 — Recurring: semántica de "Auto" y secciones duplicadas

**Evidencia:** 3:36–3:57. **Categoría:** UX.

**Síntoma.** Una plantilla con chip **Auto** aparece en "Due & overdue —
ready to post" con botón "Post now": no queda claro qué automatiza "Auto" si
igual hay que postearla. El chip "Auto" a veces se va a una segunda línea
(depende del largo del nombre). "Upcoming" y "Upcoming occurrences (next 60
days)" listan casi lo mismo una debajo de otra. Las tres KPI (Active
templates, Due now, Est. monthly expense) ocupan una pantalla entera.

**Qué hacer.** Definir y mostrar qué significa Auto (p. ej. "Posts
automatically on the due date" y, si está vencida y no se posteó, explicar
por qué). Revisar junto con MQ-001: la plantilla del ejemplo vence *mañana* en
hora local. Chips en una fila fija; unificar las dos listas de próximos
(o colapsar "occurrences" por defecto); KPIs en grilla compacta.

#### Prompt

```text
Trabaja en el ticket MQ-020 de Rumbo. Sigue el Contrato de ejecución (§2) de
docs/mobile-walkthrough-backlog.md y lee la sección completa del ticket MQ-020.

Objetivo: Recurring entendible.

1. Lee docs/features/recurring-transactions.md para la definición de "Auto".
   Muestra esa definición en la UI (tooltip o línea de ayuda). Si una
   plantilla Auto está vencida y sin postear, explica por qué en la propia
   fila. Si el doc no explica cuándo se postea una plantilla Auto, no cambies
   la lógica: detente y pregunta.
2. Chips de tipo/estado en una fila fija que no envuelva según el largo del
   nombre.
3. "Upcoming" y "Upcoming occurrences": unifica o colapsa la segunda por
   defecto.
4. KPIs en grilla compacta.

Depende de MQ-001: si aún no está hecho, no intentes arreglar "Due" a la
medianoche; menciónalo en la entrega.
```

---

## 7. Observaciones fuera de alcance

No son bugs de la app; se registran para no re-descubrirlas:

- Una cuenta Cash y una cuenta de cheques con saldo negativo: datos del
  usuario; el flujo ya está cubierto por BF-005.
- Payees casi duplicados (mismo nombre con y sin apellido/tilde): se resuelve
  con "Merge duplicates", que ya existe.
- Erratas en nombres de categorías creadas por el usuario.
- Sugerencias raras del teclado ("Trip&oq") vienen del teclado del sistema,
  no de la app.

---

## Related documents

- [pending-work.md](./pending-work.md)
- [alpha/bug-friction-log.md](./alpha/bug-friction-log.md)
- [alpha/alpha-finding-triage-rules.md](./alpha/alpha-finding-triage-rules.md)
- [performance-ux-backlog.md](./performance-ux-backlog.md)
- [performance-baseline.md](./performance-baseline.md)
