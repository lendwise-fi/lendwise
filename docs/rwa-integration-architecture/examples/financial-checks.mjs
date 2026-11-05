// Independent numeric checks of documentation examples; no production modules.
import assert from 'node:assert/strict'

const near = (actual, expected, tolerance = 1e-8) =>
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`)

near((1 + 0.05 / 365) ** 365 - 1, 0.0512674964674)
near(369 / 10000, 0.0369)
near((100 / 98) ** 2 - 1, 0.0412328196585)
near(100 / 98 - 1, 0.0204081632653)
near((101 + 0.5 - 100) / 100, 0.015)
near((101 / 100) * (100 / 99) - 1, 0.020202020202)
const terminal = 10000 * 0.998 * 1.05 ** (90 / 365) * 0.999
near(terminal, 10090.688232739694)
near((terminal - 10000) / 10000, 0.00906882327397)
near(1.06 * 0.9 - 1, -0.046)
near(3 * 0.05 - 2 * 0.04 - 0.005, 0.065)
near(3 * 0.02 - 2 * 0.08 - 0.005, -0.105)
near(3 * -0.1 - 2 * 0.08 - 0.005, -0.465)
near((0.8 * 3) / 2, 1.2)
near(1 - 2 / (0.8 * 3), 1 / 6)
assert.equal((5000000n - 650n) * 10n, 49993500n)
assert.ok((1 + 0.05) ** (90 / 365) !== 1 + 0.05 * (90 / 365))
console.log('16 financial and atomic-unit example checks passed.')
