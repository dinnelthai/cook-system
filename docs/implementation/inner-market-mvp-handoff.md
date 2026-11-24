# Cook System inner-market MVP handoff

## Scope frozen

Offline retrospective accounting and market-integrity analysis for the Pump bonding-curve phase, from creation through completion. No API integration, new validator, LP, automated trading, trading recommendations, target-price sizing or wallet coordination.

## Run

Node.js 22+.

```sh
git checkout feat/v1-inner-market-dev-ops
npm test
node scripts/report-inner-market-mvp.mjs
node scripts/report-inner-market-mvp.mjs path/to/closed-interval-report-input.json
```

The default fixture is explicitly synthetic. The CLI exits 0 for REPORT_READY, 2 for REVIEW_REQUIRED, and 1 for malformed input. REPORT_READY means the supplied records pass the implemented accounting checks; it is not proof of on-chain accuracy, executable valuation, or profitability.

## MVP acceptance

- Preserve ordered historical trades and gross buy/sell notional totals; do not equate gross volume with independent demand or reserve change.
- Report real and virtual reserve snapshots separately.
- Reconcile cash postings to inventory trade journal by event identity, side, and amount.
- Reconcile aggregate token quantity, acquisition/disposal basis, actual creator receipts and reported project realized profit.
- Report sampled historical drawdown from externally verified NAV observations, adjusted for capital flows.
- Suppress final accounting outputs when any required audit fails; reject malformed or mixed-scope data.
- Keep synthetic and archived historical records explicitly separated.

Synthetic fixture expected outputs (integer base units, not a real token or market):
closing cash 887; inventory 50; remaining basis 100; realized project profit -13; creator receipts 7; observed drawdown 200 bps.

## Next-stage local test environment handoff

Do not redeploy the already existing validator or SDK. Obtain the existing local API contract from its maintainer. Start with a closed test interval and export:
- chain/network identity, mint, curve account, quote asset, decimals, opening/closing slots;
- successful and failed transaction receipts, finality, instruction order, actual fees and balance changes;
- opening/closing curve accounts and treasury balance snapshots;
- confirmed capital, expense and creator fee postings and entitlement records;
- verified historical NAV observations and external capital flow timing.

Build a read-only normalization adapter after the API contract is available. Compare decoded records and each aggregate against independently retrieved test-environment snapshots. Store raw evidence and report fixtures. Run baseline, missing/duplicate data, failed receipt, cost unknown, and curve completion cases; record expected/actual values and discrepancies. Do not treat a passing synthetic fixture as local-chain parity.

## Known limits

The MVP consumes already-normalized, independently reconciled inputs. It does not yet directly reconstruct all reporting inputs from raw RPC responses, validate their source attestations, derive NAV valuations from raw data, allocate transfer basis per wallet, or establish full historical coverage. The historical market summary is descriptive and does not infer independent ownership or future behavior. Existing quote utilities are not certified as executable by this report. Reserve coverage and transfer audits remain conservative historical checks. Source/API parity and end-to-end localnet validation are next-stage work.
