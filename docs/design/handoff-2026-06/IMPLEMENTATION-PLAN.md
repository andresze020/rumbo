# Plan de implementación por fases — Rediseño UI/UX 2026-06

Detalle de cada sprint. Cada uno tiene un prompt listo en `prompts/`.
Implementar **en orden**; cada sprint es mergeable por sí solo y deja la app
funcionando. Ajusta el alcance entre sprints según lo que aparezca en uso real.

Convenciones:
- **Real** = usar datos del backend existente.
- **Mock** = dato simulado; debe marcarse en UI (ej. tooltip "demo") y en código.
- **Locked** = no funcional; muestra estado "Próximamente" con fase.

---

## Sprint 0 — Preservar handoff + documentación
**Objetivo:** dejar el handoff y el plan versionados en el repo. (Hecho en esta carpeta.)
**Entregables:** `docs/design/handoff-2026-06/` con bundle, índice, plan y prompts.
**Backend:** ninguno. **Riesgo:** nulo.

---

## Sprint 1 — Sistema de navegación (grupos + fases + locked)
**Objetivo:** IA escalable sin tocar el contenido de las pantallas.

**Tareas**
1. `src/lib/nav/config.ts`: fuente única de navegación.
   ```ts
   type Phase = 'alpha' | 'beta' | 'soon' | 'pro'
   type NavItem = { href: string; labelKey: TranslationKey; icon: LucideIcon; phase: Phase }
   type NavGroup = { titleKey: TranslationKey; items: NavItem[] }
   ```
   Grupos: Visión general · Dinero · Planeación · Análisis · Automatización · Configuración.
2. Refactor `src/components/app-sidebar.tsx` para renderizar grupos con título +
   badge de fase. Mantener colapsado/`localStorage` actual.
3. `src/components/locked-feature-card.tsx` + ruta genérica
   `src/app/dashboard/coming-soon/[feature]/page.tsx` (lee `featureKey`, muestra
   título, descripción, fase, ícono, y un `Callout` "Próximamente").
4. Items futuros en el config (Metas, Planificador, Mes en revisión, Reportes,
   Tendencias, Flujo de caja, Automatización, Asistente módulo, Hogar,
   Privacidad, Plan) → `phase` beta/soon/pro → navegan a `coming-soon`.
5. Badges de fase: estilos ámbar (beta) / gris (soon) / dorado (pro).
6. Claves i18n nuevas en `src/lib/i18n/dictionaries.ts` (ES/EN/FR ya existen).

**Archivos:** `lib/nav/config.ts`, `components/app-sidebar.tsx`,
`components/nav-links.tsx`, `components/locked-feature-card.tsx`,
`app/dashboard/coming-soon/[feature]/page.tsx`, `lib/i18n/dictionaries.ts`.
**Backend:** ninguno. **Riesgo:** bajo. **Mock:** ninguno.

---

## Sprint 2 — Bottom-nav móvil + FAB
**Objetivo:** experiencia PWA de uso diario.

**Tareas**
1. `src/components/mobile-bottom-nav.tsx`: tabs Inicio/Movimientos/+/Planear/Más
   con FAB central. Activo por ruta.
2. FAB contextual: menú con Gasto / Ingreso / Transferencia / Pago de deuda /
   Import CSV. Reusar `transaction-dialog-provider` + `quick-add-actions.ts`.
3. `src/app/dashboard/more/page.tsx`: módulos disponibles vs. futuros (reusa
   `LockedFeatureCard`) + acceso a Ajustes/idioma/tema/perfil.
4. `src/app/dashboard/plan/page.tsx`: agregadora móvil de Presupuestos (real) +
   Deudas (real) + Metas (locked) + próximos pagos (real, de recurrentes).
5. `src/app/dashboard/layout.tsx`: bottom-nav en móvil, sidebar en desktop;
   retirar/replegar el `Sheet` de `mobile-nav.tsx`.

**Archivos:** `components/mobile-bottom-nav.tsx`, `components/mobile-nav.tsx`
(deprecar), `app/dashboard/layout.tsx`, `app/dashboard/more/page.tsx`,
`app/dashboard/plan/page.tsx`.
**Backend:** ninguno. **Riesgo:** medio (cambio estructural de layout móvil).
**Mock:** ninguno (todo reusa flujos existentes).

---

## Sprint 3 — Dashboard "Centro de control financiero"
**Objetivo:** dashboard escaneable con jerarquía del diseño.

**Layout:** `max-width ~1340px`, grid principal `1fr / 304px` (rail derecho).

| Bloque | Dato | Componente |
|---|---|---|
| Net-worth hero + sparkline + health score | net worth **real**; health score **MOCK** | nuevo `financial-hero-card` |
| 4 métricas (ingresos/gastos/ahorro/tasa, deltas) | **real** | `metric-card.tsx` |
| Budget vs real (barras top) | **real** | barras + `Money` |
| Donut por categoría | **real** | `trend-chart.tsx` / Recharts Pie |
| Próximos pagos | **real** (recurrentes Due/Upcoming) | lista |
| Rail: Insights "Live" | **derivado** de datos reales | nuevo `insight-card` |
| Rail: Deudas mini | **real** | barra de progreso |
| Rail: Metas mini | **locked (Beta)** | `locked-feature-card` |
| Actividad reciente | **real** | filas de transacción |

**Reglas:** reusar `MetricCard`, `Money`/`BalanceAmount`, `Callout`,
`SectionHeading`. Respetar `app-finanzas-ledger-rules` (dashboards usan
`transaction_allocations`; balances desde `transaction_entries`). Marcar el
health score como demo en UI y código.

**Archivos:** `app/dashboard/page.tsx`, `components/dashboard-summary.tsx`,
nuevos `components/{financial-hero-card,insight-card}.tsx`.
**Backend:** ninguno (datos existentes). **Riesgo:** medio.

---

## Sprint 4 — Transacciones: edición inline + masiva
**Objetivo:** edición de baja fricción.

**Tareas**
1. Edición rápida **inline** por fila (merchant con autocompletar, categoría,
   monto) sin abrir diálogo. Reusar server actions existentes.
2. Selección **masiva** con barra de acciones (marcar revisada, categorizar).
3. Chips de filtro + estados de revisión (Por revisar / Revisada / Marcada).
4. Mantener agrupado por fecha (Hoy/Ayer) que ya existe.

**Archivos:** `app/dashboard/transactions/page.tsx`,
`transaction-filters.tsx`, `transaction-edit-form.tsx`, `actions.ts`.
**Backend:** ninguno (reusa actions). **Riesgo:** medio.

---

## Futuro (diseñado, NO implementar en este plan)
Metas y fondos · Planificador de deuda · Mes en revisión · Reportes /
Tendencias / Flujo de caja · Automatización / Reglas / Cola de revisión ·
Asistente como módulo full · Colaboración del hogar · Plan / Billing.

Cada uno requiere schema/migraciones y debe priorizarse como sprint propio con
los skills `app-finanzas-ledger-rules` + `app-finanzas-supabase-rls`. Hasta
entonces viven como nav + locked (Sprint 1).

---

## Gate de validación (todos los sprints)
1. `npm run lint`
2. `npx tsc --noEmit`
3. `npm run build` (cuando sea factible)
4. Smoke manual del flujo tocado (claro/oscuro, ES/EN/FR, COP/CAD/USD sin overflow)

Rama por sprint. Commit/push/merge **solo** cuando lo pidas. Sin
`npx supabase db push` automático.
