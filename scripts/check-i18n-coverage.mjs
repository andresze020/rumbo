import fs from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import ts from 'typescript'

const audit = spawnSync(process.execPath, ['scripts/audit-i18n.mjs', '--json'], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'inherit'],
})
if (!audit.stdout) throw new Error('The i18n audit did not return findings.')

const findings = JSON.parse(audit.stdout)
const source = fs.readFileSync('src/lib/i18n/legacy-ui-translations.ts', 'utf8')
const json = source
  .replace(/^.*?legacyUiTranslations = /s, '')
  .replace(/\s+as const\s*$/, '')
const dictionaries = JSON.parse(json)
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
        found.push([
          node.head.text,
          ...node.templateSpans.flatMap((span, index) => [
            `{${index + 1}}`,
            span.literal.text,
          ]),
        ].join(''))
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
  ...new Set([
    ...findings.map((item) => item.text),
    ...uiCallPhrases(),
  ]),
]
const missing = []
const unchanged = []
const allowedUnchanged = new Set([
  'Actions',
  'App Finanzas',
  'Assistant',
  'Auto',
  'Avalanche',
  'avalanche',
  'Beta',
  'Budgets',
  'CAD',
  'COP',
  'CSV',
  'Color',
  'Color {1}',
  'Condition',
  'Date',
  'Description',
  'Distribution ·',
  'Email',
  'Finanzas',
  'Manual',
  'Menu',
  'Messages',
  'Min',
  'Net',
  'No',
  'Non-',
  'Notes',
  'Page',
  'Parent',
  'Pause',
  'Pro',
  'RBC',
  'TFSA',
  'Transactions',
  'transactions',
  'Type',
  'transaction',
  'tx',
  '· incl.',
])

for (const locale of ['es', 'fr']) {
  for (const phrase of phrases) {
    const translated = dictionaries[locale]?.[phrase]
    if (!translated?.trim()) {
      missing.push(`${locale}: ${phrase}`)
    } else if (
      translated === phrase &&
      !allowedUnchanged.has(phrase)
    ) {
      unchanged.push(`${locale}: ${phrase}`)
    }
  }
}

if (missing.length || unchanged.length) {
  if (missing.length) {
    console.error(`Missing translations (${missing.length}):`)
    console.error(missing.slice(0, 50).join('\n'))
  }
  if (unchanged.length) {
    console.error(`Suspicious unchanged translations (${unchanged.length}):`)
    console.error(unchanged.slice(0, 50).join('\n'))
  }
  process.exit(1)
}

console.log(
  `i18n coverage passed: ${phrases.length} visible phrases × 2 translated locales.`
)
