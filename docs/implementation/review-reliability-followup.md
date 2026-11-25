# Review reliability follow-up

The review changes are offline/read-only audit and metadata QA. They do not certify production, authenticate source data, or enable market execution.

## Reproduce storage benchmarks

- Pure semantic replay: `node scripts/benchmark-project-replay.mjs 1000 3`.
- SQLite IO and integrity: `node scripts/benchmark-project-replay.mjs --sqlite 100 3`.

The SQLite mode creates and removes its own private temporary metadata fixture. It measures each committed write, independent connection reads, full integrity inspection and stale revision rejection. It does not measure simultaneous process contention or establish a production latency SLA. The existing full replay/hash validation remains unchanged; optimize only after collecting target-machine measurements.

## Remaining review gates

- Actual multi-process contention and event-loop responsiveness on the operator machine.
- Long-duration storage and alert journal throughput; alert lock recovery requires a verified inactive writer.
- Legacy history without explicit network and valuation evidence remains unverified.
- Canonical instruction-level receipt identity remains a separate source-data contract.
- Local test transfer reconciliation, HTTP organization and diagnostic export require separate acceptance.

## Alert journal benchmark

`node scripts/benchmark-alert-store.mjs 100` measures synthetic open, acknowledge and resolve writes and a fresh-store full replay. Uses an isolated temporary journal, not operator records. The benchmark does not claim long-duration soak or production throughput.
