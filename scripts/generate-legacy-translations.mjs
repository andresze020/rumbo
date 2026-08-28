import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import ts from 'typescript'
import Anthropic from '@anthropic-ai/sdk'

/**
 * Two properties this script MUST keep, both learned the hard way:
 *
 * 1. It collects phrases from `audit-i18n.mjs` **and** from `ui(...)` call
 *    arguments. The audit only sees rendered JSX text, so a phrase passed
 *    directly to `ui()` — especially a template literal — is invisible to it but
 *    is still required by `check-i18n-coverage.mjs`.
 *
 * 2. It **merges into** the existing catalog instead of replacing it. Writing
 *    only the phrases it collected silently deletes every entry it happens not
 *    to see, which is how a previously-passing `npm run i18n:check` starts
 *    reporting dozens of missing translations that were fine a minute earlier.
 */

function loadEnv(file) {
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=]+)=(.*)$/)
    if (!match) continue
    const [, key, raw] = match
    if (!process.env[key]) {
      process.env[key] = raw.trim().replace(/^['"]|['"]$/g, '')
    }
  }
}

loadEnv('.env.local')

const audit = spawnSync(process.execPath, ['scripts/audit-i18n.mjs', '--json'], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'ignore'],
})
if (!audit.stdout) throw new Error('The i18n audit did not produce JSON output.')
const findings = JSON.parse(audit.stdout)

// ── Phrases passed straight to ui(...) ──────────────────────────────────────
// Mirrors `uiCallPhrases()` in check-i18n-coverage.mjs, which is what actually
// gates the build. Template literals become the same `{1}`/`{2}` placeholder form
// the catalog stores.
function filesUnder(root) {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(root, entry.name)
    return entry.isDirectory()
      ? filesUnder(full)
      : /\.(tsx?|jsx?)$/.test(entry.name)
        ? [full]
        : []
  })
}

function uiCallPhrases() {
  const found = []
  for (const file of ['src/app', 'src/components'].flatMap(filesUnder)) {
    const source = ts.createSourceFile(
      file,
      fs.readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    )
    function collect(node) {
      if (ts.isStringLiteralLike(node)) {
        found.push(node.text)
        return
      }
      if (ts.isTemplateExpression(node)) {
        found.push(
          [
            node.head.text,
            ...node.templateSpans.flatMap((span, index) => [
              `{${index + 1}}`,
              span.literal.text,
            ]),
          ].join('')
        )
        return
      }
      if (ts.isConditionalExpression(node)) {
        collect(node.whenTrue)
        collect(node.whenFalse)
      } else if (ts.isParenthesizedExpression(node)) {
        collect(node.expression)
      }
    }
    function visit(node) {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'ui' &&
        node.arguments[0]
      ) {
        collect(node.arguments[0])
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
  return found
}

const phrases = [
  ...new Set([...findings.map((item) => item.text), ...uiCallPhrases()]),
].sort()

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const cacheFile = path.join(os.tmpdir(), 'app-finanzas-i18n-translation-cache.json')

// Seed from the committed catalog, so anything already translated survives even
// if this run does not collect it.
const catalogPath = 'src/lib/i18n/legacy-ui-translations.ts'
const existing = fs.existsSync(catalogPath)
  ? JSON.parse(
      fs
        .readFileSync(catalogPath, 'utf8')
        .replace(/^.*?legacyUiTranslations = /s, '')
        .replace(/\s+as const\s*$/, '')
    )
  : { es: {}, fr: {} }

const cached = fs.existsSync(cacheFile)
  ? JSON.parse(fs.readFileSync(cacheFile, 'utf8'))
  : { es: {}, fr: {} }

const translations = {
  es: { ...(existing.es ?? {}), ...(cached.es ?? {}) },
  fr: { ...(existing.fr ?? {}), ...(cached.fr ?? {}) },
}
const batchSize = 60

for (const locale of ['es', 'fr']) {
  const language = locale === 'es' ? 'Spanish' : 'Canadian French'
  for (let start = 0; start < phrases.length; start += batchSize) {
    const batch = phrases
      .slice(start, start + batchSize)
      .filter((phrase) => !translations[locale][phrase])
    if (!batch.length) {
      console.error(`${locale}: ${Math.min(start + batchSize, phrases.length)}/${phrases.length} cached`)
      continue
    }
    let translatedBatch = null
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const response = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 12000,
        temperature: 0,
        tools: [
          {
            name: 'submit_translations',
            description: 'Return translations in the same order as the source array.',
            input_schema: {
              type: 'object',
              properties: {
                payload: { type: 'string' },
              },
              required: ['payload'],
              additionalProperties: false,
            },
          },
        ],
        tool_choice: { type: 'tool', name: 'submit_translations' },
        messages: [
          {
            role: 'user',
            content: `Translate this JSON array of UI strings for a household personal-finance application into ${language}.

Rules:
- Call submit_translations with one payload string containing translations in
  exactly the same order as the source array, separated by the exact delimiter
  <|TRANSLATION|>. Do not use that delimiter inside a translation.
- Preserve placeholders like {1}, {name}, {amount}, punctuation, arrows, emoji, currency codes, and product name "Rumbo".
- Use concise, natural product UI language.
- "Posted" means contabilizada/comptabilisée, "void" means anular/annuler without deleting history, and "payee" means beneficiario/bénéficiaire.
- Do not omit any key.

${JSON.stringify(batch)}`,
          },
        ],
      })
      const toolUse = response.content.find(
        (block) => block.type === 'tool_use' && block.name === 'submit_translations'
      )
      translatedBatch =
        toolUse && 'input' in toolUse && typeof toolUse.input.payload === 'string'
          ? toolUse.input.payload.split('<|TRANSLATION|>').map((item) => item.trim())
          : null
      if (Array.isArray(translatedBatch) && translatedBatch.length === batch.length) break
      console.error(`${locale}: retrying batch ${start} (${attempt}/3)`)
    }
    if (!Array.isArray(translatedBatch) || translatedBatch.length !== batch.length) {
      throw new Error(
        `Expected ${batch.length} ${locale} translations, received ${
          Array.isArray(translatedBatch) ? translatedBatch.length : 'an invalid value'
        }.`
      )
    }
    const parsed = Object.fromEntries(
      batch.map((phrase, index) => [phrase, translatedBatch[index]])
    )
    for (const phrase of batch) {
      if (typeof parsed[phrase] !== 'string' || !parsed[phrase].trim()) {
        throw new Error(`Missing ${locale} translation for: ${phrase}`)
      }
      translations[locale][phrase] = parsed[phrase]
    }
    fs.writeFileSync(cacheFile, JSON.stringify(translations))
    console.error(`${locale}: ${Math.min(start + batchSize, phrases.length)}/${phrases.length}`)
  }
}

// Sorted so a regeneration produces a reviewable diff rather than a reshuffle.
const sorted = {
  es: Object.fromEntries(
    Object.entries(translations.es).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  ),
  fr: Object.fromEntries(
    Object.entries(translations.fr).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  ),
}

const output = `// Generated from scripts/audit-i18n.mjs. Do not edit entries manually.\n` +
  `// Regenerate after adding a visible hard-coded UI string.\n` +
  `export const legacyUiTranslations = ${JSON.stringify(sorted, null, 2)} as const\n`
fs.writeFileSync(catalogPath, output)
console.error(
  `Collected ${phrases.length} phrases; catalog now holds ${
    Object.keys(sorted.es).length
  } es / ${Object.keys(sorted.fr).length} fr entries.`
)
