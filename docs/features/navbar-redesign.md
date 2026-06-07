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

**[pendiente]** — En discusión entre Opción C y Opción D.

---

## Tareas (cuando se decida)

**Opción C:**
- [ ] Crear `NavMoreDropdown` con links utilitarios
- [ ] Crear `UserAvatarMenu` con Settings / Sign out
- [ ] Actualizar `dashboard/layout.tsx` y `mobile-menu.tsx`
- [ ] Conectar con `/dashboard/settings` cuando exista

**Opción D:**
- [ ] Crear `AppSidebar` (expandido + colapsado, state en localStorage)
- [ ] Refactorizar `dashboard/layout.tsx` a grid sidebar + content
- [ ] Crear `MobileSidebarDrawer` (Sheet de shadcn/ui)
- [ ] Mover ThemeToggle y UserAvatar al fondo del sidebar
- [ ] Conectar con `/dashboard/settings` cuando exista
