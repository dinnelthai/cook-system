# V0.8 historical evidence store

The offline archive accepts normalized {scope,events} JSON. Scope requires chain_id, network, genesis_hash, token_mint, quote_mint, provenance and interval_id. Genesis is a caller-supplied label, not verified here. Synthetic and observed-chain inputs must be separated. Exact duplicate event IDs are collapsed; conflicting IDs, ambiguous order, mixed scopes and mixed synthetic scenarios are rejected. Canonical JSON hashes use SHA-256. Store files are immutable by convention, published atomically without overwrite, and checked on read. Use a private directory outside the repository. A hash is not a signature or proof of authenticity. No transaction finality, source completeness, wallet ownership, financial settlement, live execution, or cross-batch deduplication is certified. This is a first archival layer, not yet a database or global event journal.

Usage: `node scripts/archive-historical-events.mjs ~/.cook-system/history normalized.json`

The current local chart now calls the exported mapLabCandles function, which checks strict time ordering, exact decimal OHLC bounds, and bounded integer lamports. The preceding CI run completed dependency installation but failed one test module because this export was missing. Verify new CI before claiming acceptance.
