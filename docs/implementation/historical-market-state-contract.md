# DATA-01: Historical market state contract

Unified terminal and exported reports share cook-historical-market-state.1: closed interval identity, declared coverage, observed trade aggregates, reserve snapshot and candle evidence status. It never represents live state, authenticated coverage or execution readiness. Missing network/genesis fields in legacy historical reports remain unknown. Contradictory declared scope labels are rejected without needing raw receipts. Candle evidence network must match a declared report network (localnet maps to local_sim); synthetic evidence cannot claim a real network.

Reserve fields are suppressed when market coverage is incomplete or supplied candle evidence contradicts the report. Observed aggregates are descriptive records, not proof of complete market activity. This contract does not replace the lower-level replay state, independently authenticate reserves or add a trading capability.
