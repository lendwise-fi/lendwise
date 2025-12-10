/**
 * Next.js Instrumentation File
 *
 * This file runs once when the Next.js server starts.
 * It's the ideal place for global initialization like polyfills.
 *
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  // BigInt JSON serialization polyfill
  // Prevents "Do not know how to serialize a BigInt" errors
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(BigInt.prototype as any).toJSON = function () {
    return this.toString()
  }
}
