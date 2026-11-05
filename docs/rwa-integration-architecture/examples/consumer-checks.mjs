import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

// Execute the standalone documentation contract without writing generated code.
const source = readFileSync(new URL('./contracts.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ES2022,
  },
})
const { loadStrategyInputs } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`
)
const now = Date.parse('2026-11-06T00:00:00Z')
const asset = {
  family: 'stellar',
  network: 'mainnet',
  kind: 'classic',
  code: 'USDC',
  issuer: 'approved-issuer',
  sac: null,
}
const observation = (metric, kind, id) => ({
  id: `observation-${id}`,
  revision: 1,
  supersedesId: null,
  subject: { kind, id },
  metric,
  normalizedDecimal: '0.04',
  provenance: { observedAt: new Date(now - 10000).toISOString() },
  quality: { status: 'valid', staleAfter: new Date(now + 60000).toISOString() },
})
const initial = () => ({
  rwa: {
    nav: [],
    yields: [observation('ISSUER_INDICATIVE_RATE', 'rwa_share_class', 'share')],
    failures: [],
  },
  rates: [
    {
      poolId: 'pool',
      asset: { ...asset },
      observation: observation(
        'LENDING_BORROW_APY',
        'lending_product',
        'borrow-product'
      ),
    },
  ],
})
async function check(change, expected = 'informational_only') {
  const state = initial()
  change(state)
  const sdk = {
    observations: { latest: async () => state.rwa },
    lending: { blendRates: async () => state.rates },
  }
  assert.equal(
    (await loadStrategyInputs(sdk, 'share', 'pool', asset, now)).status,
    expected
  )
}
await check(() => {}, 'inputs_available')
await check((s) => {
  s.rwa.yields = []
})
await check((s) => {
  s.rates = []
})
await check((s) => {
  s.rwa.failures.push({ code: 'SOURCE_UNAVAILABLE' })
})
await check((s) => {
  s.rwa.yields[0].quality.status = 'stale'
})
await check((s) => {
  s.rwa.yields[0].quality.staleAfter = new Date(now).toISOString()
})
await check((s) => {
  s.rwa.yields[0].normalizedDecimal = null
})
await check((s) => {
  s.rwa.yields[0].subject.id = 'other-share'
})
await check((s) => {
  s.rwa.yields[0].subject.kind = 'lending_product'
})
await check((s) => {
  s.rates[0].observation.provenance.observedAt = new Date(
    now + 1000
  ).toISOString()
})
await check((s) => {
  s.rates[0].observation.provenance.observedAt = new Date(
    now - 30001
  ).toISOString()
})
await check((s) => {
  s.rates[0].observation.provenance.observedAt = 'invalid'
})
await check((s) => {
  s.rates[0].poolId = 'other-pool'
})
await check((s) => {
  s.rates[0].asset.issuer = 'other-issuer'
})
await check((s) => {
  s.rates[0].asset.network = 'testnet'
})
await check((s) => {
  s.rates[0].observation.normalizedDecimal = null
})
await check((s) => {
  s.rates[0].observation.metric = 'LENDING_SUPPLY_APY'
})
await check((s) => {
  s.rates[0].observation.subject.kind = 'rwa_share_class'
})
console.log('18 consumer-input acceptance and rejection scenarios passed.')
