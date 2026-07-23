# Navbar Redesign

## Contexto

El nav horizontal se saturó al agregar el toggle de dark mode. Actualmente tiene:
9 links (Dashboard, Accounts, Transactions, Budgets, Debts, Net Worth, Categories, Import CSV, Export) + ThemeToggle + Sign out = demasiado para una barra horizontal de ancho fijo.

---

## Opciones propuestas

### Opción A — "More" dropdown *(descartada)*
Mantener los 5-6 links primarios visibles y colapsar los utilitarios en un dropdown `More ▾`. Cambio mínimo pero no escala ni resuelve la sensación de desorden.

### Opción B — Avatar menu *(parcial)*
Mover Sign out y futura configuración a un avatar/iniciales en el extremo derecho. Libera espacio pero no resuelve la densidad de links.

---

### Opción C — "More" dropdown + Avatar menu *(candidata)*

Links primarios en barra | utilitarios en `More ▾` | controles en avatar menu derecho.

**Estructura:**
```
[Logo]  [Dashboard] [Accounts] [Transactions] [Budgets] [Debts] [Net Worth]  [More ▾]       [☀ Avatar ▾]
                                                                               Categories      Settings
                                                                               Import CSV      Sign out
                                                                               Export
```

**Pros:**
- Cambio quirúrgico — no toca el layout raíz
- Implementación rápida (2-3 componentes nuevas)
- El usuario ya conoce la estructura actual
- Avatar menu conecta directamente con el Problema 2 (settings)
- Mobile no cambia (ya tiene hamburger menu)
- Bajo riesgo de regresión

**Cons:**
- Sigue siendo un nav horizontal — no escala si se agregan más módulos
- El `More ▾` oculta contenido que el usuario tiene que descubrir
- No cambia la percepción visual del producto ("sigue pareciendo admin panel")
- A largo plazo, `More` se convierte en un cajón de todo

---

### Opción D — Sidebar colapsable *(candidata)*

Navegación en un rail izquierdo con icono + label. Colapsable a solo iconos. Avatar/controles en la parte inferior del sidebar.

**Estructura (expandida):**
```
┌─────────────────┐
│ [W] App Finanzas│
├─────────────────┤
│ 📊 Dashboard    │
│ 💳 Accounts     │
│ ↕  Transactions │
│ 🎯 Budgets      │
│ ⚖  Debts        │
│ 📈 Net Worth    │
│ 🏷  Categories  │
│ ─────────────── │
│ ↑  Import CSV   │
│ ↓  Export       │
├─────────────────┤
│ [AV] User       │  ← avatar + settings
│ [☀] Theme       │
└─────────────────┘
```

**Estructura (colapsada):**
```
┌────┐
│ W  │
├────┤
│ 📊 │
│ 💳 │
│ ↕  │
│ 🎯 │
│ ⚖  │
│ 📈 │
│ 🏷 │
│ ── │
│ ↑  │
│ ↓  │
├────┤
│ AV │
│ ☀  │
└────┘
```

**Pros:**
- Escala infinitamente — docenas de links sin saturar
- Estética fintech premium (patrón Linear, Vercel, GitHub, Notion)
- Más espacio horizontal para el contenido de cada página
- Secciones agrupadas naturalmente (Finance | Tools)
- Avatar al fondo = lugar natural para settings, tema, sign out
- Estado colapsado = máximo espacio en pantalla
- Se puede persistir la preferencia en localStorage

**Cons:**
- Refactor de layout significativo — `dashboard/layout.tsx` cambia por completo
- Mobile requiere un drawer/sheet separado (más trabajo)
- Más complejidad de estado (colapsado/expandido, persistencia)
- El layout actual funciona bien en mobile; sidebar agrega capas
- Sprint más largo (~2-3x el tiempo de la Opción C)

---

## Comparativa directa

| Criterio               | Opción C | Opción D |
|------------------------|----------|----------|
| Tiempo de implementación | ~1 día  | ~2-3 días |
| Riesgo de regresión    | Bajo     | Medio    |
| Escalabilidad          | Media    | Alta     |
| Impacto visual         | Moderado | Grande   |
| Mobile                 | Sin cambio | Requiere drawer |
| Conecta con Settings   | Sí (avatar) | Sí (sidebar bottom) |
| Reversibilidad         | Fácil    | Costosa  |

---

## Decisión

**Opción D — Sidebar colapsable. ✅ Implementada.** (Decidida 2026-07-23.)

El nav horizontal descrito arriba ya no existe: `dashboard/layout.tsx` monta un
`AppSidebar` colapsable en desktop (grupos Overview / Money / Planning /
Analysis / Automation / Settings desde `lib/nav/config.ts`, colapso a solo
iconos con persistencia en `localStorage`, tooltips en estado colapsado). En
mobile la navegación vive en `MobileNav` (top bar delgado: marca + tema),
`MobileBottomNav` (5 slots + FAB con drawer de quick-add) y la página
`/dashboard/more`.

---

## Tareas (Opción D)

- [x] Crear `AppSidebar` (expandido + colapsado, state en localStorage)
- [x] Refactorizar `dashboard/layout.tsx` a sidebar + content
- [x] Navegación mobile (`MobileNav` top bar + `MobileBottomNav` + `/dashboard/more`)
- [x] Mover ThemeToggle y Sign out al fondo del sidebar
- [x] Bloque de usuario (avatar con iniciales + email) al fondo del sidebar → `/dashboard/settings`
- [x] Conectar con `/dashboard/settings` (existe y está en el grupo Settings)

### Pendiente menor / futuro
- [ ] Un menú de avatar más rico (cambiar household, perfil) cuando exista gestión de miembros
- [ ] Considerar un `Sheet` deslizable en mobile si el bottom-nav + More se queda corto
