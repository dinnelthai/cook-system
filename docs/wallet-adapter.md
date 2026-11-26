# Wallet boundary: Localnet and Phantom

The offline server remains Localnet-only. The browser wallet page now uses a
single explicit adapter contract instead of constructing endpoint requests in
the view. The mainnet adapter slot is reserved for Phantom and fails closed.

- Localnet: existing server-managed test keyfiles, existing balance, portfolio,
  faucet and transfer endpoints. The adapter exposes explicit Localnet-only key
  export/import actions for operator-controlled test-wallet backup and restore;
  it does not add transaction execution.
- Mainnet: Phantom only, not implemented or selectable in the offline build.
  No fallback to a local key or faucet, no automatic wallet authorization.
- Core project/report/risk logic is unchanged. Keep network identity,
  transaction validation and signing authorization independent of UI mode.
- Existing local keyfiles are permission-restricted files, not encrypted
  production custody. Exported files are unencrypted secret material: handle
  them as sensitive backups, delete or move them to secure storage after use,
  and never use these Localnet test wallets for real funds.
- Before implementing Phantom: separate production deployment and storage,
  verify cluster identity and authorized account, explicit user consent for
  each transaction, handle rejected signatures/account changes, and reconcile
  results on the correct network. Do not enable mainnet via an RPC URL change.
- Existing project transaction restrictions remain in effect.

Tests: `node --test test/wallet-adapter.test.mjs` (requires Node 22+).
