---
description: Arregla un bug reportado — instrumenta antes de adivinar, ubica con scout, un fix a la vez
---

Bug reportado:

$ARGUMENTS

Sigue este orden. Está escrito porque saltárselo ya costó caro: un "los filtros
no aplican" se llevó cuatro rondas y **tres fixes plausibles pero equivocados**
antes de que una sola línea de consola encontrara la causa real.

## 1. Entiende el síntoma antes de tocar nada

Si no tienes los pasos exactos de reproducción, pídelos ahora — una pregunta
corta cuesta muchísimo menos que un fix equivocado. Necesitas: qué hizo el
usuario, qué esperaba, qué pasó, y en móvil o escritorio.

## 2. Ubica el código

Si ya sabes dónde vive, ábrelo con `Grep` + `Read` con `offset`/`limit`.
Si **no** lo sabes, o el síntoma podría venir de varios sitios, delega en
`scout` (`subagent_type: "scout"`): te devuelve `archivo:línea` sin traerte
archivos de 2.000 líneas al contexto.

## 3. Si el código no explica el síntoma, INSTRUMENTA — no adivines

Esta es la regla que más tokens ahorra. Un fix equivocado cuesta el fix, la
verificación, el reporte del usuario y la siguiente ronda.

Para bugs que solo se ven en el navegador:

- Añade `experimental.browserDebugInfoInTerminal: 'verbose'` a
  `next.config.ts` y **reinicia** el dev server. Next reenvía la consola del
  navegador a la terminal, que puedes leer directamente desde un Bash en
  background — sin pedirle capturas de DevTools al usuario.
- Usa `console.log`, **nunca `console.debug`**: DevTools esconde Verbose por
  defecto y el contador de "N ocultos" pasa desapercibido.
- Si sospechas divergencia entre estado y DOM, loguea **ambos en el mismo
  instante**. Esa comparación descarta media docena de teorías de un golpe.
- Un `[Violation] 'popstate' handler` justo después de navegar significa que
  algo está deshaciendo la navegación.
- Marca los logs y el flag como TEMPORAL en el código, y **quítalos antes de
  mergear**.

## 4. Un fix a la vez

No apiles tres cambios plausibles esperando que uno pegue. Aplica el que la
evidencia respalda, verifica, y solo entonces sigue. Si la evidencia no señala a
uno solo, vuelve al paso 3.

## 5. Cierra bien

- Arregla en **móvil y escritorio**, aunque solo se haya reportado uno.
- Quita la instrumentación temporal.
- Corre la puerta de validación (`app-finanzas-verify`): `npm run lint` y
  `npx tsc --noEmit`.
- Si tocó saldos, transferencias, deudas o presupuestos → `/revisar-ledger`.
- Prueba manualmente el flujo en localhost. Un typecheck en verde no dice nada
  sobre si el bug se fue.
