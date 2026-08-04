// Injects architecture.json into template.html and writes the self-contained
// architecture.html. Keeps the two deliverables from drifting apart: edit the
// JSON (or the template) and re-run `node docs/architecture/build-html.mjs`.
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

const raw = await readFile(join(here, 'architecture.json'), 'utf8')
const data = JSON.parse(raw) // fail loudly on malformed JSON

// Validate before shipping: a dangling id would silently drop nodes or steps.
const ids = new Set(data.nodes.map((n) => n.id))
const problems = []
if (ids.size !== data.nodes.length) problems.push('duplicate node ids')
for (const e of data.edges) {
  if (!ids.has(e.source)) problems.push(`edge source not found: ${e.source}`)
  if (!ids.has(e.target)) problems.push(`edge target not found: ${e.target}`)
}
for (const f of data.flows) {
  for (const s of f.steps) {
    if (!ids.has(s.node)) problems.push(`flow ${f.id} step not found: ${s.node}`)
  }
}
if (problems.length) {
  console.error('architecture.json is inconsistent:\n  ' + problems.join('\n  '))
  process.exit(1)
}

const template = await readFile(join(here, 'template.html'), 'utf8')

// `</script>` inside a JSON string would close the host <script> tag early.
const embedded = JSON.stringify(data).replace(/<\//g, '<\\/')

const html = template.replace('__GRAPH_DATA__', () => embedded)
await writeFile(join(here, 'architecture.html'), html, 'utf8')

console.log(
  `architecture.html written — ${data.nodes.length} nodes, ${data.edges.length} edges, ${data.flows.length} flows`
)
