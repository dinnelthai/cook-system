# Project Aggregate & Event Store — V1

Status: implemented domain and local persistence foundation; not yet connected to the browser UI or execution services.

## 1. Purpose

The Project Aggregate is the canonical business identity for one token project. Project metadata, network identity, token issuance evidence, wallet groups, market bindings, risk limits and lifecycle state now share one versioned record. The SQLite store persists the latest aggregate snapshot and an append-only, hash-chained event journal.

This is the first P0 implementation slice. It does not yet migrate the browser localStorage registry, historical report workspace, wallet store or trading service. Those integrations are subsequent slices.

## 2. Aggregate contract

ProjectAggregate 1.0.0 contains:

- stable project_id and optimistic revision;
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

The local server exposes the same Project store through loopback-only endpoints. The parent server enforces localhost Host and same-origin checks; responses are no-store JSON.

- GET /api/projects — list Project aggregates.
- POST /api/projects — create a Project draft.
- GET /api/projects/:project_id — read the latest aggregate.
- POST /api/projects/:project_id/commands — append a version-checked, idempotent domain command.
- GET /api/projects/:project_id/events — read the verified event journal.
- GET /api/projects/:project_id/verify — verify the snapshot hash and full event chain.

Command requests include command_id, type, payload and expected_revision. The HTTP adapter does not expose an actor override or arbitrary SQL. The database defaults to ~/.cook-system/projects.sqlite; COOK_PROJECT_DB can select another path subject to private-directory checks.

## 8. Explicitly not implemented in this slice

- browser UI / API integration;
- migration from web/project-registry.mjs localStorage;
- migration of historical workspace records into Project;
- Project-aware wallet store and trade adapters;
- order, execution, inventory and Treasury ledgers;
- live RPC verification;
- production signing or mainnet execution.

All project execution remains disabled.
