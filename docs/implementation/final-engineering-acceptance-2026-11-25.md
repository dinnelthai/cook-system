# Final engineering acceptance — review candidate

Scope: PR #9, branch codex/overnight-market-quality-completion, based on master da6e1c6. The preceding tested commit is 64f3df5 (311 passing, no failures/skips, registry validation and synthetic regression passed in GitHub Actions run 45528560965). Verify the final head separately; this document is not evidence of a subsequent CI pass.

| Workstream | Code status | Acceptance boundary |
|---|---|---|
| Historical event archive/index | implemented | bounded file-backed index; no transactional multi-writer guarantee |
| Source/coverage | implemented collector-side checks | independent dual-source agreement on real receipts and UI binding pending |
| Financial integrity | integrated historical account set | independent ownership, valuation and real receipt parity pending |
| Reliability | local journal, archive, paper halt | no automatic server logging, notification or distributed recovery |
| Market quality | descriptive analysis and synthetic tests | independent demand, execution-depth evidence and real model calibration unavailable |
| Localnet | read-only preflight | real environment, closed evidence interval and browser checks pending |
| Final engineering review | schema contract hardening and handoff | operator review and latest CI required before merge |

## Reproduction

Run npm ci, npm test, npm run validate:schemas. Run the defensive evaluation with a new private output path. Run the local read acceptance only against a pre-existing approved loopback RPC with independently supplied genesis and a closed interval evidence file; see local-read-acceptance-v1.md.

Do not commit private fixtures, keyfiles, secrets, endpoints containing credentials or raw diagnostic exports. Rotate any previously exposed read key. Existing history is not scrubbed by these changes.

Review the PR diff, run browser checks on the offline terminal with execution controls disabled, verify contradictory financial reports hide derived totals, verify all evidence limitations, and test archive recovery and performance in the operator environment. Do not reset a validator for acceptance. No claim of actual localnet parity, production readiness, independent source attestation or complete historical coverage is made.

Merge gate: latest CI green, operator review completed, outstanding limitations explicitly accepted for the offline research scope. Production deployment is out of scope.

## Post-merge follow-up

Master merge e0031bb passed 314/314 tests and both auxiliary CI steps in run 45528929553. The report bridge, CLI validator and local read preflight now share a bounded regular-file reader; it rejects leaf symlinks and non-regular files and caps actual bytes read, including when files grow during reading. Static serving retains its existing path checks. The configured report must be an actual private regular file; a symlink is no longer accepted. Trusted parent directories and operator-controlled file permissions are still required; this is not a complete filesystem sandbox. The bridge still serves raw report inputs to the local terminal, so operators must not place secrets or unrelated sensitive fields in them. Actual local Validator and browser acceptance remain pending.


## Local capability isolation follow-up

The local faucet, wallet transfer and PumpSwap trading adapters now have separate explicit environment opt-ins (`COOK_LOCAL_FAUCET`, `COOK_LOCAL_TRANSFER`, `COOK_LOCAL_TRADING`); all default disabled. Setting the faucet flag no longer enables transfer or trading. The offline HTTP server also sets bounded header/request/keep-alive timeouts and connection/request caps. Tests cover the independent feature flags and the faucet-only server configuration. Actual localnet transactions remain disabled unless the operator separately enables the corresponding local-only adapter and supplies a pinned private genesis.

## Latest master verification — 2026-11-25

Commit 08a0ea904ac45e477b58471386081d99ad2d7a4f is green in GitHub Actions run 45529640566: 320 tests passed, 0 failed, 0 skipped; schema registry validation and held-out defensive regression steps also passed. Local capability flags are separated and all default off; the HTTP request body is capped by bytes and invalid UTF-8 is rejected. CI does not exercise an actual local Validator, wallet-funded transaction, browser session on the operator machine, or production-scale performance.
