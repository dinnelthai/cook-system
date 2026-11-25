# Engineering hardening – acceptance boundaries

This is a change inventory, not a production readiness certificate.

## Verified engineering baseline — 2026-11-25

- Tested main commit: `e791a324001c16bf58502f4bc45b759e39001025`
- [GitHub Actions run 45610020586](https://github.com/dinnelthai/cook-system/actions/runs/45610020586): **success**.
- Node 22 and Node 24: each completed 728 tests with zero failures and 19 passing engineering checks. The 115 business regression tests are a subset of the test suite, not an additional unique test count.
- Node 22 Chromium recovery interaction: `BROWSER_RECOVERY_PASS`, `temporary_cleanup: PASS`, `execution_enabled: false`, `full_browser_e2e_validated: false`.
- Browser startup regressions resolved: static module allowlist compatibility, browser-safe model metadata and network-label helpers, registered project diagnostic events, loopback DNS exclusion, bounded process shutdown and profile cleanup.
- Eight operator gates remain pending in the unified report. No external data, trading or transaction submission is authorized by this baseline.

The verified SHA is the code snapshot tested by this run, not a claim about later changes.

- H06: receipt identity/outcome and decimal evidence checks; ambiguous instruction links withheld. Full CPI trace parity is not attested.
- H07: negative gross amount domain checks; independent chain accounting and fee attribution remain unverified.
- H08: shared fee-history pagination and explicit gaps for contradictory receipt evidence; full historical source attestation remains unknown.
- H09: stricter admission of new operational-status changes; existing v1 event replay is unchanged.
- H10: draft edits use displayed revisions; stale view callbacks cannot select a different project.
- H11: archive report links require a revision; client requests time out and validate response scope. Optional create request IDs are now persisted through immutable creation events; mounted-view retries retain request keys. Browser reload supports a read-only creation lookup using an opaque tab-scoped request ID. Missing observations are not proof of failure; no automatic resend. Command reload recovery remains incomplete. Archived uncertain local receipts can now be reviewed without network access or retry authority. Actual submission recovery remains outside this patch.
- H12: direct development dependencies use existing lockfile versions; the offline application still requires a full npm ci. The stable v1 event codec has been extracted from the store with unchanged digest semantics; broad module decomposition is deferred.
- H13: Node 22 CI requires the CDP browser interaction check covering metadata recovery after reload, project selection, and isolation of unrelated report content; it passed at the verified baseline above. The separate render smoke command remains optional. This is not full browser E2E coverage.
- H14: bounded metadata replay benchmark included in unified acceptance. Bounded two-worker SQLite metadata contention and 100 revision/reopen regressions are included in the test suite; Repeated metadata replay includes RSS and heap samples at replay boundaries, not continuous memory monitoring. Long-duration memory soak and production capacity are not attested.
- H15: npm run accept:all remains the mandatory Node 22/24 CI gate. An operator must separately verify external evidence and real browser interactions.

Commands (disposable offline environment):

```sh
npm ci --no-audit --no-fund
npm run accept:all
COOK_BROWSER_BINARY=/path/to/chromium npm run accept:browser-smoke
COOK_BROWSER_BINARY=/path/to/chromium npm run accept:browser-recovery
```

The browser smoke test uses a temporary home, temporary project store, and loopback only; no configured RPC or transaction capabilities. Run as a non-root account with the browser sandbox enabled.

## Remaining operator acceptance

The Node 22 CI job now requests the isolated Chromium metadata recovery interaction test using the runner's installed browser, without disabling its sandbox. The baseline run above verifies that specific browser path, including temporary-profile cleanup. Full page and layout acceptance still requires an operator. Archived receipt review is read-only and does not resolve missing signatures or establish source authenticity. A passing CI run does not attest a live RPC, transaction execution, real-market behavior or production performance.

### Open acceptance checklist

| Gate | State |
|---|---|
| Actual private Localnet read-only preflight | NOT_RUN |
| All browser pages, layouts and interactions | PARTIAL — metadata recovery path verified |
| Local key custody and permissions | NOT_RUN |
| Local transfer confirmation | NOT_RUN; no transaction submitted by acceptance |
| Independent historical financial reconciliation | NOT_RUN |
| Independent archived receipt and CPI parity | NOT_RUN |
| Long-duration soak and resource capacity | NOT_RUN; bounded tests only |
| Credential rotation and Git history review | NOT_VERIFIED |

Known implementation limitations: recovery of ordinary commands after browser reload, ambiguous submission identity without a receipt, and broad large-module decomposition are not complete. Missing or contradictory evidence remains unknown or requires review. Do not equate an automated test pass with source authenticity, market model calibration or deployment approval.
