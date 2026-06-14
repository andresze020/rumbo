# Rediseño UI/UX — Handoff Claude Design (2026-06)

> Índice y plan de implementación por fases del rediseño de **App Finanzas**
> (desktop + móvil/PWA) entregado por Claude Design y anclado a este repo real.
>
> **Estado:** documentación / plan. Nada implementado todavía.
> **Disciplina:** MVP-Alpha. Ver `AGENTS.md` y `.claude/CLAUDE.md`. Los módulos
> futuros entran **solo** como navegación + placeholders bloqueados; no se
> construye backend post-MVP en este plan.

## Contenido de esta carpeta

| Ruta | Qué es |
|---|---|
| `HANDOFF-ORIGINAL.md` | README original del bundle de Claude Design ("read this first"). |
| `chats/chat1.md` | Transcript principal — aquí vive la intención del usuario. |
| `chats/chat2.md` | Transcript del ajuste de overflow del hero móvil. |
| `project/App Finanzas.dc.html` | Prototipo **desktop** (9 pantallas). |
| `project/App Finanzas Movil.dc.html` | Prototipo **móvil/PWA** (4 pantallas). |
| `project/src/components/*` | Snapshot de los primitivos del repo que usó el diseñador como referencia. |
| `project/screenshots/*` | Capturas de referencia. |
| `prompts/` | Prompts listos para Claude Code, **uno por sprint**. |

## Cómo leer los prototipos

Son archivos `.dc.html` (Design Components): markup con `{{ … }}` y bloques
`<sc-if>` / `<sc-for>`, más una clase `Component` en `<script type="text/x-dc">`
al final con los datos y la lógica. **No se renderizan en navegador**; se leen
como fuente. Cada pantalla es un `<sc-if value="{{ isX }}">`.

Pantallas desktop: `isDashboard`, `isTx`, `isMetas`, `isPlanificador`,
`isRevision`, `isAutomatizacion`, `isSystem`, `isReports`, `isComing`.
Pantallas móvil: `isHome`, `isTx`, `isPlan`, `isMore` + bottom-nav con FAB.

## El hallazgo clave

Los tokens del diseño **ya coinciden** con `src/app/globals.css` (primario azul
`oklch(0.546 0.245 262.881)`, grises neutros, Geist/Geist Mono). Esto es una
evolución de jerarquía/layout/densidad sobre el sistema existente, **no** un
re-skin. Los primitivos del repo mapean 1:1 con los del diseño.

## Mapa diseño → componente del repo

| Pieza del diseño | Componente / archivo del repo |
|---|---|
| Sidebar por grupos | `src/components/app-sidebar.tsx` (+ nuevo `src/lib/nav/config.ts`) |
| Bottom-nav móvil + FAB | nuevo `src/components/mobile-bottom-nav.tsx` (reemplaza el `Sheet` de `mobile-nav.tsx`) |
| Topbar (mes/moneda/idioma/tema/add) | `src/components/{month-nav,theme-toggle,language-provider}.tsx`, `page-header.tsx` |
| MetricCard / KPI | `src/components/metric-card.tsx` |
| Monto coloreado por signo | `src/components/{money,balance-amount}.tsx` |
| Banners de estado | `src/components/callout.tsx` |
| Tile por tipo de cuenta | `src/components/account-avatar.tsx` |
| Gráficos (donut, tendencia) | `src/components/trend-chart.tsx` (Recharts) |
| Estado vacío | `src/components/empty-state.tsx` |
| Estado "Próximamente" / locked | **nuevo** `src/components/locked-feature-card.tsx` |
| Quick-add (FAB) | `src/components/{transaction-dialog-provider,global-add-transaction-button}.tsx`, `src/app/dashboard/quick-add-actions.ts` |
| Strings ES/EN/FR | `src/lib/i18n/dictionaries.ts` |
| Tokens | `src/app/globals.css` (ya alineados) |

## Plan por fases

Ver `IMPLEMENTATION-PLAN.md` para el detalle. Resumen:

| Sprint | Alcance | Riesgo | Backend |
|---|---|---|---|
| **0** | Guardar handoff + docs (este folder) | nulo | — |
| **1** | Sistema de navegación: grupos + fases + locked | bajo | no |
| **2** | Bottom-nav móvil + FAB + pantallas Más/Planear | medio | no |
| **3** | Dashboard "Centro de control" | medio | no (datos existentes) |
| **4** | Transacciones inline + selección masiva | medio | no |
| **Futuro** | Metas, Planificador, Mes en revisión, Reportes, Automatización | — | sí (no en este plan) |

## Matriz de fases (badges en la nav)

| Fase | Badge | Trato | Ejemplos |
|---|---|---|---|
| **Alpha** | sin badge | Funcional ahora | Dashboard, Cuentas, Transacciones, Presupuestos, Deudas, Patrimonio, Recurrentes, Categorías, CSV, Ajustes |
| **Beta** | ámbar | Nav + locked | Metas y fondos, Planificador de deuda, Mes en revisión |
| **Pronto** | gris | Nav + locked | Reportes, Tendencias, Flujo de caja, Reglas, Cola de revisión |
| **Pro** | dorado | Nav + locked | Plan / Billing, asesor solo-lectura |

## Qué es dato real vs. mock

- **Real (usar):** net worth, métricas del mes (allocations), presupuestos,
  deudas, recurrentes (próximos pagos), transacciones.
- **Derivado de datos reales (permitido, no regulado):** insights del dashboard
  (categoría sobre presupuesto, flujo de caja positivo, baja de deuda, #pagos
  próximos).
- **Mock — marcar explícitamente en UI/código:** health score del mes, textos
  de teaser de módulos Beta/Pro.

## Reglas que el plan respeta

- No agregar features post-MVP como funcionales (`.claude/CLAUDE.md`).
- Sin migraciones Supabase en ningún sprint de este plan.
- Rama por sprint; commits solo cuando el usuario lo pida explícitamente.
- Gate de validación por sprint: `npm run lint`, `npx tsc --noEmit`,
  `npm run build`, smoke manual (skill `app-finanzas-verify`).
