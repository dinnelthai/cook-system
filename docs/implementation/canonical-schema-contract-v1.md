# Canonical Schema Contract — V1

- Status: Implementation contract
- Version: 0.1
- Scope: Offline Pump.fun pre-graduation simulator and defensive market-quality analysis
- Applies to: event engine, market state, agents, candle builder, detectors, evaluation harness

## 1. Contract principles

1. All monetary and token quantities are represented as decimal strings in base units, never binary floating-point numbers.
2. Every record has an explicit schema version.
3. Observed chain data and synthetic simulation data are separated by provenance and storage boundary.
4. A transaction intent is not an execution. Only confirmed executions update reserves, balances, OHLCV, and trading volume.
5. Token transfers are not buys or sells and never count as trading volume.
6. Public information events do not directly update curve price or reserves.
7. Raw observations are immutable. Derived metrics and alerts reference source event IDs.
8. Hidden agent roles and controller ground truth are evaluation-only metadata and are never included in ordinary detector input.
9. Every inferred relationship carries evidence, counter-evidence, coverage, and uncertainty.
10. All state transitions are deterministic for a fixed ordered input, adapter version, and simulation seed.

## 2. Common scalar conventions

| Field kind | Representation | Example |
|---|---|---|
| Token / quote amount | Decimal string in base units | "1250000000" |
| Price | Decimal string with documented quote/base units | "0.0000000125" |
| Fee | Integer base units plus fee mint / denomination | "2500" |
| Slot / transaction index | Integer | 312345678 |
| Event time | UTC Unix milliseconds integer | 1795430400123 |
| Ratio / probability | JSON number, bounded and documented | 0.82 |
| Address / signature | String, chain-native format | "address-or-signature" |
| Unknown value | null plus an explicit reason where material | null |

Never use a floating-point value as the authoritative representation of an on-chain amount. Convert to display decimals only at the presentation layer.

## 3. Market identity

Every event and state snapshot must identify the market:

- chain_id
- network (mainnet / devnet / local_sim)
- token_mint
- quote_mint
- curve_program_id
- curve_account
- program_version or pinned IDL revision
- market_phase (bonding_curve / graduated / post_graduation)

A token symbol is display metadata, not a unique market identifier.

## 4. MarketEvent contract

Required top-level fields:

| Field | Type | Meaning |
|---|---|---|
| schema_version | string | Event schema version |
| event_id | string | Stable unique event ID |
| provenance | enum | observed_chain or synthetic |
| event_kind | enum | Canonical event type |
| market | object | Market identity |
| event_time_ms | integer | Event timestamp |
| ordering | object | Slot, transaction, instruction and deterministic sequence |
| source | object | RPC / indexer / simulator source and provenance |
| payload | object | Type-specific event data |
| quality | object | Completeness and validation flags |

### 4.1 Canonical event kinds

- CURVE_BUY_EXECUTED
- CURVE_SELL_EXECUTED
- TOKEN_TRANSFER
- FEE_MOVEMENT
- AUTHORITY_CHANGE
- PUBLIC_INFORMATION
- ORDERING_METADATA
- ACCOUNT_BALANCE_SNAPSHOT
- CURVE_STATE_SNAPSHOT
- DATA_GAP
- SIMULATION_INTENT
- SIMULATION_REJECTED_INTENT

Only CURVE_BUY_EXECUTED and CURVE_SELL_EXECUTED contribute to raw trading volume. Other event types must never be silently mapped to a trade.

### 4.2 Execution payload

Required for confirmed curve executions:

- signature
- actor_address
- token_amount_base_units
- quote_amount_base_units
- quote_mint
- execution_price_decimal
- fee_components[]
- pre_state_reference
- post_state_reference
- instruction_index
- execution_status

The event must distinguish user input, curve-effective amount, fee amounts, and actual reserve deltas according to the exact program adapter. Do not assume they are interchangeable.

### 4.3 Transfer payload

Required fields:

- signature
- source_owner
- destination_owner
- source_token_account
- destination_token_account
- token_amount_base_units
- transfer_type (wallet / custody / escrow / program / unknown)
- provenance_confidence

A transfer has no curve quote output and no market execution price unless separately linked to an actual swap. It does not count as a buy, sell, or realized sale proceeds.

### 4.4 Synthetic provenance

Synthetic records must include:

- scenario_id
- random_seed
- generator_version
- synthetic_agent_id where relevant
- ground_truth_ref stored only in the evaluation sidecar

Never place hidden controller labels or synthetic role labels in fields consumed by the ordinary detector.

## 5. Ordering contract

Ordering must preserve all available chain order information:

- slot
- transaction_index
- instruction_index
- inner_instruction_index, if available
- event_sequence
- block_time_ms
- ordering_confidence

For synthetic events, use a deterministic event_sequence. If historical ordering is incomplete, mark it incomplete; do not invent a precise ordering.

## 6. MarketState contract

A state snapshot is a versioned projection of the event ledger, not a replacement for raw events.

Required fields:

- schema_version
- state_id
- market
- as_of_event_id
- as_of_time_ms
- adapter_version
- virtual_quote_reserve_base_units
- virtual_token_reserve_base_units
- real_quote_reserve_base_units, if authoritative and available
- real_token_reserve_base_units, if authoritative and available
- fee_config_reference
- curve_progress, with documented denominator
- graduation_status
- mint_supply_base_units
- curve_token_inventory_base_units
- holder_balance_root or snapshot reference
- reconciliation
- data_completeness

### 6.1 Reserve semantics

Virtual reserves and real account balances must be separate fields. A virtual reserve is a pricing parameter, not proof of spendable or withdrawable funds.

If actual reserve semantics cannot be verified for a program version, mark the field unavailable and explain why. Do not substitute virtual reserves.

### 6.2 Supply reconciliation

The state engine should reconcile:

mint supply = curve inventory + wallet inventory + burned supply + escrow / custody + other classified program balances

The reconciliation record contains:
- calculated_total
- authoritative_total
- difference
- tolerance
- status (pass / warning / fail / unknown)
- excluded or unclassified accounts

Never force an unexplained difference into a fabricated category.

## 7. AgentState and simulation-only metadata

Agent configuration is private to the simulation harness.

Required fields:

- schema_version
- agent_id (synthetic, non-chain identity)
- initial_quote_balance_base_units
- initial_token_balance_base_units
- trait_distribution_version
- risk_aversion
- holding_horizon_ms
- observation_latency_ms
- execution_latency_ms
- observation_noise_profile
- public_information_sensitivity
- transaction_cost_sensitivity
- random_stream_id

Role configuration may exist in a simulation-only sidecar. The detector receives only observable events and derived public features.

### 7.1 Evaluation sidecar

A separate evaluation-only record may contain:
- scenario_id
- agent_id
- simulated_role
- latent_controller_group
- ground_truth_behavior_label

This sidecar must be inaccessible to detector inference and excluded from production or historical data pipelines.

## 8. ActionIntent contract

An agent action is not a trade.

Required fields:
- intent_id
- scenario_id
- agent_id
- action_kind (HOLD / BUY_REQUEST / SELL_REQUEST / PUBLISH_PUBLIC_SIGNAL / NO_OP)
- created_at_ms
- observation_reference
- requested_amount_base_units, when applicable
- expiry_ms
- random_seed_reference

The event engine may accept, delay, reject, or expire an intent. Only a resulting confirmed execution event updates market state and raw OHLCV.

No schema field may contain a real private key, seed phrase, signer secret, or executable transaction payload.

## 9. Raw Candle contract

A raw candle is built only from confirmed curve execution events.

Required fields:
- schema_version
- market
- interval_start_ms
- interval_end_ms
- open_price
- high_price
- low_price
- close_price
- quote_volume_base_units
- token_volume_base_units
- buy_quote_volume_base_units
- sell_quote_volume_base_units
- execution_count
- first_event_id
- last_event_id
- event_order_completeness
- provenance

Raw OHLCV must not be modified by wallet clustering, anomaly labels, or model predictions.

Synthetic candles must carry synthetic provenance and scenario_id and must never be mixed with observed-chain candles.

## 10. MarketAlert contract

Required fields:

- schema_version
- alert_id
- alert_type
- severity
- market
- window_start_ms
- window_end_ms
- observed_facts[]
- inferred_relationships[]
- evidence[]
- counter_evidence[]
- unknowns[]
- confidence
- data_completeness
- source_event_ids[]
- model_version
- scenario_id, only for synthetic evaluation
- explanation
- defensive_interpretation

Recommended alert types:

- POSSIBLE_CONTROL_CLUSTER
- CIRCULAR_FLOW_SIGNATURE
- LOW_BREADTH_PRICE_SHOCK
- WEAK_BREADTH_RECOVERY
- EARLY_COHORT_INVENTORY_DECLINE
- TRANSFER_VS_SELL_MISMATCH
- GROSS_NET_DEMAND_DIVERGENCE
- ATTRIBUTION_UNCERTAINTY
- CURVE_STATE_OR_DATA_MISMATCH
- EXECUTION_ORDERING_DISTORTION

Alerts must use probabilistic language and show counter-evidence. An alert is not proof of common ownership, intent, or legal wrongdoing.

## 11. Deterministic replay invariants

For a fixed:
- initial state;
- ordered event stream;
- adapter and fee configuration;
- schema version;
- simulation seed;

the engine must reproduce:
- reserve state;
- wallet balances;
- fee accounting;
- curve progress;
- raw OHLCV;
- derived features.

A replay mismatch must produce a reconciliation error with the first divergent event reference.

## 12. Storage separation

Recommended logical partitions:

- observed_chain/events/
- observed_chain/state_snapshots/
- observed_chain/raw_candles/
- synthetic/scenarios/
- synthetic/events/
- synthetic/ground_truth_sidecar/
- synthetic/raw_candles/
- derived/features/
- derived/alerts/
- evaluation/reports/

Synthetic data must be impossible to mistake for observed chain data in API responses and UI labels.

## 13. Implementation order

1. Implement schema validation and versioning.
2. Implement decimal-string amount utilities.
3. Implement MarketEvent ingestion and signature / event deduplication.
4. Implement deterministic ordering and event replay.
5. Implement MarketState snapshots and reconciliation.
6. Implement raw candle construction.
7. Implement AgentState and ActionIntent for simulation only.
8. Implement MarketAlert output with evidence provenance.
9. Add contract tests for transfer / trade separation and synthetic / observed isolation.

## 14. Acceptance criteria

- [ ] All contracts are versioned and validated.
- [ ] Amounts are never stored as binary floating-point values.
- [ ] Observed and synthetic records are physically or logically separated.
- [ ] Transfers, public information, and intents do not count as executions.
- [ ] Only confirmed curve executions update raw OHLCV.
- [ ] Virtual reserves are distinct from actual account balances.
- [ ] Hidden evaluation labels are unavailable to detector inference.
- [ ] Every alert references source events and exposes uncertainty.
- [ ] Fixed-seed replay is deterministic.
- [ ] Supply, reserve, fee, and inventory reconciliation tests pass.
