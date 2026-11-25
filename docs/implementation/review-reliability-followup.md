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

## Concurrent metadata writers

`node --test test/project-store-contention.test.mjs` races two independent worker-thread SQLite connections against the same expected revision in a private fixture. Exactly one must commit; the other must report a revision conflict. The resulting database is fully audited. This is a concurrent-connection regression test, not a multi-process load or latency benchmark.

## Historical receipt evidence

An optional receipt_coordinates object with instruction_index, inner_instruction_index (null for an outer instruction), and event_sequence is independently checked between linked historical creator receipt and cash posting records. Contradictions and malformed coordinates require review. Legacy missing coordinates remain incomplete. Repeated transaction signatures still require review: caller-supplied coordinates do not authenticate the underlying economic posting. No source attestation or permission to execute is inferred.

Local wallet history excludes instruction transfer amounts from failed or unknown receipts; a failed transaction may still carry a network fee. Repeated token account addresses across different wallet observations are counted once and the holdings result is marked PARTIAL. Non-atomic observations and parsed instructions are not a full balance reconciliation.
