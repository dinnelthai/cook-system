# Project Aggregate & Event Store — V1

Status: implemented domain and local persistence foundation; not yet connected to the browser UI or execution services.

## 1. Purpose

The Project Aggregate is the canonical business identity for one token project. Project metadata, network identity, token issuance evidence, wallet groups, market bindings, risk limits and lifecycle state now share one versioned record. The SQLite store persists the latest aggregate snapshot and an append-only, hash-chained event journal.

This is the first P0 implementation slice. It does not yet migrate the browser localStorage registry, historical report workspace, wallet store or trading service. Those integrations are subsequent slices.

## 2. Aggregate contract

ProjectAggregate 1.0.0 contains:

- stable project_id and optimistic revision;
- atomic draft configuration commands for profile, network, token parameters and the Dev wallet group;
- profile: name, symbol, description and public URLs;
- network: Solana cluster, genesis hash and SOL quote mint;
- token: mint, supply in base units, decimals, Dev Wallet and issuance verification state;
- wallet groups: explicit purpose, members, role, enabled state and optional base-unit allocation cap;
- market bindings: venue, market account, canonical market identity and SHA-256 identity digest;
- project budget limits;
- lifecycle stage and operational halt/active/review status (ACTIVE never enables execution);
- execution policy hard-pinned to DISABLED.

Private keys, seed phrases and signer objects are not accepted by the aggregate schema or commands.

## 3. Lifecycle and evidence gates

Allowed forward path:

DRAFT → READY → LAUNCH_SUBMITTED → LAUNCHED → BONDING_CURVE_ACTIVE → GRADUATION_PENDING → PUMPSWAP_ACTIVE → EXIT_IN_PROGRESS → SETTLEMENT_PENDING → CLOSED → ARCHIVED

No backward or skipped transition is accepted.

- READY requires a genesis identity, token supply/decimals, a Dev Wallet and an enabled DEV member in a project wallet group.
- LAUNCH_SUBMITTED requires a submitted launch signature reference.
- LAUNCHED requires verified chain evidence and verified token issuance.
- BONDING_CURVE_ACTIVE requires a verified Pump Bonding Curve market binding.
- GRADUATION_PENDING requires verified curve-complete evidence.
- PUMPSWAP_ACTIVE requires a verified PumpSwap market binding.
- EXIT_IN_PROGRESS requires explicit operator approval evidence.
- SETTLEMENT_PENDING requires verified exit completion.
- CLOSED requires a passing reconciliation, zero pending orders, zero unresolved assets and zero unresolved balance difference.
- ARCHIVED requires an internal archive evidence reference.

Manual evidence cannot satisfy a chain-verification gate. Project network and token supply configuration can only be changed while the project is in DRAFT. Clearing REVIEW_REQUIRED requires a verified internal-audit reference; setting operational status ACTIVE is only a monitoring/operations state and never enables transaction execution. The current implementation records manual issuance evidence as UNVERIFIED. The VERIFY_* commands are internal domain contracts for a future trusted read-only chain verifier; they are not exposed as public HTTP endpoints.

## 4. Persistence and audit

openProjectStore(path) uses Node's built-in SQLite database:

- parent directory and database file must be private on POSIX systems;
- snapshot writes are atomic with their event append;
- each command requires an expected aggregate revision;
- command IDs are idempotency keys;
- the PROJECT_CREATED event contains the complete initial aggregate, so the journal has a reconstructable starting state;
- event rows are append-only (SQLite triggers reject UPDATE and DELETE);
- each event hash commits to the previous event hash;
- snapshot hash and full event chain are checked on reads;
- writes never submit transactions or load wallet signers.

The event journal is a local integrity mechanism, not a cryptographic signature, remote backup or tamper-proof trust anchor. A privileged operator able to replace the database and its code can replace the chain. Backups and OS-level access control remain operator responsibilities.

## 5. API

    const store = openProjectStore("/absolute/path/projects.sqlite");
    const project = store.create({
      profile: { name: "Example", symbol: "EXAMPLE" },
      network: { cluster: "localnet", genesis_hash: "LOCAL_VALIDATOR_GENESIS_HASH" },
      token: {
        supply_base_units: "1000000000000000",
        decimals: 6,
        creator_wallet_address: "PUBLIC_DEV_WALLET_ADDRESS"
      }
    });
    const updated = store.append(project.project_id, {
      command_id: "uuid-from-client",
      type: "UPSERT_WALLET_GROUP",
      payload: { group: { /* validated wallet group */ } }
    }, { expected_revision: project.revision });

The caller must supply an absolute database path. The snippet is illustrative; do not paste placeholder addresses or use a production wallet in the initial Localnet test.

## 6. Validation

- project-aggregate.schema.json, project-wallet-group.schema.json, project-market-binding.schema.json and project-event.schema.json are registered with the repository JSON Schema validator.
- Domain validation adds cross-field invariants that JSON Schema cannot express in the repository's supported subset.
- Tests cover strict shape validation, wallet-group uniqueness, SOL-only quote identity, issuance verification gates, market binding, lifecycle gates, revision conflicts, idempotency, persistence, hash-chain verification and event immutability.

## 7. Loopback HTTP API

The Project Setup page now reads and writes the canonical API; draft profile, network, token and Dev wallet group are saved in one atomic command. The local server exposes the same Project store through loopback-only endpoints. The parent server enforces localhost Host and same-origin checks; responses are no-store JSON.

- GET /api/projects — list Project aggregates.
- POST /api/projects — create a Project draft.
- GET /api/projects/:project_id — read the latest aggregate.
- POST /api/projects/:project_id/commands — append a version-checked, idempotent domain command.
- GET /api/projects/:project_id/events — read the verified event journal.
- GET /api/projects/:project_id/verify — verify the snapshot hash and full event chain.

Command requests include command_id, type, payload and expected_revision. The HTTP adapter does not expose an actor override or arbitrary SQL. The database defaults to ~/.cook-system/projects.sqlite; COOK_PROJECT_DB can select another path subject to private-directory checks.

## 8. Explicitly not implemented in this slice

- deeper browser integration beyond the Project Setup page (the Project Setup page now uses the canonical API);
- migration from web/project-registry.mjs localStorage;
- migration of historical workspace records into Project;
- Project-aware wallet store and trade adapters;
- Project-bound market subscription and transaction execution;
- order, execution, inventory and Treasury ledgers;
- live RPC verification;
- production signing or mainnet execution.

All project execution remains disabled.

## M10-A — business isolation hardening

- Operator HTTP is allowlisted. Chain verification, trusted audit clearance and evidence-gated transitions cannot be asserted through the public command API. READY, unverified LAUNCH_SUBMITTED and operator-approved EXIT_IN_PROGRESS remain available subject to domain validation.
- An issued project may enter EXIT_IN_PROGRESS before graduation. This is an intent record, not an executed sale, transfer, or completed settlement. REVIEW_REQUIRED cannot be cleared via a status change to HALTED.
- The terminal separates selected canonical Project context from independent historical reports. Selecting a Project hides and makes the report area inert; report loading is disabled until the selection is cleared. No report is silently treated as a current project balance. Verified report binding and migration of historical data are still pending.
- The legacy unbound Localnet trade HTTP route returns PROJECT_EXECUTION_DISABLED even if its environment flag is set. No new trading execution path is introduced.
- Remaining: trusted read-only verifier, data provenance migration, complete exception lifecycle (including failed or abandoned unissued launch), end-to-end browser and Localnet verification. Existing project records created before the boundary change require independent review before being treated as trusted.

## M10-B — read-only evidence observations and declared report association

The configured private loopback RPC is queried at finalized commitment through the Project evidence-observation endpoint. It checks the pinned genesis, receipt identity and success, decoded Pump CreateEvent project fields and mint account owner/decimals/context. A successful result is OBSERVATIONS_MATCH, not independently authenticated verification. It does not promote issuance, bind markets or mutate the Project. No signing or execution is enabled. The terminal can display an archived report under a selected Project only after an exact declared ID/mint/network/genesis/SOL scope match (localnet maps to local_sim). Synthetic, incomplete and contradictory reports remain isolated. This is a presentation association, not a persistent relationship or source attestation; report import remains independent. Remaining: independently anchored verifier, persistent evidence and report links, market verification, failed-launch lifecycle, browser and actual Localnet acceptance.

## M10-C1 — persistent evidence and report references

Explicit POST of an empty evidence-observation request records the server's read-only result; GET remains non-persistent. A separate append-only Project archive pins every record to an aggregate revision and its event-chain head, detects modified content, deduplicates identical content at a revision, and marks prior revisions stale. No Project revision or lifecycle is changed. Records are bounded to 256 per Project and 64 KiB each. Project Setup lists and exports archives. Historical report links are resolved from a saved workspace revision and server-owned catalogue key, checked against Project identity, and retain workspace and report digests. The link endpoint is server-side only until workspace selection UI is integrated. The workspace must already be enabled and populated. This is not an independent source attestation or a live balance. A local administrator capable of rewriting the whole database and hashes is outside the integrity model. Market identity observation, independent verification, and end-to-end Localnet acceptance remain pending.

## M10-C2 — market identity observation and report selection

Registered Pump bonding curve and PumpSwap accounts can be observed at finalized commitment on the pinned private RPC. The reader checks the declared program, curve PDA or pool mint pair, account ownership, context and supported layout. Missing quote information fails closed. Raydium remains unsupported here. The observation is archived against the Project revision; no status is promoted, no execution is enabled, and no market reserves or prices are returned. Project Setup now lists matching reports from the latest saved workspace revision, lets the operator explicitly select a report, and archives its server-resolved reference with an optimistic Project revision check. Independent source attestation and real Localnet/browser acceptance remain open; the market reader only handles already registered markets and cannot bypass earlier lifecycle restrictions.

## M11-01 to M11-03 — retrospective order review domain and journal

Added an offline order evidence state machine and append-only per-project journal in the existing private SQLite store. The registered scope pins the Project revision and event hash. Reported success/failure are explicitly unverified declarations; conflicting outcomes trigger REVIEW_REQUIRED, unknown outcomes are not silently classified as failure, and review-required state cannot be cleared by a new report. Events are replayed and hash-checked on read, with optimistic revisions, bounded capacity, idempotency and conservative signature deduplication. The public Project order-review route is GET only. The journal has no execution intent creation, signing, transaction submission, automated retry, financial posting or settlement interface. Internal append is for future vetted retrospective import and tests only. Actual receipt provenance, batch/multi-leg attribution, reconciliation, browser display, external tamper anchoring and Localnet verification remain open.

## M11-05/06 — historical order receipt review

The new read-only order-receipt-review endpoint resolves an already registered retrospective order and an existing revision-pinned Project report link. It reloads the saved workspace and compares both stored digests, recomputes report audits, compares the archived receipt's declared signature, slot and outcome, and exposes references to finalized reconciled cash postings and inventory events. It optionally compares the same archived receipt against a finalized private RPC with the configured genesis pin, using existing receipt expectation checks. Missing or contradictory evidence is not resolved automatically; results are not financial postings, settlement, or independent attestation. Results are returned on demand (not persisted as a new order event). Localnet and local_sim report labels are accepted for a localnet Project only with exact genesis and mint identity. No order ingestion, signing, retries or execution are introduced. Full external ownership, receipt provenance, multi-leg attribution, UI and real Localnet validation remain outstanding.

## M11-07/08A — project-scoped order review terminal

The selected Project mounts a retrospective order blotter independent of the historical report viewer. It displays counts, unknown and exception filters, stale records, immutable event detail, and on-demand receipt review against current-revision linked reports. Responses are checked against project/order revisions and async requests are invalidated when the selection changes. Exported data stays explicitly unverified. The new event-detail route is a read-only POST query; no arbitrary event ingestion is exposed. Existing records must be populated via vetted retrospective import (not yet implemented). The view therefore correctly displays an empty state on a fresh database. CI/static and pure-view tests do not replace browser acceptance or real Localnet receipt tests. No live OMS or settlement execution is enabled.

## M11-08B — archive-based retrospective import and review persistence

The terminal can explicitly import internally consistent archived trade receipt units from a current Project report link. The server reloads both stored digests, recomputes report audits, and derives only signatures of explicitly reconciled trade postings. Non-trade receipts are excluded; failed-order intent is not inferred. The SQLite import is atomic and deduplicated by signature within Project/source; conflicting existing outcomes or stale project revisions roll back the entire batch. A receipt unit is not necessarily an economic order or fill. On-demand receipt reviews are now archived with their order revision/head hash in the existing Project archive. No settlement, independent source attestation, live OMS or execution is introduced. Tests cover the import derivation and rollback; real browser/Localnet acceptance and multi-leg attribution remain open.

## M12-01A — lifecycle evidence coverage, not promotion

Fixed the M11 import regression fixture to include the required issuance signature; no domain validation is relaxed. Added a Project-scoped lifecycle evidence projection and terminal view. It reports recorded stage separately from archived issuance/market observation status; stale or foreign records do not satisfy current evidence, contradictions take precedence, and the independent attestation blocker remains. No transitions, automatic launch, market operation or settlement are authorized by the projection. Curve completion, migration, exception clearance, archive semantics, and live Localnet/browser verification remain open.

## M12-02/04A — bounded historical graduation evidence

A localnet Project can review a user-selected normalized historical Pump collector report (request cap 1 MiB, terminal file cap 900 KiB, at most 1,000 events and 20 pool records). The server checks declared genesis, network, token, quote, derived curve address and issuance signature before recomputing the existing graduation audit. Creation, completion and migration/pool replay are distinct historical milestones. Only a compact digest and review summary are archived; the original source file must be retained separately. No caller-supplied verification status is trusted, and neither project stage nor execution permissions change. The terminal separately shows archived milestone status. Real Localnet/browser acceptance, full raw archive persistence, long-history streaming and independent source authentication remain outstanding.

## M12-05/06A — exception and financial close evidence projection

A current linked historical report can be reloaded and reviewed in the terminal. The review distinguishes cash discrepancies, outstanding recorded assets, creator receivables, liabilities, stale/unresolved receipt records and missing RPC comparisons. It archives only a scoped, unverified summary, never a settlement decision or asset disposition instruction. No closure or recovery transition is enabled. A partial single-account historical interval cannot establish project-wide completeness; independent ownership, valuation, source provenance and account coverage remain explicitly unresolved. Browser and actual Localnet validation remain open.

## M12-07/08A — project audit bundle export

A revision-pinned, read-only SQLite transaction exports the checked Project snapshot, event chain, all Project evidence archives (including stale labels), retrospective order states/events, lifecycle evidence projection and exception list. A canonical JSON SHA-256 digest detects changes to the exported content if the digest is retained separately; it is not a signature or independent provenance check. The export is bounded to 32 MiB of canonical content, does not store a duplicate snapshot in the database, and does not include original workspace/history files. Those originals must be retained separately. The terminal exposes an explicit export action. Project lifecycle and settlement permissions remain unchanged; actual ARCHIVED transition, independent verification, browser/Localnet acceptance and production execution are outside this delivery.

## M13-01/03A — Project historical treasury projection

The current-revision linked historical report is reloaded and audited using the existing financial close and closing account-set calculations. One interval only: cash flows, token inventory and cost, historical realized PnL, creator receivables and account-set checks are kept distinct. The declared account ID labels are compared with registered wallet labels for coverage, without assuming ownership or completeness. Contradictions suppress monetary projections; missing inputs remain unknown. Project-wide totals, live balances and trading availability are deliberately null. The server archives a bounded review summary; no new accounting postings, fund movements, execution or settlement are enabled. Actual multi-account ownership/coverage, independent financial parity, browser/Localnet verification and further reconciliation remain outstanding.

## M13-04/06A — historical PnL, creator-fee and budget review

Treasury now includes the existing historical endpoint valuation bridge and recomputed Creator Fee subledger summary. Cash receipts, accruals, cost, supplied valuation, realized PnL and the unexplained NAV bridge residual are distinct. A bounded comparison of recorded interval gross external capital inflow against the current configured project budget is shown as historical review only; the policy effective period, lifetime funding, remaining budget and current exposure remain unknown. It is not a transaction sizing or execution gate. A structured terminal view presents exact lamport amounts without floating-point conversion, preserving unknowns. No independent valuation, live asset balances, cash movements, trading authorization or settlement are introduced. Real browser and Localnet acceptance remain outstanding.

## M13-07/08A — unified retrospective project risk review

A single SQLite read transaction derives the current Project risk view from lifecycle blockers, current archived treasury/close reviews, stale record counts and retrospective order receipt evidence. Findings are deduplicated by category and code, with references retained and conflict severity taking precedence. Order receipt checks require exact order revision, head hash and signature. A missing review or unknown outcome cannot be classified as safe. The read-only endpoint and terminal provide counts, detailed findings, refresh and JSON export. It is an evidence-review view, not a live portfolio/execution gate; live balances, exposure, depth, independent attestation and actual environment acceptance remain unavailable. No automatic state mutation or trading permission is introduced.
