# V0.6 unified terminal: implementation and Codex acceptance

## Frozen scope
One Terminal for closed-interval project review, with Projects, Analytics, Simulation and Settings as supporting pages. Reuse existing exact arithmetic, event replay, quote, accounting and NAV code. No live signing, automated trading, issuer exit optimizer, or coordinated wallets. The lifecycle here is a report-review lifecycle, not an on-chain execution lifecycle.

## Implemented in this slice
- `src/inner-market/terminal-state.mjs`: historical dashboard + capital-adjusted NAV, gross turnover, buy-minus-sell notional (not reserve delta or independent demand), six explicit evidence checks.
- REVIEW → SETTLED → ARCHIVED; settlement/archiving denied for REVIEW_REQUIRED. Imported archives are recalculated, not blindly trusted. This is local report settlement only; source attestation remains unknown.
- Terminal UI: NAV KPI, risk checks, settlement, archive download and archive restore. No invented wallet attribution or OHLCV. Archives include input data; treat as potentially sensitive. Archive is not cryptographically authenticated and is not a chain attestation.
- Diagnostic whitelist updated; fixed syntax error in legacy wallet branch.
- Unit tests: `test/terminal-state.test.mjs`.

## Local verification commands
```sh
git fetch origin
git reset --hard origin/master
node --check web/app.mjs
node --test test/terminal-state.test.mjs
npm test
node scripts/serve-offline-mvp.mjs
```
Open http://127.0.0.1:4173. Inspect console and network for errors. Test all five nav pages and every Terminal tab. Save metadata, settle the synthetic report, archive/download, reload the page, import archive. Confirm metadata and ARCHIVED state restore. Import a fixture with market.historyComplete=false; verify REVIEW_REQUIRED, null accounting and disabled settlement. Change data through Analytics; return to Terminal and verify REVIEW reset. Export diagnostics and verify terminal events without raw inputs.

Expected synthetic figures (base units): cash 887, inventory 50, cost 100, realized PnL -13, fees 7, NAV 980, capital-adjusted NAV change -20, historical drawdown 200 bps, gross turnover 290. These are fixture outputs only.

## Next phase / blocked
Get the existing local API contract and verified test-environment closed interval. Do not redeploy the validator. Follow inner-market-mvp-handoff.md for evidence collection and reconciliation. Current report accepts only SYNTHETIC and ARCHIVED_HISTORICAL input; do not relabel raw live data. Use canonical confirmed execution events with candle-builder.mjs for OHLCV after validating market identity, timestamps, finality, event coverage and provenance. No real chain source parity, live monitoring, empirical agent model, or end-to-end browser verification claimed. Retain research invariants and report missing input explicitly.
