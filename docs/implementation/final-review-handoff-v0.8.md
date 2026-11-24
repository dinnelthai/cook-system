# V0.8 final static review and local handoff

Baseline: commit 2aeb2e6 passed 199/199 CI tests. This patch addresses nested accounting identity mismatches, local HTTP origin/host and static symlink checks, inconsistent CLI review exit status and subpage import race. These are defensive correctness changes only; no trading or issuance capability is added. New tests need CI verification. Optional scope labels on legacy individual rows are not independent attestations.

## Local acceptance (Codex or operator)
- Keep the existing validator and configuration. Back up private config; do not copy credentials into repo or logs. Rotate the previously committed LOCALNET_READ_KEY at its issuer, if not already rotated. Removing it from HEAD did not purge history.
- From a clean local branch: git pull --ff-only origin master; node --version; npm ci; npm test. Record the actual commit and results.
- Start the offline server with COOK_LOCAL_FAUCET=0 and COOK_TERMINAL_REPORT pointing to a private normalized fixture. On Windows PowerShell set environment variables with $env:NAME; on POSIX use export. Run node scripts/serve-offline-mvp.mjs. Verify loopback app and report health. Do not run start-localnet.mjs for this read-only pass because it enables existing test execution configuration.
- Verify project, dashboard, terminal and export agree on audit state. An intentionally mismatching report should display unavailable financial metrics. Verify no historical settlement. Export sanitized diagnostics.
- CLI: node scripts/validate-terminal-report.mjs report.json. Exit 0 means synthetic report review eligible, not actual settlement; 2 means internally ready but not settleable; 3 means review required; 1 means rejected. This changes previous review-required exit code 2 to 3.
- If existing independently collected historical Localnet data is available, verify genesis, finalized receipt completeness, slot coverage, public account attribution and historical opening/closing snapshots; document gaps. Use report-event-link archive/verify where candle evidence is available. Do not reset the validator or issue transactions to fill gaps.
- Remaining blockers: true Localnet integration/coverage acceptance, durable global event dedup, browser linkage to persisted batch, durable alerts, independent source authenticity and cost-basis/valuation evidence. CI is not production acceptance. The current audit path is single-wallet/single-token-account historical evidence only. No real trading, wallet signing, issuance or automated execution validation is included in this handoff.

For actual results record PASS/FAIL/BLOCKED separately per item, never claim completion for unavailable evidence.
