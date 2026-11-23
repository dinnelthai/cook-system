# Observed-chain fixtures

This directory is reserved for confirmed mainnet/devnet transaction fixtures captured with `npm run capture:pump-fixture`. No fabricated transaction is stored here. Each fixture must retain its signature, slot, block time, transaction index, RPC commitment, raw RPC transaction response, decoder version, and normalized events. Remove provider URLs and credentials from captured metadata before committing. A fixture is accepted as `observed_chain` only when the transaction is confirmed and `meta.err` is null.
