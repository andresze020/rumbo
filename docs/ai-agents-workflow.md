# AI Agents en el desarrollo de App Finanzas

## Status

**Implementado (primera ola).**
Existen y funcionan: el subagente `ledger-guard`, el comando `/revisar-ledger`,
y los hooks `SessionStart` y `Stop`. No hay CI en GitHub Actions ni tests
automatizados de UI — ambos están descritos abajo en "Siguiente ola" con el
criterio para decidir cuándo valen la pena.

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

## Costos y riesgos

- **Subagentes**: consumen tokens propios. Una revisión de `ledger-guard` sobre
  un sprint mediano no es gratis. A cambio, no envenena tu sesión principal.
- **Hooks mal escritos**: pueden dejarte trabado. Los dos de aquí degradan con
  gracia — si falta `node_modules`, `verify-gate` avisa y **no** bloquea, para
  que un clon fresco no quede inutilizable.
- **Hooks lentos**: `tsc --noEmit` sobre este proyecto tarda ~5 s en frío y ~0,1 s
  cuando la caché acierta (medido en 2026-08-19).
  De ahí las tres salidas tempranas antes de correrlo.
- **Falsa sensación de cobertura**: un typecheck en verde no dice nada sobre si
  los números financieros son correctos. Eso sigue siendo el smoke test manual
  de [`app-finanzas-alpha-qa`](../.claude/skills/app-finanzas-alpha-qa/SKILL.md).

---

## Siguiente ola (no implementada)

### CI en GitHub Actions

Hoy no existe `.github/` en el repo: los PRs se mergean sin ninguna validación
automática. Un workflow con `npm run lint`, `npx tsc --noEmit` y `npm run build`
sobre cada PR sería el mayor salto de confianza disponible.

**Por qué no ahora**: el flujo de release es manual y de un solo desarrollador,
y los hooks locales ya cubren el mismo gate antes de que el código salga de la
máquina. El CI se vuelve necesario cuando haya un segundo colaborador, o cuando
empieces a mergear desde el móvil o desde sesiones remotas donde los hooks
locales no corren.

### Tests automatizados

No hay framework de tests JS/TS. Lo único parecido son tres archivos de
invariantes en `supabase/tests/` que ningún script ejecuta.

**Por qué no ahora**: automatizar el QA de localhost requiere Playwright más una
suite que hoy no existe; es un sprint entero, no un accesorio. El paso
intermedio barato y de mayor retorno es **hacer ejecutables los tres `.sql` de
invariantes** que ya escribiste — validan las reglas del ledger directamente
contra la base, que es donde de verdad importa.

### Claude revisando PRs

Posible vía GitHub Actions con la API. Implica secrets, presupuesto de API y
cambiar el flujo de merge manual que define `app-finanzas-sprint-flow`. Sin
sentido antes de tener CI básico.

---

## Referencias

- [`AGENTS.md`](../AGENTS.md) — estado canónico del proyecto
- [`.claude/CLAUDE.md`](../.claude/CLAUDE.md) — reglas de producto y arquitectura
- [`docs/pending-work.md`](./pending-work.md) — índice de lo que sigue abierto
