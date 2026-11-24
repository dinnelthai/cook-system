# Market Quality and Paper Risk V1

## Market Quality Engine
The engine consumes normalized execution events and reports gross turnover, signed buy-minus-sell quote-flow proxy, token volumes, address breadth, quote-notional concentration, price movement, optional holder concentration, reserve-depth ratio proxy, and recomputed raw candles. Address counts are not independent economic actors. No common-control, wallet-intent, wash-trading, or manipulation finding is made. Missing coverage and source attestation remain UNKNOWN.

## Participant Simulator
The simulator is deterministic by scenario and seed. It models heterogeneous observation/execution latency, simple participant propensities, and response to public information. Ground-truth role labels are stored separately from detector input. It is a toy defensive simulator, not a calibrated market forecast. It does not connect to RPC or sign/submit transactions.

## Paper Quote Risk Gate
The quote planner computes bounded bid/ask proposals with a spread floor/cap, volatility widening, inventory skew, stale-data check, data-completeness check, drawdown cap and emergency-halt state. A missing/corrupt halt state fails closed. Resume requires explicit operator confirmation. All outputs are paper-only; transaction construction, signing and submission are deliberately absent.

## Acceptance limitations
This is not a production market-making deployment. Live source authentication, independently verified completeness, execution adapters, wallet security review, operational alert delivery, and mainnet test evidence remain prerequisites. Do not treat simulated returns or paper quotes as expected profit.
