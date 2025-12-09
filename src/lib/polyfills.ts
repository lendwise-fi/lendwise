/**
 * BigInt JSON serialization polyfill
 * Prevents "Do not know how to serialize a BigInt" errors during SSR
 */

// Extend BigInt prototype to support JSON.stringify
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(BigInt.prototype as any).toJSON = function () {
  return this.toString()
}

export {}
