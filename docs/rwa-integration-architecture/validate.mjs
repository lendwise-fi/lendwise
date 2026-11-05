// Documentation-only verification. Run from any directory with Node 22+.
import { buildSchema, extendSchema, parse, validate } from 'graphql'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import ts from 'typescript'

const root = dirname(fileURLToPath(import.meta.url))
const required = [
  'README',
  'TECHNICAL_ARCHITECTURE',
  'EXISTING_SYSTEM_ASSESSMENT',
  'TECHNICAL_FEASIBILITY_MATRIX',
  'RWA_DATA_MODEL',
  'YIELD_NORMALIZATION_METHODOLOGY',
  'INTEGRATION_SPECIFICATIONS',
  'SDK_AND_API_DESIGN',
  'ONBOARDING_ARCHITECTURE',
  'SECURITY_AND_RISK_ASSESSMENT',
  'IMPLEMENTATION_ROADMAP',
  'DELIVERY_READINESS',
  'COMPETITIVE_DIFFERENTIATION',
  'OPEN_QUESTIONS',
]
for (const name of required)
  assert.ok(existsSync(resolve(root, name + '.md')), name)
const docs = readdirSync(root).filter((f) => f.endsWith('.md'))
const diagrams = []
let checkedLinks = 0
const failures = []
const slug = (s) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .trim()
    .replace(/\s/g, '-')
for (const name of docs) {
  const text = readFileSync(resolve(root, name), 'utf8')
  for (const m of text.matchAll(/```mermaid\r?\n([\s\S]*?)```/g))
    diagrams.push({ name, source: m[1] })
  // Balanced parentheses preserve repository paths such as (dashboard).
  let offset = 0
  while ((offset = text.indexOf('](', offset)) >= 0) {
    let end = offset + 2,
      depth = 1
    while (end < text.length && depth) {
      if (text[end] === '(') depth++
      if (text[end] === ')') depth--
      end++
    }
    const link = text.slice(offset + 2, end - 1).replace(/^<|>$/g, '')
    offset = end
    if (/^(https?:|mailto:)/.test(link)) continue
    const [path, fragment] = link.split('#')
    const target = path
      ? resolve(root, decodeURIComponent(path))
      : resolve(root, name)
    checkedLinks++
    if (!existsSync(target)) {
      failures.push(`${name}: missing ${link}`)
      continue
    }
    if (fragment && target.endsWith('.md')) {
      const headings = [
        ...readFileSync(target, 'utf8').matchAll(/^#{1,6}\s+(.+)$/gm),
      ].map((m) => slug(m[1]))
      if (!headings.includes(fragment))
        failures.push(`${name}: missing anchor ${link}`)
    }
  }
}
assert.deepEqual(failures, [])
assert.ok(diagrams.length >= 12, 'At least 12 architecture diagrams required')
const productionSchemaPath = resolve(root, '../../src/lib/graphql/schema.ts')
const source = ts.createSourceFile(
  productionSchemaPath,
  readFileSync(productionSchemaPath, 'utf8'),
  ts.ScriptTarget.Latest,
  true
)
let currentSdl
function findTypeDefs(node) {
  if (
    ts.isVariableDeclaration(node) &&
    node.name.getText(source) === 'typeDefs' &&
    node.initializer &&
    ts.isNoSubstitutionTemplateLiteral(node.initializer)
  )
    currentSdl = node.initializer.text
  ts.forEachChild(node, findTypeDefs)
}
findTypeDefs(source)
assert.ok(
  currentSdl,
  'Existing GraphQL SDL must be extracted without executing application modules'
)
const baseSchema = buildSchema(currentSdl)
const extension = parse(
  readFileSync(resolve(root, 'examples/rwa-extension.graphql'), 'utf8')
)
extension.definitions = extension.definitions.filter(
  (d) => !(d.kind === 'ScalarTypeDefinition' && d.name.value === 'DateTime')
)
const schema = extendSchema(baseSchema, extension)
for (const field of Object.keys(baseSchema.getQueryType().getFields()))
  assert.ok(
    schema.getQueryType().getFields()[field],
    `Existing query preserved: ${field}`
  )
const queryErrors = validate(
  schema,
  parse(readFileSync(resolve(root, 'examples/queries.graphql'), 'utf8'))
)
assert.deepEqual(
  queryErrors.map((e) => e.message),
  []
)
const expectedMetrics = [
  'LENDING_SUPPLY_APY',
  'LENDING_BORROW_APY',
  'BOND_YTM',
  'CURRENT_YIELD',
  'DISTRIBUTION_YIELD',
  'MMF_YIELD',
  'NAV_TOTAL_RETURN',
  'ISSUER_INDICATIVE_RATE',
]
assert.deepEqual(
  schema
    .getType('FinancialMetric')
    .getValues()
    .map((v) => v.name),
  expectedMetrics
)
for (const name of readdirSync(resolve(root, 'evidence')).filter((f) =>
  f.endsWith('.json')
)) {
  const evidence = JSON.parse(
    readFileSync(resolve(root, 'evidence', name), 'utf8')
  )
  assert.equal(evidence.authenticated, false)
  assert.equal(evidence.httpStatus, 200)
  assert.ok(evidence.url.startsWith('https://'))
  assert.ok(Number.isFinite(Date.parse(evidence.collectedAt)))
  assert.match(evidence.responseSha256, /^[a-f0-9]{64}$/)
}
console.log(
  `${docs.length} documents, ${checkedLinks} local links, GraphQL schema/3 operations, metric enum and 6 evidence records validated.`
)
if (process.env.MERMAID_VALIDATION_ROOT) {
  const dependencies = resolve(
    process.env.MERMAID_VALIDATION_ROOT,
    'node_modules'
  )
  const { JSDOM } = await import(
    pathToFileURL(resolve(dependencies, 'jsdom/lib/api.js')).href
  )
  const dom = new JSDOM('<!doctype html><html><body></body></html>')
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  const { default: mermaid } = await import(
    pathToFileURL(resolve(dependencies, 'mermaid/dist/mermaid.esm.mjs')).href
  )
  mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' })
  for (const diagram of diagrams) {
    try {
      await mermaid.parse(diagram.source)
    } catch (error) {
      throw new Error(`Mermaid parse failed in ${diagram.name}`, {
        cause: error,
      })
    }
  }
  console.log(`${diagrams.length} Mermaid diagrams parsed successfully.`)
} else {
  console.log(
    `${diagrams.length} Mermaid blocks found; parser check skipped (set MERMAID_VALIDATION_ROOT to an isolated mermaid+jsdom installation).`
  )
}
await import('./examples/financial-checks.mjs')
await import('./examples/consumer-checks.mjs')
