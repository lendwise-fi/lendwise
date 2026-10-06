# Stellar and EVM Bridge Audit

Scope: the Stellar SEP-10 sign-in, the CCTP V2 bridge from EVM USDC to Stellar
USDC, the Stellar portfolio and risk code, and the Blend v2.1 testnet connector.
Each finding lists its severity, where it is, and its status at the time of
writing.

## Method

- Read the SEP-10 library, its API routes, its challenge and session stores.
- Read the CCTP burn plan, the amount conversion, the Stellar mint and relay
  code, and every server action under `src/app/actions/cctp-*`.
- Checked external facts against primary sources: Circle's Stellar hook format
  and forwarder addresses, and the Blend pool status logic in
  `blend-capital/blend-contracts`.
- Ran the unit tests, lint, and a typecheck. Compared the typecheck against the
  baseline.
- Ran the Blend v2.1 connector against Soroban testnet with a fresh address.

## Findings and Status

### Fixed in this audit

**F1. CCTP server actions did not require a Stellar sign-in (high).**
The trustline check and build, the ChangeTrust submit, the mint preparation,
the mint relay, the audit log and attestation polling were callable without a
session. Anyone could build a burn plan that routes minted USDC to any Stellar
address, or write entries to the bridge audit log.
_Fix:_ `requireStellarSession()` in `src/lib/auth/session-guard.ts` checks the
`stellar_session` cookie. Each action requires it. Actions that take an account
require that account to match the session. The relays require the signed
transaction's source to match the session. The EVM burn plan requires
`stellarRecipient` to match the session.

**F2. Challenge consumption was not atomic (medium).**
With Redis, consumption read the key and then deleted it. Two concurrent verify
requests with the same signed challenge could both pass.
_Fix:_ consumption uses Redis `GETDEL`, which is atomic. A unit test with a
mocked Redis client checks that a challenge can be consumed once.

**F3. Unused parameter in the Blend connector (lint error).**
_Fix:_ removed.

**O1. Session signing used the SEP-10 signing key (medium).**
_Fix:_ sessions are signed with a key derived from `STELLAR_SESSION_SECRET`,
using a domain-separated HMAC. The raw signing key is never used for sessions.
In production the process refuses to sign or verify without the dedicated
secret. Outside production, a local fallback derives a separate key from the
signing secret, and it is not used in production. Existing sessions are
invalidated by this change, so users sign in again once.

**O2. Challenge replay protection was per process without Redis (medium).**
_Fix:_ in production, challenge storage, revocation and rate limiting all
require Upstash Redis and throw when it is not configured. Local development
may still use memory.

**O3. No rate limit on challenge issuance (low).**
_Fix:_ `GET` and `POST /api/auth/stellar/challenge` allow 20 requests per
minute per client IP, then return HTTP 429.

**O4. Sessions could not be revoked server-side (low).**
_Fix:_ every session carries a session ID (`sid`). `DELETE
/api/auth/stellar/session` revokes that ID until the session would expire. The
session guard and `GET /api/auth/stellar/session` reject revoked sessions.
Sessions without an ID are rejected.

**O7. Attestation polling could spend shared Circle quota (info).**
_Fix:_ `waitForCctpAttestation` requires a session and allows 60 polls per
minute per account.

**O6. CCTP forwarder hook data format (medium, now verified against the
published spec).** Circle's published hook format is: bytes 0–23 are
Circle-reserved magic and must be zero, bytes 24–27 are the version and must be
0, bytes 28–31 are the length `L` of the recipient, and bytes 32 onward are the
recipient strkey followed by an optional integrator payload. Our encoding
matches this layout. The forwarder addresses in `src/lib/bridge/cctp/config.ts`
match Circle's published values: testnet
`CA66Q2WFBND6V4UEB7RD4SAXSVIWMD6RA4X3U32ELVFGXV5PJK4T4VSZ` and mainnet
`CBZL2IH7F6BIDAA3WBNXYKIXSATJGMSW7K5P5MJ6STX5RXN47TZJDF5T`.
Sources: Circle's Stellar reference, `developers.circle.com/cctp/references/stellar`
and `…/stellar-contracts`.
Still required: one real testnet burn and mint, recorded in the tranche 3
runbook, before mainnet. A spec match does not prove the live deployment behaves
the same way.

**O8. Blend pool status was not interpreted (info, now resolved).** From
`pool/src/pool/status.rs` and `pool/src/pool/pool.rs` in
`blend-capital/blend-contracts`: `0` is Active set by admin, `1` is Active set
by the backstop, `2` is On Ice set by admin, `3` is On Ice set by the backstop,
`4` is Frozen set by admin, `5` is Frozen set by the backstop, and `6` is Setup.
Pool status `1` on the testnet pool is therefore Active. Actions with status
above 1 are restricted, so the pool accepts the usual supply and borrow actions.

### Still open

**O5. Unfunded-account challenges are not exercised (low).** The verifier
requires exactly two signatures for an unfunded account and checks the wallet
signature. This matches SEP-10, but no test uses a real unfunded wallet. Test
it with a fresh wallet in staging.

**O9. Redis paths need a live check (medium).** The `GETDEL` consumption, the
`INCR`/`EXPIRE` rate limiter and the revocation keys are tested against a
mocked client. Run them against a real Upstash database before release.

### Verified without finding issues

- **Amount conversion.** EVM USDC (6 decimals) to Stellar USDC (7 decimals) is
  a multiplication by 10, and the reverse rejects amounts that don't divide
  evenly. Decimal parsing rejects more than 6 decimal places. Exercised by
  `src/lib/bridge/cctp/__tests__/evm-to-stellar.test.ts`.
- **`depositForBurnWithHook` argument order** matches the CCTP V2
  TokenMessengerV2 signature used in the burn plan. Both `mintRecipient` and
  `destinationCaller` are set to the forwarder.
- **Fee bounds.** `maxFee` must be below the burn amount and within
  `maxFeeBps`. The default is 50 bps.
- **SEP-10 checks.** The verifier checks the server source, sequence 0, the
  time window, the server signature, the wallet signature against the account
  threshold, the nonce, the `web_auth_domain` value, and that each operation
  source is correct. Session tokens are HMAC-signed, and the comparison is
  constant time.
- **Session cookie.** httpOnly, SameSite=Lax, and Secure in production.

## Verification

- Unit tests: 332 passing, 17 skipped. Two suites still fail for environment
  reasons (missing generated GraphQL types, and a PGlite setup timeout). These
  failures existed before this audit.
- New tests for this audit: session guard (valid, missing, forged, revoked,
  legacy), session key derivation and production rules, the in-memory and
  production behaviour of revocation and rate limits, and mocked-Redis
  consumption and storage of challenges.
- Typecheck: 59 errors, all from missing generated GraphQL types. This matches
  the baseline. No new errors.
- Lint: clean on the touched files.
- Live: the Blend v2.1 connector returns zero rows and no error for a fresh
  address.

Not verified here: the Redis paths against a live Upstash database (O9), an
unfunded wallet sign-in (O5), and one real testnet bridge transfer (O6). These
need a staging environment.
