# Drawing Application

_Started 2026-06-14 19:45 UTC_

---

## User

Apply drawing

## Assistant

_[tool: read_file]_

_[tool: view_image]_

Looking at the drawing and the comment — the red circle highlights three areas where values truncate: the main hero number, the Activos/Pasivos row, and especially the quick stats (Ingresos/Gastos) which use `white-space:nowrap; overflow:hidden; text-overflow:ellipsis`. I'll fix all three.

_[tool: str_replace_edit]_

I still need to add `heroNWSize` to the logic class — let me fix that now.

_[tool: read_file]_

_[tool: read_file]_

_[tool: read_file]_

Now I have everything I need. I'll add `heroNWSize` to the return object — scaling the font down for longer values:

_[tool: dc_js_str_replace]_

_[tool: done]_

Listo. Los cambios aplicados:

- **Valor principal (Patrimonio neto)** — tamaño de fuente dinámico: se reduce automáticamente según la longitud del valor (31px → 26px → 22px → 18px) y permite wrap si aún fuera necesario.
- **Activos / Pasivos** — `overflow-wrap: anywhere` + fuente reducida a 12.5px para que nunca se corten en la rejilla 50/50.
- **Quick stats (Ingresos / Gastos)** — eliminada la regla `white-space:nowrap; overflow:hidden; text-overflow:ellipsis` y reemplazada por `overflow-wrap:anywhere` con `line-height:1.3`, así los valores largos en COP simplemente bajan a la segunda línea en lugar de truncarse.

