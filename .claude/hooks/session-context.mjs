#!/usr/bin/env node
/**
 * Hook SessionStart — informativo, nunca bloquea.
 *
 * Imprime el estado del checkout al arrancar la sesión. Su stdout entra al
 * contexto de Claude, así que cubre la regla de AGENTS.md "verify clean working
 * tree before switching or starting" sin depender de que alguien la recuerde.
 *
 * Contrato de hooks: recibe JSON por stdin, sale siempre con código 0.
 */
import { execFileSync } from 'node:child_process';

const git = (...args) => {
  try {
    return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
};

try {
  const branch = git('rev-parse', '--abbrev-ref', 'HEAD') || '(desconocida)';
  const dirty = git('status', '--porcelain');
  const log = git('log', '-2', '--pretty=format:%h %s');

  const files = dirty ? dirty.split('\n').filter(Boolean) : [];
  const estado = files.length === 0
    ? 'limpio'
    : `${files.length} archivo(s) sin commitear`;

  const lineas = [
    '## Estado del checkout (hook SessionStart)',
    '',
    `- Rama: \`${branch}\``,
    `- Working tree: ${estado}`,
  ];

  if (files.length > 0) {
    lineas.push('', 'Sin commitear:');
    for (const f of files.slice(0, 15)) lineas.push(`  ${f}`);
    if (files.length > 15) lineas.push(`  … y ${files.length - 15} más`);
    lineas.push('', 'Confirma con el usuario antes de cambiar de rama o empezar un sprint nuevo.');
  }

  if (log) {
    lineas.push('', 'Últimos commits:');
    for (const l of log.split('\n')) lineas.push(`  ${l}`);
  }

  if (branch === 'main' && files.length === 0) {
    lineas.push('', 'Estás en `main` limpio: crea una rama antes de implementar (una por sprint o fix).');
  }

  // Presupuesto de contexto. Barato de imprimir, caro de olvidar.
  lineas.push(
    '',
    '### Presupuesto de contexto',
    '- `AGENTS.md` es corto a propósito. La historia de sprints está en',
    '  `docs/SPRINT-LOG.md`: no lo leas salvo que necesites el porqué de algo pasado.',
    '- Antes de abrir código que ya existe, delega en `scout` (o `/buscar`): devuelve',
    '  `archivo:línea` en vez de volcarte archivos de 2.000+ líneas.',
    '- Traducciones → `i18n-scribe`. Migraciones → `migration-drafter`.',
    '  Cierre de sprint → `sprint-closer`. Cada uno explora en su propio contexto.',
    '- El hook `context-guard` bloquea lecturas completas de archivos enormes y de',
    '  artefactos generados. Si te corta, usa Grep + Read con offset/limit.',
  );

  process.stdout.write(lineas.join('\n') + '\n');
} catch {
  // Un hook informativo jamás debe tumbar la sesión.
}

process.exit(0);
