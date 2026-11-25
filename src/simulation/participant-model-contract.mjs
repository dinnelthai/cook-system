/** Descriptive QA limitations of participant-simulator.1, not a behavior policy.
 * Keep model metadata outside detector inputs. */
export function describeParticipantModel(){
 return {
  generator_version:"participant-simulator.1",
  status:"UNCALIBRATED_SYNTHETIC_FIXTURE",
  scheduling:"FIXED_ROUND_ROBIN",
  market_model:"SIMPLIFIED_CONSTANT_PRODUCT",
  random_stream_scope:"SHARED",
  seed_normalization:"UINT32_WITH_ZERO_ALIAS",
  parameters:{
   used_in_fixture:["role_class","opening_quote_balance","opening_token_balance","fee_bps","steps","seed","initial_reserves"],
   timestamp_only:["execution_latency_ms"],
   declared_but_unused:["risk_aversion","holding_horizon_ms","observation_latency_ms","observation_noise","public_information_sensitivity","transaction_cost_sensitivity","random_stream_id"]
  },
  behavior_labels_are_synthetic_annotations:true,
  actual_arbitrage_verified:false,actual_mev_verified:false,
  independent_random_streams_verified:false,
  historical_calibration_status:"NOT_PERFORMED",
  real_market_accuracy:"UNKNOWN",
  execution_enabled:false
 };
}
