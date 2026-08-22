# AI Agents en el desarrollo de App Finanzas

## Status

**Implementado (olas 1 y 2).**

Ola 1 — *corrección*: subagente `ledger-guard`, comando `/revisar-ledger`, hooks
`SessionStart` y `Stop`.

Ola 2 — *presupuesto de contexto* (2026-08-19): subagentes `scout`,
`i18n-scribe`, `migration-drafter` y `sprint-closer`; comandos `/buscar`,
`/contexto`, `/i18n`, `/cerrar-sprint` y `/arreglar`; hook `PreToolUse` `context-guard`;
`AGENTS.md` adelgazado de 42 KB a 9 KB; MCP de Supabase apagado por defecto.

Desde el 2026-08-22 hay CI en GitHub Actions y los invariantes del ledger son
ejecutables (`npm run db:test`). Lo que sigue sin existir son tests
automatizados de UI, descritos abajo en "Siguiente ola" con el criterio para
decidir cuándo valen la pena.

---

## Contexto

Hasta ahora el desarrollo de App Finanzas es **conversacional**: se abre una
sesión de Claude Code, se describe una feature, Claude la implementa. El
conocimiento del proyecto está bien capturado (`AGENTS.md`, 10 skills en
`.claude/skills/`), pero **nada se ejecutaba solo**.

El síntoma concreto: el gate de validación vive en la skill
[`app-finanzas-verify`](../.claude/skills/app-finanzas-verify/SKILL.md), o sea
en un documento que Claude **debe acordarse de leer**. Si se le olvida, nadie lo
detiene. Lo mismo con las reglas del ledger.

Este documento explica los cuatro primitivos de automatización disponibles, cuál
resuelve qué, y cuáles se instalaron aquí.

---

## Los cuatro primitivos

| Primitivo | Qué es | Quién lo dispara | ¿Garantiza algo? |
|---|---|---|---|
| **Skill** | Conocimiento reutilizable en Markdown | Claude, si su `description` matchea | No — puede ignorarla |
| **Subagente** | Claude con prompt propio, **contexto separado** y herramientas restringidas | Claude, o tú con un comando | No, pero aísla el trabajo |
| **Hook** | Comando de shell **determinista**. No es IA | El sistema, ante un evento | **Sí** — puede bloquear |
| **CI / headless** | Claude corriendo sin ti presente | Push, PR, cron | Sí, pero fuera de tu máquina |

La distinción que más cuesta al principio:

- Una **skill** es *memoria*. Le dice a Claude cómo hacer algo bien cuando decide
  hacerlo. No obliga a nada.
- Un **hook** es *ley*. Se ejecuta siempre. Si sale con código 2, **bloquea** a
  Claude y le devuelve el mensaje de error para que lo arregle. Aquí, y solo
  aquí, viven las garantías.
- Un **subagente** es *delegación*. Su valor real no es "razona mejor", es que
  **no gasta tu contexto principal**. Una revisión adversarial completa de un
  diff consume decenas de miles de tokens; en un subagente eso ocurre en una
  ventana aparte y a ti solo te vuelve el veredicto.

Corolario práctico: **si algo tiene que pasar siempre, no lo escribas como
skill.** Escríbelo como hook.

---

## Qué se instaló

### 1. Subagente `ledger-guard`

Archivo: [`.claude/agents/ledger-guard.md`](../.claude/agents/ledger-guard.md)

Revisor de **solo lectura** (`tools: Read, Grep, Glob, Bash`) que compara un
diff contra las reglas duras del ledger: saldos derivados de
`transaction_entries`, reportes leyendo de `transaction_allocations`,
transferencias que no inflan ingreso ni gasto, `household_id` en toda consulta
household-scoped, nada de service-role, migraciones aditivas, nada de borrado
físico.

Reporta 🔴 crítico / 🟡 menor / ✅ verificado, y **no edita nada**. Esa
restricción es deliberada: un revisor que además arregla tiende a arreglar
inventando, y a ocultar el hallazgo en el proceso.

Las reglas completas siguen viviendo en la skill
[`app-finanzas-ledger-rules`](../.claude/skills/app-finanzas-ledger-rules/SKILL.md).
El subagente **las aplica**, no las redefine.

### 2. Comando `/revisar-ledger`

Archivo: [`.claude/commands/revisar-ledger.md`](../.claude/commands/revisar-ledger.md)

Cinco líneas de Markdown que lanzan el subagente sobre el diff actual. Existe
por una razón boba pero real: **un subagente que no es descubrible no se usa**.
Es el primitivo más barato de todos.

```
/revisar-ledger
/revisar-ledger solo src/lib/analysis
```

### 3. Hook `SessionStart` — informativo

Archivo: [`.claude/hooks/session-context.mjs`](../.claude/hooks/session-context.mjs)

Al arrancar una sesión imprime rama actual, si el working tree está limpio, y
los últimos commits. Su stdout entra al contexto de Claude. Cubre la regla de
`AGENTS.md` *"verify clean working tree before switching or starting"* sin
depender de que alguien la recuerde. **Nunca bloquea.**

### 4. Hook `Stop` — enforcing

Archivo: [`.claude/hooks/verify-gate.mjs`](../.claude/hooks/verify-gate.mjs)

Esta es la pieza que convierte `app-finanzas-verify` de sugerencia en garantía.
Cuando Claude intenta terminar un turno:

1. Si `stop_hook_active` es `true` → sale 0. **Sin esta guarda hay bucle
   infinito**: el hook bloquea, Claude reintenta terminar, el hook vuelve a
   bloquear.
2. Si no cambió ningún `.ts`/`.tsx` → sale 0 en silencio. Los turnos de solo
   documentación no pagan el costo.
3. Si ya validó este mismo estado del árbol (huella de `HEAD` + `git status`)
   → sale 0 en silencio. Evita recorrer `tsc` en turnos consecutivos sin cambios.
4. Si no: corre `npx tsc --noEmit`. Al fallar sale con **código 2** y los errores
   por stderr — que es la forma en que un hook le devuelve trabajo a Claude.

Detecta cambios tanto sin commitear como ya commiteados contra `main`, así que
**commitear no evade el gate**.

Escapes, en orden de contundencia:

```powershell
$env:APP_FINANZAS_SKIP_VERIFY = "1"   # una corrida
```

…y para desactivarlo del todo, borra el bloque `"Stop"` de
`.claude/settings.json`. Nada de esto es irreversible.

### Por qué `.mjs` y no comandos de shell

Los hooks corren como comandos del sistema. El checkout real es Windows /
PowerShell, pero las sesiones remotas corren en Linux. Node es lo único
garantizado en ambos, y el repo ya usa ese patrón en `scripts/*.mjs`.

---

## Árbol de decisión

Cuando quieras automatizar algo nuevo, en este orden:

1. **¿Tiene que pasar siempre, sin excepción?** → Hook. Es lo único que
   garantiza.
2. **¿Es conocimiento que Claude debe aplicar cuando toque cierto tema?** →
   Skill. Barato y ya tienes 10.
3. **¿Es una tarea grande y acotada cuyo detalle no te interesa ver?** →
   Subagente. Especialmente si consumiría mucho contexto.
4. **¿Tiene que pasar aunque tú no estés?** → CI / headless. Es el único que
   requiere infraestructura y presupuesto.

Y el filtro previo a todo, dado que esto es un MVP Alpha: **¿el problema ya
ocurrió al menos dos veces?** Si no, no lo automatices todavía.

---

## Ola 2 — el presupuesto de contexto (2026-08-19)

La ola 1 atacaba la corrección: que Claude no cerrara un turno con tipos rotos.
La ola 2 ataca el **costo**. El diagnóstico medido sobre este repo:

| Fuga | Costo por sesión |
|---|---|
| `AGENTS.md` de 42 KB leído al arrancar | ~11.000 tokens |
| Archivos de 1.400–2.700 líneas leídos enteros | ~17k–32k tokens cada uno |
| Artefactos generados (`.next`, lockfile, tsbuildinfo) | variable, siempre inútil |
| Esquemas del MCP de Supabase, se use o no | ~2k–4k tokens |

### `AGENTS.md` adelgazado

Su sección `## Current status` acumulaba 22 entradas de sprint, **ya duplicadas**
en `docs/SPRINT-LOG.md`. Se dejaron las 2 más recientes y se apuntó al log:
42.333 → 9.185 bytes (−78 %). Dos entradas que solo existían en `AGENTS.md`
(*Hard-backlog integration PR #37* y *Analysis & planning screens PR #12*) se
migraron al log antes de borrarlas — el log pasó de 24 a 26 entradas.

La regla se mantiene sola: `sprint-closer` rota la tercera entrada al log cada
vez que añade una nueva.

### Subagentes como aislamiento de contexto

El valor de un subagente no es que "sepa más": es que su exploración ocurre en
**su** ventana y solo vuelve el resumen. Por eso los cuatro nuevos son
precisamente los trabajos que más contexto queman:

| Subagente | Qué aísla | Devuelve |
|---|---|---|
| `scout` | recorrer `src/` para saber dónde está algo | mapa `archivo:línea` |
| `i18n-scribe` | `src/lib/i18n/` (~4.100 líneas) | claves tocadas + estado del check |
| `migration-drafter` | `supabase/migrations/` (58 archivos, 626 KB) | el `.sql` + comandos manuales |
| `sprint-closer` | diff completo + 3 docs de estado | qué se actualizó |

`migration-drafter` hereda la prohibición absoluta de tocar la base: escribe el
archivo y devuelve los comandos para que los corras a mano.

### Hook `PreToolUse` — `context-guard`

Un skill que dice "no leas archivos grandes" es un recordatorio. Un hook es una
garantía — la misma lógica que justificó `verify-gate` en la ola 1.

`context-guard.mjs` sale con código 2 (bloquea y le devuelve el motivo a Claude)
cuando:

1. La ruta es un artefacto generado — `.next/`, `node_modules/`, `.git/`,
   `package-lock.json`, `*.tsbuildinfo`, `coverage/`, `*.log`.
2. Se lee entero un archivo de más de **700 líneas** sin `offset`/`limit`.
   No prohíbe el archivo: exige Grep primero, o lectura paginada, o delegar.
3. Lo mismo vía shell — `cat`, `type`, `Get-Content` — que es la vía de escape
   natural cuando `Read` está bloqueado. `cat X | head -20`, `sed -n`, `grep` y
   `Get-Content -Tail` pasan sin ruido: ya son lectura parcial.

`AGENTS.md` y `CLAUDE.md` están exentos: son cortos y se quieren enteros.

El mensaje de bloqueo no dice solo "no"; enumera las tres alternativas. Un hook
que rechaza sin enseñar el camino correcto solo produce reintentos, que también
cuestan tokens.

**Nota de implementación:** todas las rutas se normalizan a `/` antes de
compararse. Escribir los patrones con backslashes para Windows es frágil — se
pierden al pasar por heredocs y por JSON — y una guarda que falla en silencio es
peor que ninguna.

### MCP de Supabase apagado por defecto

`"disabledMcpjsonServers": ["supabase"]` en `.claude/settings.json`. Sigue
declarado en `.mcp.json`; se enciende con `/mcp` cuando de verdad vas a
consultar la base. Ver `docs/supabase-mcp.md`.

### Permisos más anchos para lo barato

Cada prompt de permiso es una ida y vuelta con su costo. Se añadieron al
`allow` los comandos de solo lectura (`ls`, `grep`, `sed -n`, `gh pr view`,
`git show`…). Los `deny` destructivos no se tocaron, y se les sumaron `Read()`
sobre artefactos generados como cinturón por si el hook fallara.

---

## Costos y riesgos

- **Subagentes**: consumen tokens propios. Una revisión de `ledger-guard` sobre
  un sprint mediano no es gratis. A cambio, no envenena tu sesión principal.
- **Hooks mal escritos**: pueden dejarte trabado. Los dos de aquí degradan con
  gracia — si falta `node_modules`, `verify-gate` avisa y **no** bloquea, para
  que un clon fresco no quede inutilizable.
- **Hooks lentos**: `tsc --noEmit` sobre este proyecto tarda ~5 s en frío y ~0,1 s
  cuando la caché acierta (medido en 2026-08-19).
  De ahí las tres salidas tempranas antes de correrlo.
- **`context-guard` puede estorbar**: si un archivo legítimamente hay que
  leerlo entero (una reescritura completa, por ejemplo), el hook obliga a
  paginar o a delegar. Es fricción deliberada, pero es fricción. El umbral de
  700 líneas está en la constante `BIG_FILE_LINES`; las excepciones, en
  `ALWAYS_FULL`.
- **El ahorro no es gratis**: delegar en un subagente cuesta sus propios tokens.
  Para una pregunta que se responde con un `grep`, delegar es más caro que no
  hacerlo. `scout` gana cuando la respuesta está repartida en varios archivos
  grandes; no para buscar un símbolo que ya sabes dónde está.
- **Falsa sensación de cobertura**: un typecheck en verde no dice nada sobre si
  los números financieros son correctos. Eso sigue siendo el smoke test manual
  de [`app-finanzas-alpha-qa`](../.claude/skills/app-finanzas-alpha-qa/SKILL.md).

---

## Validación automatizada

### CI en GitHub Actions

`.github/workflows/ci.yml` (2026-08-22) corre lint → `tsc --noEmit` →
`i18n:check` → build en cada pull request y en cada push a `main`. Es la misma
puerta que aplica el hook `Stop` local, ejecutada donde el hook no llega: un PR
abierto desde una sesión en la nube nunca pasa por esta máquina.

El build usa valores placeholder de Supabase, no secrets. Puede hacerlo porque
todas las rutas son server-rendered on demand, así que el build nunca llega a
la base, y el cliente de Anthropic es lazy.

### Invariantes del ledger

`npm run db:test` (2026-08-22) ejecuta los tres `.sql` de `supabase/tests/`
contra la base enlazada, vía la Management API. Es la única cobertura de tests
real del repo: valida las reglas del ledger directamente contra la base, que es
donde de verdad importan.

Detalle que no conviene romper: el splitter de `scripts/db-test.mjs` manda cada
statement por separado —la API solo devuelve las filas del último de cada
request— **excepto** el bloque `begin; do $$ … $$; rollback;` de
`br_019_goals_invariants.sql`, que viaja entero. Partirlo mandaría el cuerpo en
su propia transacción confirmada y dejaría datos de prueba escritos en
producción.

Se niega a adivinar el hogar cuando el proyecto tiene más de uno; pásalo con
`--household=<uuid>`.

---

## Siguiente ola (no implementada)

### Tests automatizados de UI

No hay framework de tests JS/TS.

**Por qué no ahora**: automatizar el QA de localhost requiere Playwright más una
suite que hoy no existe; es un sprint entero, no un accesorio. El paso
intermedio barato ya se dio — los invariantes SQL de arriba.

### Claude revisando PRs

Posible vía GitHub Actions con la API. Implica secrets, presupuesto de API y
cambiar el flujo de merge manual que define `app-finanzas-sprint-flow`.

---

## Referencias

- [`AGENTS.md`](../AGENTS.md) — estado canónico del proyecto
- [`.claude/CLAUDE.md`](../.claude/CLAUDE.md) — reglas de producto y arquitectura
- [`docs/pending-work.md`](./pending-work.md) — índice de lo que sigue abierto
