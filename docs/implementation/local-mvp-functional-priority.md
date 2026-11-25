# Local MVP functional priority — 2026-11-25

The operator prioritizes functionality and mathematical correctness in an existing private local test environment. Retain existing basic safety boundaries; defer enterprise custody, distributed recovery and production infrastructure work.

Prioritize read-only data and report integration, independently checkable historical replay and accounting, exact units and fee handling, raw OHLCV and pool identity, browser consistency, and isolated synthetic model regression. Do not treat synthetic scenarios as market forecasts or optimize deceptive market behavior. Do not add live execution features or change execution permissions in this workstream.

First functional correction: candle aggregation separates curve accounts and explicitly identified pools in the same token/time interval. Unknown pool identity is kept separate from identified pools. Existing unscoped historical candle exports may require recomputation. This changes historical data presentation only; no order creation or submission.

Acceptance: compare immutable receipts with replay output, reconcile independently retained balances and fees, verify charts against actual observed trades, and run the existing unified acceptance suite. Real Localnet and browser tests remain operator-side tasks.

## Deferred work

See [post-local MVP engineering backlog](deferred-engineering-backlog.md). Security and production infrastructure expansion are deferred; existing local protections and correctness requirements remain unchanged. Current work is functional and mathematical acceptance first.
