# Acceso directo a Supabase desde un agente (MCP)

`.mcp.json` declara el servidor MCP oficial de Supabase, acotado al proyecto
`karbhlstwxhjdnepglza` (App Finanzas, `us-east-2`). Da a los agentes que corren
en este checkout —Claude Code y Codex— acceso directo a la base: consultar el
esquema, ejecutar SQL, leer logs y correr los *security advisors*.

El archivo **no contiene ningún secreto**: el token se lee de la variable de
entorno `SUPABASE_ACCESS_TOKEN`.

## Puesta en marcha (una vez por máquina)

1. Crea un Personal Access Token en
   <https://supabase.com/dashboard/account/tokens>.
2. Guárdalo como variable de entorno de usuario:

   ```powershell
   setx SUPABASE_ACCESS_TOKEN "sbp_..."
   ```

3. **Cierra y reabre la terminal y Claude Code.** Los servidores MCP se cargan
   al arrancar: mientras no reinicies, el servidor no existe para el agente.
4. Comprueba con `/mcp` que aparece `supabase` como conectado.

## Modo de escritura — lo que esto implica

Está configurado **con permisos de escritura**, por decisión explícita
(2026-08-12). El agente puede ejecutar DDL y DML contra la base de producción,
que es la que guarda los datos financieros reales del hogar.

Para pasarlo a solo lectura basta añadir un flag en `.mcp.json`:

```jsonc
"args": ["-y", "@supabase/mcp-server-supabase@latest",
         "--read-only",                     // ← envuelve cada consulta en una transacción de solo lectura
         "--project-ref=karbhlstwxhjdnepglza"]
```

Consideraciones mientras siga en escritura:

- **No hay entorno de staging.** Esta base es la de producción, y no hay copia
  contra la que probar. Un `UPDATE` sin `WHERE` no tiene deshacer.
- **`--project-ref` acota el alcance** a este proyecto: el token da acceso a
  toda la organización, y sin ese flag el servidor lo expondría entero.
- **Las migraciones siguen siendo el canal para cambios de esquema.** Un DDL
  aplicado por MCP no queda en `supabase/migrations/`, así que el repositorio
  dejaría de describir la base — exactamente la deriva que el proyecto evita
  teniendo un archivo por cambio.
- `.claude/CLAUDE.md` mantiene la regla de no ejecutar `npx supabase db push`
  por iniciativa propia. El MCP no la deroga.
- Un token filtrado da acceso a la base entera. Se revoca desde el mismo panel
  donde se creó.

## Verificar el esquema sin MCP

Cuando el MCP no esté disponible (por ejemplo, sin reiniciar todavía), el CLI ya
autenticado sirve para lo esencial:

```bash
npx supabase migration list --linked   # qué migraciones están aplicadas de verdad
npx supabase db push --dry-run --linked # qué se aplicaría, sin aplicarlo
```

`npx supabase db dump` y `db diff` **no** funcionan en esta máquina: requieren
Docker Desktop, que no está instalado.

Para comprobar si un objeto existe usando solo la clave publicable, sirve una
sonda contra PostgREST — pero con cuidado, porque **resuelve funciones por
firma, no por nombre**: llamar a un RPC con cuerpo vacío devuelve `PGRST202`
tanto si la función existe como si no. Hay que pasarle sus parámetros reales
para que la respuesta signifique algo.
