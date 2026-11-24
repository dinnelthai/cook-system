# Terminal V0.7 — developer handoff and local integration contract

## Scope and responsibilities
All components are read-only, closed-interval review, historical accounting, or isolated defensive QA. There is no order submission, private-key handling, market-manipulation strategy, or exit execution. Reuse the existing validator and Pump Lab services. Do not guess their endpoints or relabel raw/live data as archived historical evidence. A configured or reachable RPC does not establish local network identity, historical completeness, or chain-data parity.

## Implemented
- Unified report state and guarded report settlement/archive restore from V0.6.
- `terminal-candles.mjs` reuses `buildRawCandles` and canonical event ordering. The OHLCV chart consumes matched events, not reserve estimates. 1m/5m/15m/1h views; empty/malformed evidence is explicitly labeled.
- Optional local report bridge: GET /api/terminal/report. Set COOK_TERMINAL_REPORT to an absolute path to a sanitized normalized report JSON. The bridge does not query upstream APIs or derive a report from raw RPC data. It validates report structure and serves the supplied input, including REVIEW_REQUIRED inputs; use the report state for completeness. 503 when not configured, 422 for unreadable/invalid input. Limited to loopback server, fixed route, 16 MiB. Never expose the server or wallet secrets.
- Optional health: GET /api/terminal/health, COOK_LOCAL_RPC_URL. Only loopback HTTP(S), no credentials/query/redirect; fixed getHealth/getVersion/getSlot(finalized)/getGenesisHash calls. RPC_REACHABLE is connectivity only. Settings → 检查本地连接.
- New CLI: `node scripts/validate-terminal-report.mjs <path>` (0 = accounting review settlement eligible; 2 = review required; 1 = rejected). Missing candle evidence is allowed for accounting-only reports; supplied inconsistent candle evidence blocks settlement.
- Unit and local HTTP smoke tests.

## Report contract
Use existing inner-market-mvp-handoff.md and the two synthetic fixtures as the exact structural examples. Scope, sourceMode, cash, inventory, creator, nav and market are required. All balances/amounts use decimal integer strings in explicit base units. A report covers exactly one token and closed interval; all component scopes must match. SourceMode is SYNTHETIC or ARCHIVED_HISTORICAL. An archived test interval is not a live feed; preserve actual network identity separately in the canonical event market object. No source attestation is inferred by the importer.

Optional `market.candleEvidence`:
- schema_version = terminal-candle-evidence.1
- scope exactly matches report scope.
- market: chain_id, network, token_mint, quote_mint, curve_program_id, market_phase = bonding_curve.
- complete: true only when the complete closed interval was independently checked.
- startTimeMs inclusive, endTimeMs exclusive; UTC milliseconds.
- events: canonical CURVE_BUY_EXECUTED / CURVE_SELL_EXECUTED only, one per report.market.trades row; event_id = trade.id, side and quote_amount_base_units must match the report's notional definition exactly. All event ordering keys, timestamp, execution price, token amount, quality and provenance must pass the canonical validation. For observed data only include independently confirmed/finalized successful executions, and reconcile the quote asset/mint and decimals externally. Reject missing or contradictory evidence; do not fabricate timestamps/prices or merge different networks/phases. The synthetic example is fixtures/synthetic/terminal-candle-report.json.

## Codex: local acceptance
1. Pull master; run node --check web/app.mjs, npm test and node scripts/validate-terminal-report.mjs fixtures/synthetic/terminal-candle-report.json.
2. Start the existing UI with COOK_TERMINAL_REPORT set to the absolute synthetic fixture path and node scripts/serve-offline-mvp.mjs. Verify the report bridge, all five pages, each Terminal tab, 1m and 5m candle rendering (two and one bars respectively), archive restore, incomplete evidence blocks settlement, and diagnostics.
3. Discover the actual existing local RPC and Pump Lab API contract; document actual ports, schemas, and sanitized samples. Set COOK_LOCAL_RPC_URL to the confirmed loopback RPC. Confirm genesis against the existing validator independently; health alone is insufficient. No validator redeployment.
4. Map the actual local API's read-only records to the report contract using existing decoders/history collectors and independently verified account/transaction snapshots. Reconcile amounts, fees, reserve changes, cash, inventory, and NAV. Keep raw observations separate; do not store private keys, credentials or wallet configuration in the report.
5. Export a sanitized closed-interval JSON atomically (temporary file then rename) to the configured report path. Run the validator; import it in the existing Terminal via the report bridge. Compare raw OHLCV and all report outputs to the chain/test evidence, not just to synthetic values. Check incomplete data and failed receipts. Record actual assertions and screenshots; report blocked inputs instead of guessing.

Example shell (synthetic only):
```sh
npm test
node scripts/validate-terminal-report.mjs fixtures/synthetic/terminal-candle-report.json
COOK_TERMINAL_REPORT="$PWD/fixtures/synthetic/terminal-candle-report.json" node scripts/serve-offline-mvp.mjs
```

Open http://127.0.0.1:4173, click 读取本地报告桥. Expected synthetic values: cash 887, inventory 50, cost 100, realized PnL -13, fees 7, NAV 980, drawdown 200 bps, turnover 290; merged 5m OHLC = 2/2/1.8/1.8 and quote volume 290. All units are synthetic fixture units. Actual upstream mapping, source parity, browser runtime and complete local-chain acceptance are still unverified.
