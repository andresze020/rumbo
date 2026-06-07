# User Settings Page

## Contexto

No existe actualmente ninguna página de configuración de cuenta. El usuario solo puede hacer Sign out. Se propone `/dashboard/settings` como hub centralizado de preferencias y gestión de cuenta.

---

## Estructura propuesta

### Ruta
`/dashboard/settings`

### Secciones

#### 1. Perfil
- Nombre para mostrar (display name)
- Email actual (read-only, con opción de cambio)

#### 2. Seguridad
- Cambiar contraseña (Supabase Auth: `supabase.auth.updateUser({ password })`)
- Cambiar email (requiere confirmación en ambos emails)
- Cerrar sesión en todos los dispositivos (`supabase.auth.signOut({ scope: 'global' })`)

#### 3. Household
- Nombre del hogar (editable)
- Moneda predeterminada del hogar (informativo — afecta formateo display)

#### 4. Apariencia
- Selector de tema: Sistema / Claro / Oscuro
  - Unifica con el ThemeToggle actual del nav (podrían coexistir o el nav puede eliminarse)

#### 5. Zona de peligro
- Eliminar cuenta (soft delete + limpieza de datos del household)
  - Requiere confirmación por texto ("eliminar")
  - Implementación: marcar household como deleted, revocar sesión

---

## Consideraciones técnicas

- **Supabase Auth** maneja cambio de password y email nativamente
- El cambio de email dispara emails de confirmación a ambas direcciones (comportamiento de Supabase)
- `display_name` y `household.name` se guardan en la DB, no en auth metadata (preferible)
- La moneda predeterminada ya existe en el modelo de datos del household
- Eliminar cuenta requiere una migration/función RPC que limpie RLS data antes de borrar el user

---

## UI propuesta

```
Settings
├── Profile
│   ├── [Input] Display name          [Save]
│   └── [Input] Email (read-only)     [Change email →]
│
├── Security
│   ├── [Button] Change password
│   └── [Button] Sign out all devices
│
├── Household
│   ├── [Input] Household name        [Save]
│   └── [Info]  Default currency: CAD
│
├── Appearance
│   └── [SegmentedControl] System | Light | Dark
│
└── Danger zone
    └── [Button destructive] Delete account
```

---

## Dependencias

- Requiere que exista un punto de entrada en el nav (avatar menu o sidebar)
- Cambio de email requiere revisar templates de Supabase Auth (opcional)
- Eliminar cuenta es la operación más compleja — puede diferirse a una fase posterior

---

## Estado

**[pendiente]** — Esperando decisión de navbar para definir punto de entrada.

---

## Tareas (cuando se implemente)

- [ ] Crear `src/app/dashboard/settings/page.tsx` con Server Component
- [ ] Crear `src/app/dashboard/settings/profile-form.tsx` (Client Component)
- [ ] Crear `src/app/dashboard/settings/security-form.tsx` (Client Component)
- [ ] Crear `src/app/dashboard/settings/appearance-form.tsx` (Client Component)
- [ ] Crear `src/app/dashboard/settings/household-form.tsx` (Client Component)
- [ ] Crear `src/app/dashboard/settings/danger-zone.tsx` (Client Component)
- [ ] Crear `src/app/dashboard/settings/settings-actions.ts` (Server Actions)
- [ ] Agregar link a Settings en el nav (avatar menu o sidebar, según decisión de navbar)
- [ ] Opcional: RPC `delete_household_data` para zona de peligro
