# Stellar and EVM Bridge Audit

Scope: the Stellar SEP-10 sign-in, the CCTP V2 bridge from EVM USDC to Stellar
USDC, the Stellar portfolio and risk code, and the Blend v2.1 testnet connector.
Each finding lists its severity, where it is, and its status at the time of
writing.

## Method

- Read the SEP-10 library, its API routes and its challenge store.
- Read the CCTP burn plan, the amount conversion, the Stellar mint and relay
  code, and every server action under `src/app/actions/cctp-*`.
- Ran the unit tests, lint, and a typecheck. Compared the typecheck against the
  baseline.
- Ran the Blend v2.1 connector against Soroban testnet with a fresh address.

## Findings and Status

### Fixed

**F1. CCTP server actions did not require a Stellar sign-in (high).**
The trustline check and build, the ChangeTrust submit, the mint preparation,
the mint relay and the audit log were all callable without a session.
Anyone could build a burn plan that routes minted USDC to any Stellar address,
or write entries to the bridge audit log.
_Fix:_ `requireStellarSession()` in `src/lib/auth/session-guard.ts` checks the
`stellar_session` cookie. Each action now requires it. Actions that take an
account require that account to match the session. The relays require the
signed transaction's source to match the session. The EVM burn plan requires
`stellarRecipient` to match the session.

**F2. Challenge consumption was not atomic (medium).**
With Redis, `consumeSep10Challenge` read the key and then deleted it. Two
concurrent verify requests with the same signed challenge could both pass,
which breaks the one-time-use guarantee.
_Fix:_ the store now uses Redis `GETDEL`, which is atomic.

**F3. Unused parameter in the Blend connector (lint error).**
_Fix:_ removed. The loader no longer takes the address list.

### Open, with recommendations

**O1. The session signing secret falls back to the SEP-10 server signing key
(medium).** If `STELLAR_SESSION_SECRET` is unset, sessions are signed with
`STELLAR_SEP10_SIGNING_SECRET`, the same key that signs challenges. Recommendation:
set `STELLAR_SESSION_SECRET` in every environment, and make the code refuse to
start without it in production.

**O2. Without Redis, challenge replay protection is per process (medium).**
If `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are not set, the
store falls back to an in-memory map. That map is not shared across instances,
so a challenge can be replayed against another instance. Recommendation: make
Redis required outside local development.

**O3. No rate limit on challenge issuance (low).** `GET` and `POST
/api/auth/stellar/challenge` write to the store on each call. Recommendation: rate
limit by IP.

**O4. Sessions cannot be revoked server-side (low).** A session lasts 7 days,
and deleting the cookie is the only logout. Recommendation: if revocation is
needed, store session IDs and check them in `requireStellarSession`.

**O5. Unfunded-account challenges are checked only by signature count (low).**
For an unfunded account the verifier requires exactly two signatures and
checks the wallet signature. This matches the SEP-10 intent, but it has not
been tested against a real unfunded wallet.

**O6. The CCTP forwarder hook data format is not verified against a deployed
contract (medium, unverified).** `buildCctpForwarderHookData` encodes 24 zero
bytes, a uint32 zero, a uint32 length, and the Stellar recipient. The
structure is taken from the code, not from an on-chain or published
specification. The testnet burn and mint in the tranche 3 runbook is the
only way to confirm it. Do this before mainnet.

**O7. Iris polling and the attestation endpoint are public (info).**
`waitForCctpAttestation` only reads public attestation data, so it doesn't
need a session. It can still be used to spend Circle API quota. Rate limiting
belongs in front of it.

**O8. Pool status `1` on the Blend v2.1 testnet pool is not interpreted
(info).** See `docs/blend-v2-1-testnet-connector.md`. Confirm the status enum
before any write action.

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

- Unit tests: 318 passing, 17 skipped. Two suites still fail for environment
  reasons (missing generated GraphQL types, and a PGlite setup timeout). These
  failures existed before this audit.
- Typecheck: 59 errors, all from missing generated GraphQL types. This matches
  the baseline. No new errors.
- Lint: clean on the touched files.
- Live: the Blend v2.1 connector returns zero rows and no error for a fresh
  address.

Not verified: the atomic Redis path (F2) needs an Upstash instance. The
session guard is covered by unit tests with a mocked cookie store, not by an
end-to-end sign-in. Run a sign-in and a bridge attempt in staging before
release.
