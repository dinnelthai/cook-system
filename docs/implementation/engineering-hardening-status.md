# Engineering hardening – acceptance boundaries

This is a change inventory, not a production readiness certificate.

- H06: receipt identity/outcome and decimal evidence checks; ambiguous instruction links withheld. Full CPI trace parity is not attested.
- H07: negative gross amount domain checks; independent chain accounting and fee attribution remain unverified.
- H08: shared fee-history pagination and explicit gaps for contradictory receipt evidence; full historical source attestation remains unknown.
- H09: stricter admission of new operational-status changes; existing v1 event replay is unchanged.
- H10: draft edits use displayed revisions; stale view callbacks cannot select a different project.
- H11: archive report links require a revision; client requests time out and validate response scope. Optional create request IDs are now persisted through immutable creation events; mounted-view retries retain request keys. Browser reload recovery and uncertain local transfers are not completed.
- H12: direct development dependencies use existing lockfile versions; the offline application still requires a full npm ci. Large module decomposition is deferred.
- H13: optional real Chromium render smoke test. This is not full browser interaction E2E coverage.
- H14: bounded metadata replay benchmark included in unified acceptance. Bounded two-worker SQLite metadata contention and 100 revision/reopen regressions are included in the test suite; long-duration memory soak and production capacity are not attested.
- H15: npm run accept:all remains the mandatory Node 22/24 CI gate. An operator must separately verify external evidence and real browser interactions.

Commands (disposable offline environment):

```sh
npm ci --no-audit --no-fund
npm run accept:all
COOK_BROWSER_BINARY=/path/to/chromium npm run accept:browser-smoke
```

The browser smoke test uses a temporary home, temporary project store, and loopback only; no configured RPC or transaction capabilities. Run as a non-root account with the browser sandbox enabled.
