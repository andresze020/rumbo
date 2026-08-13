# Mapa de arquitectura

Dos entregables sobre el mismo modelo: uno para personas y otro para agentes.

| Archivo | Para qué |
| --- | --- |
| `architecture.html` | Diagrama interactivo autocontenido. Ábrelo con doble clic — no necesita servidor, red ni dependencias. |
| `architecture.json` | El modelo `{ nodes, edges, flows }` para consumo programático (agentes IA, generadores de documentación, análisis de impacto). |
| `template.html` | Cáscara del HTML, con `__GRAPH_DATA__` como marcador. |
| `build-html.mjs` | Valida el JSON e inyecta los datos en la plantilla para producir `architecture.html`. |

Regenerar tras editar el JSON o la plantilla:

```bash
node docs/architecture/build-html.mjs
```

El build falla si un `edge` o un paso de `flow` apunta a un `id` de nodo que no
existe, así que el HTML publicado nunca puede quedar con referencias colgadas.

## El HTML

- **Diagrama por capas** de izquierda a derecha: Cliente → Edge → Rutas →
  Server Actions → `src/lib` → Acceso a datos → Funciones SQL → PostgreSQL →
  Plataforma. La posición de un nodo ya dice a qué capa pertenece.
- **Panel de flujos** a la derecha, agrupado por categoría. Al elegir un flujo
  se resalta la ruta completa en el diagrama, se numeran los nodos en orden y
  el resto se atenúa. El encuadre se ajusta automáticamente a la ruta.
- **Tooltips** en cada nodo con su tecnología, descripción y ruta de archivo.
- **Ficha de componente** (pestaña Componentes o clic en un nodo) con sus
  dependencias, quién lo usa y en qué flujos aparece.
- **Enlaces profundos**: `architecture.html#flow-txn-create` abre ese flujo ya
  resaltado; `#node-rpc-refund` abre la ficha de ese componente. El hash se
  actualiza solo al navegar, así que cualquier vista es compartible.
- Rueda para acercar, arrastre para mover, `0` ajusta, `Esc` limpia, `+` / `−`
  hacen zoom. Tema claro/oscuro automático con conmutador manual (`?theme=light`
  fuerza uno). Responsive: en móvil el panel se apila bajo el diagrama.

## El JSON

```jsonc
{
  "meta":   { /* stack, convenciones y conteos del proyecto */ },
  "layers": [ { "id", "order", "label", "description" } ],
  "groups": [ { "id", "layer", "label" } ],          // subdivisiones dentro de una capa
  "nodes":  [ { "id", "label", "type", "layer", "group", "file", "tech", "description" } ],
  "edges":  [ { "source", "target", "label", "kind" } ],
  "flows":  [ { "id", "name", "category", "summary",
                "steps": [ { "node", "action" } ] } ]
}
```

`kind` de una arista: `nav` (navegación), `call` (invocación), `data` (lectura o
escritura de tablas), `policy` (autorización RLS), `fk` (clave foránea),
`scheduled` (job programado), `external` (servicio externo).

Los pasos de un flujo son una narración ordenada, no una lista de aristas: dos
pasos consecutivos pueden no tener una arista estática entre ellos (por ejemplo
dos tablas que escribe la misma función SQL). El HTML dibuja esos saltos con
línea discontinua para distinguirlos de una dependencia real.

## Alcance

Refleja el código de `main` a partir del 2026-08-12, cuando Tier-3, Tier-4 y la
rama de filtros/UX móvil se fusionaron: 133 componentes, 272 conexiones y 27
flujos. Cuando el código y este mapa discrepen, gana el código — y este mapa es
el bug, igual que `AGENTS.md`.

**Lo que aún no recoge:** la rama de filtros/UX móvil (cookie `af_tx_scope`,
`useBackDismiss`, `ScreenTransition`) entró después de dibujar el mapa, así que
sus componentes nuevos todavía no son nodos. Y las nueve migraciones de Tier-3 y
Tier-4 están en el repositorio pero **sin aplicar** a la base: el mapa describe
el esquema que definen, no el que hay hoy en Supabase.
