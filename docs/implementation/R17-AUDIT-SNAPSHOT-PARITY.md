# R17 — audit snapshot parity

Baseline 2a53b727831ce7fa06545ff9c4e08ef7194fa497. R16 CI 45628713119 completed successfully, 816 tests and 215 business regressions; Chromium passed. Eight external gates remain pending.

A project revision alone does not identify its evolving local evidence set. Reuse the canonical runtime context digest for audit export, business review, runtime and lifecycle. Add an optional expected context to the existing audit endpoint; the terminal obtains a fresh business review before requesting a pinned export. An evidence change between requests rejects the export rather than silently exporting another snapshot. Existing revision-only requests remain compatible. Export contains the context ID, and nested business review matches the same snapshot's API projection. Digest verification checks the declared context's internal consistency when present; legacy exports remain digest-only. A matching digest is not authentication or original report verification.

Tests cover context changes at fixed revision, stale context rejection, malformed context requests, nested review parity and database reopen. No storage migration, UI redesign, live data, model parameters or execution changes. New CI required.
