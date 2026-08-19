#!/usr/bin/env node
/**
 * Hook Stop - enforcing. Convierte el typecheck de `app-finanzas-verify` en
 * una garantia en vez de un recordatorio.
 *
 * Logica:
 *   1. Si `stop_hook_active` es true -> sale 0. SIN ESTO HAY BUCLE INFINITO.
 *   2. Si no cambio ningun .ts/.tsx -> sale 0 en silencio (turnos de solo docs
 *      no pagan el costo).
 *   3. Si ya valido este mismo estado del arbol -> sale 0 en silencio.
 *   4. Corre `tsc --noEmit`. Si falla -> sale 2 con los errores por stderr,
 *      que es como un hook le devuelve trabajo a Claude.
 *
 * Escape hatch: APP_FINANZAS_SKIP_VERIFY=1 lo desactiva para una corrida.
 * Para desactivarlo del todo, borra el bloque "Stop" de .claude/settings.json.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const CACHE_DIR = join('.claude', 'hooks', '.cache');
const CACHE_FILE = join(CACHE_DIR, 'verify-gate.json');
const TS_RE = /\.tsx?$/;

const ok = (msg) => {
  if (msg) process.stdout.write(msg + '\n');
  process.exit(0);
};

const git = (...args) => {
  try {
    return execFileSync('git', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
};

// --- 1. Anti-bucle ------------------------------------------------------
let payload = {};
try {
  const raw = readFileSync(0, 'utf8');
  if (raw.trim()) payload = JSON.parse(raw);
} catch {
  payload = {};
}
if (payload.stop_hook_active === true) ok();
if (process.env.APP_FINANZAS_SKIP_VERIFY === '1') ok();

// --- 2. Cambio algo de TypeScript? -------------------------------------
const porcelain = git('status', '--porcelain');
const changed = new Set();

for (const line of porcelain.split('\n').filter(Boolean)) {
  // formato: "XY ruta" o "XY origen -> destino"
  const ruta = line.slice(3).split(' -> ').pop().replace(/^"|"$/g, '');
  changed.add(ruta);
}

// Trabajo ya commiteado en la rama, para que commitear no evada el gate.
const base = git('merge-base', 'HEAD', 'main');
if (base) {
  const commited = git('diff', '--name-only', base + '..HEAD');
  for (const f of commited.split('\n').filter(Boolean)) changed.add(f);
}

const tsChanged = [...changed].filter((f) => TS_RE.test(f));
if (tsChanged.length === 0) ok();

// --- 3. Ya validamos este estado exacto? -------------------------------
const fingerprint = createHash('sha256')
  .update(git('rev-parse', 'HEAD'))
  .update(' ')
  .update(porcelain)
  .update(' ')
  .update(tsChanged.sort().join('\n'))
  .digest('hex');

try {
  if (existsSync(CACHE_FILE)) {
    const cached = JSON.parse(readFileSync(CACHE_FILE, 'utf8'));
    if (cached.fingerprint === fingerprint && cached.status === 'pass') ok();
  }
} catch {
  // cache corrupta: la ignoramos y revalidamos
}

// --- 4. Typecheck -------------------------------------------------------
if (!existsSync(join('node_modules', 'typescript'))) {
  // Clon fresco sin `npm install`. Avisar, nunca bloquear.
  ok(
    'Hook verify-gate: se omitio el typecheck porque falta node_modules. ' +
      'Corre `npm install` y luego `npx tsc --noEmit`.',
  );
}

try {
  execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['tsc', '--noEmit'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 300000,
  });
} catch (err) {
  if (err.code === 'ETIMEDOUT') {
    ok('Hook verify-gate: `tsc --noEmit` excedio los 5 minutos y se abandono. Correlo a mano.');
  }
  const salida = ((err.stdout || '') + (err.stderr || '')).trim();
  process.stderr.write(
    'El typecheck fallo (hook Stop, gate de `app-finanzas-verify`). ' +
      'Corrige estos errores antes de terminar; no declares la tarea lista:\n\n' +
      (salida || 'npx tsc --noEmit salio con error y sin output.') +
      '\n',
  );
  process.exit(2);
}

try {
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(
    CACHE_FILE,
    JSON.stringify({ fingerprint, status: 'pass', at: new Date().toISOString() }),
  );
} catch {
  // la cache es una optimizacion, no un requisito
}

ok();
