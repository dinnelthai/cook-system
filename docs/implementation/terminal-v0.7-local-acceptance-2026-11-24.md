# Terminal V0.7 local acceptance — 2026-11-24

Status: **partial; real-chain reconciliation and integration blocked by missing evidence**. This record does not certify production or chain parity. Master base: `0304dc7`.

## Automated verification

- `node --check web/app.mjs`: passed.
- `npm test`: 147 passed, 0 failed, including an untracked pre-existing local entry-path regression test. The first sandboxed run failed only because the HTTP smoke test could not bind a loopback socket (EPERM); rerun with local network permission passed.
- `node scripts/validate-terminal-report.mjs fixtures/synthetic/terminal-candle-report.json`: exit 0, `REPORT_READY`, `settlement_allowed: true`.

## Browser verification (synthetic)

Started the existing server on loopback port 4180 with `COOK_TERMINAL_REPORT` pointing to the synthetic candle fixture. All five navigation pages opened. Terminal's trade, cash, inventory, liquidity, risk/audit and log tabs displayed. The report bridge loaded; 1m displayed two bars, 5m displayed one. Synthetic report values: cash 887, inventory 50, cost 100, realized PnL -13, creator receipt 7, NAV 980, drawdown 200 bps, turnover 290. Validator output reported the two underlying candles; the 5m chart displayed merged range 2 to 1.8. These are synthetic base units.

Saved test metadata, settled the report, downloaded the archive, reloaded, and imported it: metadata and `ARCHIVED` state returned. A synthetic input with `candleEvidence.complete=false` showed `COVERAGE_NOT_COMPLETE`, hid candles and disabled settlement and archive. Diagnostic JSON download succeeded. Settings reported bridge CONFIGURED and RPC NOT_CONFIGURED. Simulation fixed cases matched 6/6 and seed 42 with 100 runs per role matched 600/600. Browser console recorded no errors during the observed chart check. Not every control or failure mode was exercised in the browser; failed-receipt behavior is covered by existing automated tests only.

## Pump Lab observed contract and sanitized samples

User supplied a separate machine's HTTP entry point. Its published UI reads `/ui-config` for a read key and default mint; it sends the key in `x-api-key` for `GET /v1/indexer`, `GET /v1/tokens/{mint}` and `GET /v1/pools/{pool}`. It connects to `/stream` via WebSocket with `pumplab` and `key.<redacted>` subprotocols and sends `{mint, pool, interval, limit}`. Do not commit or log the key. UI labels the environment Solana Localnet; this label and indexer ledger identifier are not independent genesis verification.

Observed `GET /v1/indexer`: HTTP 200; fields `ledger`, `slot`, `indexed`, `events`, `trades`, `candles`, `decoder_failures`, `checkpoints`. One snapshot had slot 33768, indexed 16, events 21, trades 11, candles 46, decoder failures 0. These are moving counters, not proof of full coverage.

Observed `GET /v1/tokens/{mint}`: HTTP 200; fields include `mint`, `tokenProgram`, `decimals`, `supply`, `curve`, `bondingCurve`, `pool`, `stage`, `markets`. Sample decimals 6, stage `pumpswap`, bonding curve marked complete; identifiers redacted.

Observed `GET /v1/pools/{pool}`: HTTP 200; sample `baseReserve: {amount: "206655680002170", decimals: 6, uiAmountString: "206655680.00217"}`, `quoteReserve: {amount: "663268451", decimals: 9, uiAmountString: "0.663268451"}`. This is a current PumpSwap pool snapshot, not a historical bonding-curve opening or closing snapshot.

Observed `/stream` for the default token's bonding curve and `1m`: one market message with one candle and three trades. Candle `open=0.000000000297999147250700594116`, `high=0.000000001123883166136685574881`, `low=0.000000000297999147250700594116`, `close=0.000000001123883166136685574881`, `volume=826242854.907872000000`, `quote_volume=0.86040996600000000000`, `trade_count=3`. Trade fields include `event_index`, `dex`, `side`, `base_raw`, `base_decimals`, `quote_raw`, `net_quote_raw`, `fee_raw`, `block_time`, `slot`, `transaction_index`; identifiers and wallet redacted. In this response `volume` is token quantity while `quote_volume` is SOL; unit and fee semantics require independent verification before mapping.

## Outstanding evidence and acceptance

No local Validator process or RPC listener was found on this Mac; the supplied Pump Lab is on another machine. Its UI and the accessible endpoints do not establish RPC location, independent genesis, successful/finalized receipts, complete closed-interval coverage, historical opening and closing accounts, project wallet attribution, capital/expense postings, inventory cost basis, creator entitlement/receipts, or independently verified NAV. The supplied service exposes a live index, not an independently attested archived interval. Consequently no observed report was fabricated or fed to the bridge, no chain parity was asserted, and no Validator was restarted or deployed.

To finish: obtain the existing validator's independently confirmed RPC access and identity, the Pump Lab API/source contract including coverage guarantees, a selected closed interval with project ownership and historical opening/closing snapshots, transaction receipts including failures and actual fees, creator/capital/expense records and NAV valuation evidence. Normalize using existing collectors and audit engines, preserve raw evidence separately, reconcile independently, atomically write a sanitized report, run the validator and repeat browser/chain comparisons. A reachable RPC alone does not establish localnet identity or completeness.

## Follow-up: remote Validator RPC, 2026-11-24

The user supplied HTTP `http://192.168.1.104:8899` and WebSocket `ws://192.168.1.104:8900` for the existing Validator. From the Mac, `getGenesisHash` returned `5riLEjHTeeMmLkpZ5pWdo74Jh68THSUGBF44Ac9UK5Yg`, matching the hash supplied by the Validator operator and the Pump Lab indexer ledger identifier. `getHealth` returned `ok`, `getVersion` reported `solana-core` 4.4.1, and `slotSubscribe` delivered a WebSocket notification. This confirms access and the reported identity, not transaction completeness.

At the time of inspection, `getFirstAvailableBlock` returned 33504, `minimumLedgerSlot` 33503, and finalized slot 35633. Pump Lab's three default-token bonding-curve trades were at slots 174–176. `getTransaction` returned null for each of the three indexed signatures, and `getSignaturesForAddress` returned no retained signatures for that curve or the pinned Pump/PumpSwap programs. Therefore those indexed historical trades cannot be independently verified against this RPC's current ledger. Slot values are time-sensitive; null does not prove why a transaction is unavailable by itself.

A separate current-state comparison of the default token's PumpSwap vaults at RPC context slot 35714 matched Pump Lab: token amount `206655680002170` base units (6 decimals) and quote amount `663268451` lamports (9 decimals). These are current pool balances, not historical interval snapshots or project treasury balances. The comparison is time-sensitive and cannot establish historical cash, inventory, fees, NAV or candle parity.

The existing Pump history collector rejects `network: localnet`; its canonical observed-chain normalizers currently accept mainnet/devnet only. No network was mislabeled to bypass this. The optional Terminal health bridge also intentionally accepts loopback RPC endpoints only, so it was not configured with the remote LAN URL. A safe integration must preserve that boundary or explicitly define and test a suitable local forwarding approach. No validator was restarted and no transaction was submitted.

Remaining prerequisites: an archive or evidence source retaining the relevant transaction receipts and historical account states, or a new completed test interval still retained by this Validator, together with project ownership, ledger, fees, opening/closing balances and valuation evidence. Until then, real report normalization, closed-interval reconciliation, data-bridge import and real-chain acceptance remain blocked.

## Follow-up: local Validator adapter support

The existing Pump and PumpSwap normalization paths now accept the canonical schema's `local_sim` network value for observed local-validator records. It identifies the network separately from `observed_chain` provenance; it does not attest transaction finality, ledger completeness, or network identity. The history collector reports `NO_TRADE_EVENTS` instead of `AVAILABLE` for an empty candle list. Its pagination `coverage_complete` indicates pagination exhausted; it must not be treated as proof that a validator has retained the full history.

A read-only run against the supplied Validator and Pump Lab default mint returned network `local_sim`, `NO_CREATION_EVENT`, zero retained signatures/events and `NO_TRADE_EVENTS`; the current curve account decoded. The real historic report bridge remains unpopulated because required historical and financial evidence is unavailable. Focused fixture tests cover observed local-validator Pump and PumpSwap events; the full local test suite passed 149 tests (including the pre-existing untracked local test).

## Localnet wallet transfer follow-up

A loopback-only temporary TCP forward to the operator-provided validator was used with the configured genesis pin. The existing faucet created and funded a local test wallet with 1 SOL. A second test wallet was created, and a 0.1 SOL transfer was submitted through the new local-wallet transfer endpoint. Finalized RPC balances were 0.899995 SOL and 0.1 SOL respectively, reflecting the 0.000005 SOL transaction fee. The response reports submission only; callers must check confirmation. Wallet keyfiles stay outside the repository, and no secrets are returned by the endpoint. This is a testnet-only transfer; the live chart and multi-wallet trading are not integrated by this change.
