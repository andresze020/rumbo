# Pending Work — backlog consolidado

> Documentation only. **El único backlog vivo de Rumbo.** Reúne todo lo que
> sigue abierto: features sin construir, slices pendientes, gates de QA manual,
> configuración manual de Supabase/Vercel, decisiones abiertas, ítems
> diferidos e higiene del repo. Los backlogs por tema
> ([mobile-walkthrough-backlog.md](./mobile-walkthrough-backlog.md),
> [performance-ux-backlog.md](./performance-ux-backlog.md),
> [alpha/benchmark-follow-up-issues.md](./alpha/benchmark-follow-up-issues.md),
> [alpha/bug-friction-log.md](./alpha/bug-friction-log.md)) quedan como
> **registro histórico** de tickets cerrados; un pendiente nuevo se anota
> aquí, no allí. Cada fila apunta a su doc de detalle cuando existe.
>
> **Re-auditado completo el 2026-10-22** contra `main` en `dd4d3c4`
> (76 migraciones, 76/76 aplicadas según el cierre de HH-6 del 2026-10-11).
> Cambios frente a la pasada anterior (2026-08-16 + ediciones aditivas):
> MQ-001…MQ-020 cerrados (#87–#108); RUM-001…RUM-010b cerrados; HH-7 (#120)
> añadido con su configuración manual pendiente; el sprint «Ingreso de
> transacciones Premium» desglosado en T0–T5; el seguimiento de zona horaria
> del cron (MQ-001) añadido. Lo entregado vive en `AGENTS.md` → Current
> status y en [SPRINT-LOG.md](./SPRINT-LOG.md). Mantenido por el skill
> `rumbo-state-sync` al cerrar cada sprint.

---

## Resumen rápido

| # | Qué | Prioridad | Tipo | Sección |
|---|---|---|---|---|
| 1 | Sprint «Ingreso de transacciones Premium»: código listo, falta medir en el teléfono y QA T5 | P0–P1 | Medición + QA | §1 |
| 2 | QA manual de household sharing con dos cuentas (HH-6) | Gate | QA manual | §4.1 |
| 3 | Configuración de Supabase para emails de invitación (HH-7) + leaked-password protection | Gate | Config manual | §3 |
| 4 | QA en vivo de Tier-3/4 (BR-030, BR-043, BR-037, BR-036, BR-045, BR-031) | Gate | QA manual | §4.5 |
| 5 | Verificación en iPhone real del app shell y PWA instalada | Gate | QA en dispositivo | §4.3–4.4 |
| 6 | Regresión: el diálogo «Review transaction» del asistente perdió Cancel | P2 | Código | §1 |
| 7 | Cron de auto-post por zona horaria del household (MQ-001) | P2 | Código + migración | §1 |
| 8 | Slices 2: BR-030 Pay, BR-036 RPC mensuales, BR-031 FX en edición, BR-042 meses | P2–P3 | Código | §2 |
| 9 | BF-022 reconciliación (Beta) · captura por tap (gated) | P3 | Código | §1 |
| 10 | Decisiones de producto abiertas | — | Decisión | §6 |

---

## 1. Por construir

| ID | Prio | Área | Qué falta | Detalle |
|---|---:|---|---|---|
| **TE-T0…T4** | P0–P1 | Captura | **Código entregado 2026-10-22** (rama `ccr-95b39f19-3w7kyn`): mapa del flujo, esqueleto de carga, `getQuickAddFormData` de 5–6 a 3 viajes en serie, sin renders extra tras «Add next», «+ Add next» con texto, toasts unidos, chips por frecuencia + recencia (categorías y tags), medición `?entry_timing=on`. **Falta:** medir p50/p75 en el teléfono (tabla T4) y decidir con esos números si «Add next» debe dejar de redirigir. | [alpha/sprint-transaction-entry-premium.md](./alpha/sprint-transaction-entry-premium.md#implementación--2026-10-22-rama-ccr-95b39f19-3w7kyn) |
| **TE-T5** | P0 | QA | QA en dispositivo: 12 casos (montos, signos, monedas, doble toque, hogar, Back, 320 px, Undo). | idem, «T5 — QA pendiente en dispositivo» |
| TE-pend | — | Medición | Comparación cronometrada con AndroMoney sobre la misma lista de altas, sin alternar apps. | idem, «Pendientes para cerrar implementación» |
| Asistente-Cancel | P2 | Asistente | Regresión de PR #64: el diálogo «Review transaction» de `assistant-chat.tsx` no usa `useBackDismiss` (Back sale de la página) y `onCancel` solo oculta el link Cancel. Elegir: cablear `useBackDismiss`, o que `TransactionForm` invoque `onCancel` desde un botón visible. Sigue cerrable por X, Escape y backdrop. | [SPRINT-LOG.md](./SPRINT-LOG.md) → «Ask for the category first…» |
| MQ-001-cron | P2 | Recurrentes | `run_recurring_autopost` corre a las 06:00 UTC con `current_date`. La columna `households.timezone` ya existe (migración `20261001120000_mq_001_household_timezone.sql`) pero nada la lee ni la escribe. Falta: el job postea por household con `(now() at time zone h.timezone)::date` y la app escribe la columna. Hoy no afecta a Toronto/Montréal; sí a zonas UTC-7 o más al oeste. | [mobile-walkthrough-backlog.md](./mobile-walkthrough-backlog.md#mq-001--today-y-el-mes-actual-se-calculan-en-utc) |
| BF-022 | P3 | Transacciones | Flujo de reconciliación («cleared» contra extracto). Requiere migración (`reconciled_at`). Diferido a Beta v0.13. | [alpha/bug-friction-log.md](./alpha/bug-friction-log.md) |
| Tap capture | — | Captura / automatización | Solo diseño, **sin código**. Gate duro: el spike de Fase 0 debe probar que un tap real emite un evento legible en el teléfono y la tarjeta del usuario. | [features/tap-payment-capture.md](./features/tap-payment-capture.md) · [spike](./alpha/tap-capture-phase-0-spike.md) |

## 2. Slices 2 de features ya entregadas

Diferidas a propósito, no olvidadas.

| ID | Área | Qué falta | Por qué se difirió | Detalle |
|---|---|---|---|---|
| BR-030 s2 | Tarjetas de crédito | Acción **`Pay`** (liquidación). El ciclo de estado de cuenta ya está vivo (`get_card_cycle_summaries`). | Un pago es una escritura real en el ledger; merece su propio slice. | [features/card-statement-cycle.md](./features/card-statement-cycle.md) |
| BR-036 s2 | Periodos / presupuestos | Budgets, cierres de mes y Dashboard siguen en mes **calendario**; Reports respeta `month_start_day`. Hay que mover las RPC mensuales (alto radio de impacto). Depende de la decisión de §6. | Slice 1 probó el resolver sin tocar RPC. | [features/month-start-day.md](./features/month-start-day.md) |
| BR-031 s2 | Multimoneda | Los formularios de **edición** (`transaction-edit-form.tsx`, `transfer-edit-form.tsx`) no tienen FX: ni vista previa en moneda base ni montos pareados. | Separado al entregar BR-031. | [alpha/benchmark-follow-up-issues.md](./alpha/benchmark-follow-up-issues.md) |
| BR-042 s2 | Reports | Filas de **meses dentro de un año** (las semanas dentro de un mes ya existen). | Diferido al entregar BR-042. | idem |

## 3. Configuración manual (Supabase / Vercel)

Nada de esto se cierra desde el código; lo hace el usuario en el panel.

| Ítem | Estado | Qué hacer | Detalle |
|---|---|---|---|
| Emails de invitación (HH-7, #120) | Sin confirmar | (1) SMTP propio en Authentication › Emails › SMTP Settings (el remitente integrado solo llega al equipo, 2 emails/hora); (2) plantillas «Confirm signup» y «Magic Link» apuntando a `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next={{ .RedirectTo }}`; (3) Site URL = dominio de producción; (4) Email OTP expiration en 24 h. Luego probar una invitación real de punta a punta. | [features/household-sharing.md](./features/household-sharing.md) → HH-7 |
| Leaked-password protection | Recomendado, no hecho | Activarla en Supabase Auth. | idem |

## 4. Gates de QA manual

Necesitan dispositivo real, sesión autenticada o fixture saneado.

### 4.1 Household sharing (HH-6)

La única tarea antes de declarar la feature terminada: el pase manual con dos
cuentas reales en [alpha/hh-6-household-sharing-qa.md](./alpha/hh-6-household-sharing-qa.md)
(todas las filas *Untested*). Incluye los 3 tests `run-as=co-member` de
`npm run db:test` que necesitan dos miembros reales, la mitad RLS de BR-044 y,
tras HH-7, el flujo de invitación por email.

### 4.2 Residuales de PR #37

Fuente: [alpha/pr-37-authenticated-qa.md](./alpha/pr-37-authenticated-qa.md).

| Área | Estado | Acción |
|---|---|---|
| Reglas de categorización CSV | Untested | Crear una regla temporal, aplicar un CSV saneado, ver que pega en la vista previa, archivar la regla. |
| Historial / revert de import CSV | Partial | Subir un fixture saneado y verificar la regla activa en la vista previa antes de confirmar. |
| Transferencias | Partial | Enviar fixtures misma moneda y cruzada; reconciliar ambos saldos. |
| Costos de transferencia | Partial | Verificar a mano spread/fee, fee misma moneda, aviso de sobrecosto y detalle guardado. |

### 4.3 PWA instalada

| Área | Estado | Acción |
|---|---|---|
| Manifest `shortcuts` | Untested | Checklist de app instalada en [features/pwa.md](./features/pwa.md#installed-app-verification). Una pestaña normal no vale como evidencia. |
| `share_target` | Untested | Compartir texto + URL desde otra app; el quick-add debe prellenarse **sin** auto-enviar. |

### 4.4 Chrome móvil en iPhone real

El app shell (#61) y el fix de MQ-002 (#90) solo se verificaron en Chromium
headless. Si algo falla, **no** volver a `position: fixed` + corrección; ver
[features/mobile-app-shell.md](./features/mobile-app-shell.md).

| Área | Estado | Acción |
|---|---|---|
| Top bar + bottom nav, Safari | Untested on device | Scroll largo hasta ambos extremos: las barras no se mueven ni con rubber-band ni al colapsar la toolbar. |
| Top bar + bottom nav, PWA instalada | Untested on device | Igual, en la app instalada. |
| Pinch zoom | Untested on device | Zoom, pan a una esquina, abrir diálogo y bottom sheet: overlay completo y magnificado; FAB y toasts al borde con tamaño normal. |
| Install hint (#60) | Untested on device | En iPhone con notch la tarjeta «Add to Home Screen» se ve completa bajo la barra. |

### 4.5 Tier-3 / Tier-4 con datos reales

Checklist: [alpha/tier-3-4-authenticated-qa.md](./alpha/tier-3-4-authenticated-qa.md)
(registrar como `## Results — YYYY-MM-DD`). BR-035, BR-039, BR-040 y UC-9 ya
corren en `npm run db:test`; BR-030 y BR-043 tienen auditoría, fix e
invariantes. Falta, en orden: el vistazo en pantalla de **BR-030** y
**BR-043**; luego **BR-037**, **BR-036**, **BR-045** y **BR-031**; luego las
mitades en pantalla de las filas automatizadas.

### 4.6 Formulario de quick entry (PR #64)

| Área | Estado | Acción |
|---|---|---|
| Scroll con teclado abierto ya no salta | Razonado, no probado en dispositivo | En Android, escribir con el teclado arriba y hacer scroll mientras colapsa la barra de URL: no debe saltar al campo enfocado. |
| Fixes de procedencia del autofill (re-elegir categoría, cambiar tipo, escribir sobre un campo sembrado, tag creado a mitad de tap) | Razonado, no probado en dispositivo | Repetir los 4 escenarios del commit de review de #64 en el dispositivo real. |
| iPhone SE / 13 mini | Conocido, no es bug | Desborda 127 px / 51 px; ocultar Repeat, Notes y Status (preferencias BR-032) lo cubre. Sin código salvo que se quiera cambiar el default. |

### 4.7 Rediseño móvil de Transactions (PR #66)

| Área | Estado | Acción |
|---|---|---|
| Cambio de household | Razonado, no probado en vivo | Con 2+ membresías (ya posible tras HH-*), cambiar desde la app bar y confirmar que todas las pantallas se re-escopan. |
| Hoja de periodo con URL filtrada por payee/tag | Razonado, no probado en vivo | URL solo con `payee_id` o `tag_id`: la hoja debe decir «All time» sin perder el filtro. |
| Long-press para seleccionar | No probado en hardware | En un teléfono real: entra en selección múltiple sin hacer scroll ni abrir la fila (umbral de 8 px ajustado a ojo). |

### 4.8 Performance (RUM-*) — verificaciones en vivo diferidas

RUM-002/003/005/006/007 se cerraron sin credenciales de Supabase en la sandbox;
sus checklists manuales en [performance-ux-execution-status.md](./performance-ux-execution-status.md)
quedan para el usuario. Pendiente concreto: medición «después» del costo de la
cláusula de privacidad de HH-1 en producción, y lector de pantalla real sobre
los `role="status"` de RUM-007.

## 5. Limitaciones aceptadas (decisiones, no bugs)

No «arreglar» sin reabrir la decisión.

| Área | Limitación | Por qué |
|---|---|---|
| Transferencias recurrentes (UC-9) | Las de moneda cruzada **no se auto-postean**. | El monto que llega solo lo conoce el usuario; adivinarlo fabricaría dinero. |
| Cierre de mes (BR-021) | Marcador suave, reabrible; no bloquea el ledger. | Un mes cerrado debe seguir corrigiéndose en Alpha. |
| Transfer-as-expense (BR-039) | Llega a KPIs, tendencia, semanas y calendario, nunca al desglose por categoría. | Sale de la pierna de entrada sin allocation; saldos, net worth y budgets intactos. |
| Pinch zoom móvil | Sigue habilitado. | iOS ignora `user-scalable=no`; deshabilitarlo falla WCAG 1.4.4. |
| Chrome móvil no `fixed` | Top bar y bottom nav son filas flex de un shell de un viewport. | Tres rondas de `fixed` corregido fallaron. Leer [features/mobile-app-shell.md](./features/mobile-app-shell.md) antes de tocarlo; scroll vía `src/lib/app-scroll.ts`. |
| Cuotas (BR-035) | El plan no guarda dinero ni hay transacción padre. | Hace imposible el doble conteo por construcción. |
| FX en UTC (MQ-001) | Las tasas usan `fxToday()` en UTC aunque «hoy» de la app sea local. | Las tasas del proveedor van fechadas en UTC; con día local una tasa manual quedaba fuera del saldo. |

## 6. Decisiones abiertas

| Tema | Pregunta | Doc |
|---|---|---|
| Goals | ¿Una meta vinculada a una cuenta debe derivar su progreso del saldo real del ledger en vez de `current_amount` manual? | [features/goals.md](./features/goals.md) |
| Month start day | ¿Qué **significa** un `budgets.budget_month` / `month_closures` guardado cuando el periodo ya no coincide con el mes calendario? Es la parte difícil de BR-036 s2 y merece decisión escrita. | [features/month-start-day.md](./features/month-start-day.md) |
| Asistente | Idea #6: el asistente como interfaz principal. Solo si los datos de uso lo justifican. | [features/beginner-friendly-ux.md](./features/beginner-friendly-ux.md) |
| Quick entry | ¿Payees recientes como chips de un toque? | [SPRINT-LOG.md](./SPRINT-LOG.md) → «Ask for the category first…» |
| Cache de datos | Ya decidido y entregado: Router Cache de 30 s (`staleTimes`, RUM-005) invalidado por cada escritura, con los timings de servidor medidos (B-5 cerrado 2026-09-25). Sigue sin decidir solo si conviene una cache de datos aparte (React Query/SWR/`unstable_cache`); no hay bloqueo, hace falta un caso de uso que la justifique. | [performance-ux-execution-status.md](./performance-ux-execution-status.md) |

## 7. Diferido / estacionado (revisar solo si se dispara)

| ID | Área | Revisar cuando |
|---|---|---|
| BR-D01 | Adjuntos / recibos | El uso real pruebe que hace falta, u OCR sea prioridad. |
| BR-D02 | Rendimiento de inversiones | Los flujos de caja/deuda/presupuesto del household estén estables. |
| BR-D03 | Dividir gastos / reembolsos | El uso multi-miembro cree esa necesidad (ahora posible tras HH-*). |
| BR-D04 | Acceso de asesor / externo | Invitaciones y miembros estén en uso (entregado en HH-4/5/7). |
| BR-D05 | Gráficos avanzados (Sankey, reportes guardados) | Se pida más análisis que el hub de BR-022. |
| BR-D06 | OCR / bank sync / billing | Decisión de producto explícita. |

## 8. Higiene del repositorio

| Ítem | Qué lo cierra |
|---|---|
| **Dos invariantes necesitan una columna inexistente.** (a) `installment_plans` no guarda el `p_as_of` de `cancel_installment_plan`; (b) `recurring_autopost_log` no guarda las dos monedas. | (a) `installment_plans.cancelled_as_of date` + check; (b) `source_currency_code` / `destination_currency_code` en el log, escritos en `run_recurring_autopost()`. Migraciones aditivas pequeñas; hacerlas cuando otro cambio entre en esas funciones (MQ-001-cron toca la segunda). |
| **Sprints que mergean directo a `main` sin cierre.** Pasó con #48–#61 y otra vez con los MQ (#87–#108) y HH-7 (#120), que no tienen entrada en `SPRINT-LOG.md`. | Correr `/cerrar-sprint` sobre el rango cuando se asiente una racha de PRs sueltos. Lo peligroso no es la historia faltante sino docs de estado *incorrectos*. |

---

## Ya cerrado (para que no se vuelva a proponer)

- **BR-001 … BR-048**: cerrado salvo los cuatro slices 2 de §2. Todos los BF
  salvo BF-022 están arreglados.
- **MQ-001 … MQ-020** (recorrido móvil, 2026-10-01, #87–#108) — detalle en
  [mobile-walkthrough-backlog.md](./mobile-walkthrough-backlog.md). Único
  remanente: MQ-001-cron (§1).
- **RUM-001 … RUM-010b** (performance / integridad financiera, cerrado
  2026-09-25) — detalle en [performance-ux-backlog.md](./performance-ux-backlog.md)
  y [performance-ux-execution-status.md](./performance-ux-execution-status.md).
  Remanentes en §4.8 y §6.
- **HH-0 … HH-7** (household sharing, 2026-10-08 → #120): construido y
  aplicado. Remanentes en §3 y §4.1.
- **Tier-4, Tier-3, Mobile-capture parity** (merge 2026-08-12) y anteriores —
  ver `AGENTS.md` → Current status y [SPRINT-LOG.md](./SPRINT-LOG.md).
