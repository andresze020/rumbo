#!/usr/bin/env node
/**
 * Hook PreToolUse — guardia de contexto.
 *
 * El presupuesto de tokens de una sesion se gasta casi siempre igual: leyendo
 * un artefacto generado que nadie necesita, o volcando entero un archivo de
 * 2.000+ lineas cuando hacian falta 30. Este hook corta las dos.
 *
 *   1. DENY duro sobre artefactos generados (.next, node_modules, lockfiles,
 *      tsbuildinfo, dumps). Leerlos nunca aporta y cuestan miles de tokens.
 *   2. DENY con instruccion sobre archivos enormes leidos SIN offset/limit.
 *      No prohibe el archivo: obliga a leerlo por partes o a buscar con Grep.
 *   3. Lo mismo para `cat` / `Get-Content` / `type`, que es la via de escape
 *      natural cuando Read esta bloqueado.
 *
 * Todas las rutas se normalizan a `/` antes de comparar, asi los patrones
 * funcionan igual en Windows y en POSIX y no necesitan backslashes.
 *
 * Contrato: JSON por stdin. exit 0 = permitir. exit 2 = bloquear y devolverle
 * el motivo a Claude por stderr, que es como un hook le devuelve trabajo.
 */
import { readFileSync, statSync } from 'node:fs';
import { resolve, relative } from 'node:path';

/** Lineas a partir de las cuales exigimos lectura parcial. */
const BIG_FILE_LINES = 700;

/** Artefactos generados: leerlos es siempre desperdicio. */
const BLOCKED = [
  /(^|\/)\.next\//i,
  /(^|\/)node_modules\//i,
  /(^|\/)\.git\//i,
  /(^|\/)coverage\//i,
  /(^|\/)\.claude\/hooks\/\.cache\//i,
  /package-lock\.json$/i,
  /tsconfig\.tsbuildinfo$/i,
  /\.(log|map|lock)$/i,
];

/** Rutas grandes pero que casi siempre se quieren enteras: no las estorbamos. */
const ALWAYS_FULL = [/(^|\/)AGENTS\.md$/i, /(^|\/)CLAUDE\.md$/i];

const BACKSLASH = String.fromCharCode(92);
const slash = (p) => String(p).split(BACKSLASH).join('/');

const deny = (msg) => {
  process.stderr.write(msg + '\n');
  process.exit(2);
};

let payload;
try {
  payload = JSON.parse(readFileSync(0, 'utf8') || '{}');
} catch {
  process.exit(0); // Sin input parseable no hay nada que juzgar.
}

const tool = payload.tool_name || '';
const args = payload.tool_input || {};

/** Ruta relativa al repo normalizada a `/`, o null si cae fuera. */
const rel = (p) => {
  try {
    const r = slash(relative(process.cwd(), resolve(p)));
    return r.startsWith('..') ? null : r;
  } catch {
    return null;
  }
};

const lineCount = (p) => {
  try {
    if (statSync(p).size > 8 * 1024 * 1024) return Infinity;
    return readFileSync(p, 'utf8').split('\n').length;
  } catch {
    return 0; // No existe o es binario: que falle la herramienta, no el hook.
  }
};

const checkPath = (raw, { partial, via }) => {
  if (!raw) return;
  const r = rel(raw);
  const probe = r ?? slash(raw);

  if (BLOCKED.some((re) => re.test(probe))) {
    deny(
      `[context-guard] \`${probe}\` es un artefacto generado. Leerlo gasta miles de ` +
        `tokens sin aportar nada.\n` +
        `Si necesitas un dato puntual de ahi, usa Grep con un patron concreto. ` +
        `Para dependencias lee \`package.json\`, no el lockfile.`,
    );
  }

  if (partial || r === null || ALWAYS_FULL.some((re) => re.test(r))) return;

  const n = lineCount(r);
  if (n > BIG_FILE_LINES) {
    const size = n === Infinity ? '>8MB' : `${n} lineas`;
    const cost = n === Infinity ? '>100' : Math.round((n * 12) / 1000);
    deny(
      `[context-guard] \`${r}\` tiene ${size} y lo estas leyendo entero` +
        `${via ? ` (via ${via})` : ''}. Eso son ~${cost}k tokens de los que usaras ` +
        `una fraccion.\n` +
        `Haz una de estas en su lugar:\n` +
        `  - Grep con el simbolo que buscas (output_mode "content", -n, -C 5) y luego\n` +
        `    Read con offset/limit alrededor del hit.\n` +
        `  - Read con offset/limit si ya sabes la zona.\n` +
        `  - Delega en el subagente adecuado (scout / i18n-scribe / migration-drafter):\n` +
        `    exploran en su propio contexto y te devuelven solo el resumen.\n` +
        `Si de verdad lo necesitas entero aqui, pagina con limit ${BIG_FILE_LINES}.`,
    );
  }
};

if (tool === 'Read') {
  const partial = args.offset !== undefined || args.limit !== undefined;
  checkPath(args.file_path, { partial });
}

if (tool === 'Bash' || tool === 'PowerShell') {
  const cmd = String(args.command || '');

  // Solo miramos volcados completos. `head`, `tail`, `sed -n`, `grep` pasan.
  const dumps = [
    /\bcat\s+(?:-\w+\s+)*["']?([^\s"'|;&><]+)/g,
    /\bGet-Content\s+(?!.*-(?:TotalCount|Tail|First|Last))["']?([^\s"'|;&]+)/gi,
    /\btype\s+["']?([^\s"'|;&><]+)/g,
  ];

  for (const re of dumps) {
    for (const m of cmd.matchAll(re)) {
      // `cat file | head -20` ya es lectura parcial: no la penalizamos.
      const tail = cmd.slice(m.index + m[0].length);
      const piped = /\|\s*(head|tail|grep|rg|select-object|select-string|wc)/i.test(tail);
      checkPath(m[1], { partial: piped, via: 'shell' });
    }
  }
}

process.exit(0);
