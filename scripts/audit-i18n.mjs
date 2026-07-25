import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

const roots = ['src/app', 'src/components']
const visibleAttributes = new Set([
  'alt',
  'actionLabel',
  'aria-label',
  'archivedMessage',
  'cancelLabel',
  'confirmLabel',
  'description',
  'emptyLabel',
  'label',
  'nextLabel',
  'placeholder',
  'previousLabel',
  'pendingLabel',
  'pendingText',
  'restoredMessage',
  'title',
  'text',
  'triggerLabel',
  'undoLabel',
])
const visibleProperties = new Set([
  'cancelLabel',
  'confirmLabel',
  'description',
  'emptyLabel',
  'label',
  'name',
  'pendingText',
  'placeholder',
  'subtitle',
  'title',
])

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

function hasWords(value) {
  return /[A-Za-zÀ-ÿ]{2}/.test(value) && !/^(https?:|\/|[a-z]+-[a-z-]+$)/i.test(value.trim())
}

function decodeJsxEntities(value) {
  return value
    .replaceAll('&apos;', "'")
    .replaceAll('&quot;', '"')
    .replaceAll('&amp;', '&')
    .replaceAll('&rsquo;', '’')
    .replaceAll('&nbsp;', ' ')
}

function templateText(node) {
  if (ts.isNoSubstitutionTemplateLiteral(node)) return node.text
  if (!ts.isTemplateExpression(node)) return null
  return [
    node.head.text,
    ...node.templateSpans.flatMap((span, index) => [
      `{${index + 1}}`,
      span.literal.text,
    ]),
  ].join('')
}

function lineOf(source, node) {
  return source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1
}

function visibleExpressionOwner(node) {
  let current = node.parent
  while (current) {
    if (
      ts.isBinaryExpression(current) &&
      (ts.isTypeOfExpression(current.left) || ts.isTypeOfExpression(current.right))
    ) {
      return null
    }
    if (ts.isJsxExpression(current)) {
      const owner = current.parent
      if (!ts.isJsxAttribute(owner)) return 'jsx-expression'
      const attribute = owner.name.getText()
      return visibleAttributes.has(attribute) ? `attribute:${attribute}` : null
    }
    if (ts.isPropertyAssignment(current)) {
      const property = current.name.getText()
      return visibleProperties.has(property) ? `property:${property}` : null
    }
    if (
      ts.isConditionalExpression(current) ||
      ts.isBinaryExpression(current) ||
      ts.isParenthesizedExpression(current)
    ) {
      current = current.parent
      continue
    }
    return null
  }
  return null
}

const findings = []

for (const file of roots.flatMap(filesUnder)) {
  const sourceText = fs.readFileSync(file, 'utf8')
  const source = ts.createSourceFile(
    file,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  )

  function add(node, kind, value) {
    const normalized = decodeJsxEntities(value).replace(/\s+/g, ' ').trim()
    if (hasWords(normalized)) {
      findings.push({ file: file.replaceAll('\\', '/'), line: lineOf(source, node), kind, text: normalized })
    }
  }

  function visit(node) {
    if (ts.isJsxText(node)) {
      add(node, 'jsx-text', node.getText(source))
    } else if (
      ts.isJsxAttribute(node) &&
      visibleAttributes.has(node.name.getText(source)) &&
      node.initializer &&
      ts.isStringLiteral(node.initializer)
    ) {
      add(node, `attribute:${node.name.getText(source)}`, node.initializer.text)
    } else if (
      ts.isPropertyAssignment(node) &&
      visibleProperties.has(node.name.getText(source)) &&
      ts.isStringLiteralLike(node.initializer)
    ) {
      add(node, `property:${node.name.getText(source)}`, node.initializer.text)
    } else if (
      ts.isStringLiteralLike(node) &&
      ts.isJsxExpression(node.parent)
    ) {
      add(node, 'jsx-expression', node.text)
    } else if (
      ts.isTemplateExpression(node) &&
      ts.isJsxExpression(node.parent) &&
      (!ts.isJsxAttribute(node.parent.parent) ||
        visibleAttributes.has(node.parent.parent.name.getText(source)))
    ) {
      add(node, 'template', templateText(node))
    } else if (ts.isStringLiteral(node)) {
      const owner = visibleExpressionOwner(node)
      if (owner) add(node, owner, node.text)
    }
    ts.forEachChild(node, visit)
  }

  visit(source)
}

findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)
if (process.argv.includes('--json')) {
  console.log(JSON.stringify(findings, null, 2))
} else {
  for (const finding of findings) {
    console.log(`${finding.file}:${finding.line}\t${finding.kind}\t${finding.text}`)
  }
  console.error(`i18n audit: ${findings.length} visible hard-coded strings in ${new Set(findings.map((item) => item.file)).size} files`)
}
process.exitCode = findings.length ? 1 : 0
