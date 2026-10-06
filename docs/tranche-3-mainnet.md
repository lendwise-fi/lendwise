# Tranche 3 Mainnet

This tranche adds the CCTP V2 path that moves native EVM USDC into native
Stellar USDC and makes the bridge reachable from the LendWise comparison flow.

## Delivered Surfaces

- Core CCTP V2 planning lives in `src/lib/bridge/cctp`.
- EVM burn uses `depositForBurnWithHook`, with both `mintRecipient` and
  `destinationCaller` set to the configured Stellar `CctpForwarder`.
- Stellar domain `27` is fixed in code as the destination CCTP domain.
- EVM USDC 6-decimal amounts are rescaled to Stellar 7-decimal expected
  amounts in the core bridge module.
- The guided dashboard route is `/bridge/stellar`.
- USDC rows in the supply and borrow comparison tables deep-link to the bridge.
- Stellar trustline checks run before the EVM burn, build a ChangeTrust
  transaction for the connected Stellar wallet, and relay the signed XDR through
  the backend Horizon configuration that produced it.
- Circle Iris polling uses `/v2/messages/{sourceDomain}`, defaults to the
  Fast Transfer finality threshold, and validates the CCTP V2 message header
  against the planned Stellar domain, forwarder recipient, destination caller,
  and finality threshold before mint preparation.
- Stellar minting is prepared through Soroban RPC and submitted after the
  wallet signs the prepared transaction; server relay rejects signed XDRs that
  do not call `mint_and_forward` on the configured forwarder with two non-empty
  Soroban byte arguments.

## Environment

Set these for each source chain enabled in the bridge UI:

```bash
STELLAR_NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
NEXT_PUBLIC_STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
STELLAR_RPC_URL=https://soroban-testnet.stellar.org
STELLAR_CCTP_FORWARDER=CA66Q2WFBND6V4UEB7RD4SAXSVIWMD6RA4X3U32ELVFGXV5PJK4T4VSZ

CCTP_EVM_BASE_DOMAIN=6
CCTP_EVM_BASE_CHAIN_ID=8453
CCTP_EVM_BASE_TOKEN_MESSENGER_V2=<circle-token-messenger-v2>
CCTP_EVM_BASE_USDC=<native-usdc>
```

For mainnet, switch the Stellar network passphrase, Horizon URL, Soroban RPC
URL, Stellar forwarder address, and the EVM contract addresses to the mainnet
values. CCTP domains must remain CCTP domains, not EVM chain IDs.

## QA Checklist

1. Connect an EVM wallet on a configured CCTP source chain.
2. Connect a Stellar wallet through the SEP-10 flow.
3. Open `/bridge/stellar?asset=USDC`.
4. Use a fresh Stellar account with no USDC trustline and confirm the UI asks
   the wallet to sign ChangeTrust before the EVM burn.
5. Sign the EVM USDC approval for the TokenMessenger V2 and record the approval transaction hash.
6. Submit the EVM burn and record the transaction hash.
7. Wait for Iris attestation and record the nonce.
8. Sign and submit the prepared Stellar mint transaction.
9. Record the Stellar mint transaction hash and verify the USDC balance in the
   portfolio.

## Submission Evidence

The public submission should include:

- Testnet EVM USDC approval transaction hash.
- Testnet EVM burn transaction hash.
- Testnet Stellar mint transaction hash, linked on Stellar Expert.
- Mainnet EVM USDC approval transaction hash.
- Mainnet EVM burn transaction hash.
- Mainnet Stellar mint transaction hash, linked on Stellar Expert.
- Screenshot or log line showing the trustline preflight running before burn.
- Screenshot or log line showing Iris attestation and mint hash logging. Runtime logs emit structured cctp:bridge events for trustline_checked, change_trust_submitted, usdc_approval_submitted, burn_submitted, attestation_ready, and mint_submitted. Reconcile reports also include adapterFamilies, exposing each provider's adapter ids and whether they support history refetch for pipeline_reports evidence.

## Current Local Verification

The implementation is locally covered by focused unit tests for CCTP planning,
Iris polling, Stellar trustline and mint transaction validation, bridge audit
logging, portfolio merge, risk calculation, and Stellar Hubble history. Live
mainnet and testnet transaction hashes must be produced from a configured
staging or production environment with funded EVM and Stellar wallets.

## Integration Contract For Stellar Protocols

A Stellar lending adapter remains responsible for:

- Spot market reads.
- Hubble historical decode hook.
- User positions.
- Per-reserve risk weights.

Once the adapter writes into the shared hourly tables, the optimizer and bridge
entry points do not require protocol-specific code. A ranked USDC opportunity
can deep-link to `/bridge/stellar?asset=USDC&amount=<amount>` and then continue
into the protocol's own supply action after native Stellar USDC is visible in
the unified portfolio.
