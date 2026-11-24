# V0.8 offline report/event integrity and local acceptance

The Node-only report-event link module ties exact raw report bytes to a stored normalized candle-event batch. It recomputes the unified report and candle evidence, checks historical Localnet scope and slot boundaries, and records SHA-256 of the original report bytes plus the immutable batch ID. A verification recomputes both sides and reads the stored batch. Formatting changes to the report bytes invalidate the manifest intentionally. Synthetic mode stays separate. Missing evidence, review-required report, modified manifest, missing/corrupt batch and mismatched scope cannot verify. This association covers the report's candle events only, not every market event, receipt, or cash posting. It is not a signature, proof of chain authenticity, global deduplication, settlement permission or live execution. It is not wired into browser imports. Keep the report, manifest and private store outside the repository.

## CLI

```sh
node scripts/report-event-link.mjs archive report.json ~/.cook-system/history > manifest.json
node scripts/report-event-link.mjs verify report.json ~/.cook-system/history manifest.json
```

An integrity match is not independent historical attestation. An input lacking consistent candle evidence cannot use this link. Archive failed/rejected source data separately for investigation without claiming a match.

## Local acceptance checklist (existing environment; no validator reset)

1. Back up local config outside the repo; rotate any previously exposed LOCALNET_READ_KEY at its issuer. Do not expose credentials in logs.
2. Update master, run Node 22+ and npm ci, npm test. Record commit, Node version and exact pass/fail counts.
3. Start existing offline server without enabling execution. Check /api/terminal/health and /api/terminal/report from loopback; do not infer a verified genesis from reachability. Use COOK_TERMINAL_REPORT pointing to a private report file.
4. Import a consistent offline fixture and a deliberately mismatched copy. Compare terminal, dashboard, project page, and exported report. Verify unavailable/unknown states and historical settlement remains disabled.
5. If archived Localnet evidence exists, independently confirm genesis, slot coverage, finalized receipts, ownership and opening/closing snapshots from the existing test environment. Record missing ranges explicitly; do not invent historical observations.
6. Run report/event link archive and verify where consistent candle evidence exists. Modify a copy of the manifest/report and confirm failure without changing the source.
7. Export sanitized diagnostics and record any blocked checks. No real transactions, issuance, wallet signing, faucet use or validator redeployment is required for this acceptance stage.

Remaining: actual Localnet source coverage/ownership verification, global event deduplication, durable alert store and browser integration of stored batch references. Do not mark them passed based on offline CI.
