import test from "node:test";
import assert from "node:assert/strict";
import {fileURLToPath} from "node:url";
import {dirname,join} from "node:path";
import {loadSchemaRegistry,validateJsonSchema} from "../src/core/json-schema-validator.mjs";
import {auditObservedEventTimeline} from "../src/core/event-timeline-audit.mjs";
import {auditCandleEvidence} from "../src/core/candle-integrity-audit.mjs";
import {assessSourceProvenance} from "../src/core/source-provenance.mjs";
const root=join(dirname(fileURLToPath(import.meta.url)),"..","schemas"),registry=await loadSchemaRegistry(root);
const market={chain_id:"solana",network:"synthetic",token_mint:"token",quote_mint:"SOL",curve_program_id:"synthetic-curve",market_phase:"bonding_curve"};
const event=(i,extra={})=>({schema_version:"1.0.0",event_id:"e"+i,provenance:"observed_chain",event_kind:"CURVE_BUY_EXECUTED",
 market:{...market,network:"local_sim"},event_time_ms:i*1000,
 ordering:{slot:100,transaction_index:0,instruction_index:i,inner_instruction_index:null,event_sequence:0,ordering_confidence:"complete"},
 source:{source_type:"rpc",source_id:"rpc-a",signature:"sig"+i},
 payload:{signature:"sig"+i,actor_address:"wallet"+i,token_amount_base_units:"10",quote_amount_base_units:"20",quote_mint:"SOL",execution_price_decimal:"2",fee_components:[]},
 quality:{is_complete:true,validation_status:"valid"},...extra});
test("schema registry resolves refs and validates representative market events",()=>{
 for(const [name,schema] of registry)for(const ref of JSON.stringify(schema).matchAll(/"\$ref":"([^"]+)"/g))assert.ok(registry.has(ref[1]),name+" -> "+ref[1]);
 const sample={schema_version:"1.0.0",event_id:"s1",provenance:"synthetic",event_kind:"CURVE_BUY_EXECUTED",market,event_time_ms:1,
  ordering:{event_sequence:0,ordering_confidence:"synthetic"},source:{source_type:"simulator",source_id:"test"},
  payload:{signature:"s1",actor_address:"agent",token_amount_base_units:"10",quote_amount_base_units:"20",quote_mint:"SOL",execution_price_decimal:"2",fee_components:[]},
  quality:{is_complete:true,validation_status:"valid"},synthetic_metadata:{scenario_id:"s",random_seed:1,generator_version:"test.1"}};
 assert.equal(validateJsonSchema(sample,registry.get("market-event.schema.json"),registry).valid,true);
 const bad=structuredClone(sample);bad.payload.quote_amount_base_units="-1";
 assert.equal(validateJsonSchema(bad,registry.get("market-event.schema.json"),registry).valid,false);
});
test("all checked-in schema contracts accept representative minimal objects",()=>{
 const samples={
 "market-identity.schema.json":market,
 "market-event.schema.json":{schema_version:"1.0.0",event_id:"s",provenance:"synthetic",event_kind:"CURVE_BUY_EXECUTED",market,event_time_ms:1,ordering:{event_sequence:0,ordering_confidence:"synthetic"},source:{source_type:"simulator",source_id:"s"},payload:{signature:"s",actor_address:"a",token_amount_base_units:"1",quote_amount_base_units:"1",quote_mint:"SOL",execution_price_decimal:"1",fee_components:[]},quality:{is_complete:true,validation_status:"valid"},synthetic_metadata:{scenario_id:"s",random_seed:1,generator_version:"1"}},
 "market-state.schema.json":{schema_version:"1.0.0",state_id:"s",market,as_of_time_ms:1,adapter_version:"1",virtual_quote_reserves_base_units:"1",virtual_token_reserves_base_units:"1",token_total_supply_base_units:"1",protocol_fees_base_units:"0",creator_fees_base_units:"0",complete:false,curve_progress:{value:0,denominator_definition:"test"},graduation_status:"not_graduated",reconciliation:{status:"unknown",difference_base_units:null},data_completeness:"unknown"},
 "raw-candle.schema.json":{schema_version:"1.0.0",market,interval_start_ms:0,interval_end_ms:60000,open_price:"1",high_price:"1",low_price:"1",close_price:"1",quote_volume_base_units:"1",token_volume_base_units:"1",buy_quote_volume_base_units:"1",sell_quote_volume_base_units:"0",execution_count:1,first_event_id:"e",last_event_id:"e",event_order_completeness:"complete",provenance:"synthetic"},
 "market-alert.schema.json":{schema_version:"1.0.0",alert_id:"a",alert_type:"ATTRIBUTION_UNCERTAINTY",severity:"low",market,window_start_ms:0,window_end_ms:1,observed_facts:[],inferred_relationships:[],evidence:[],counter_evidence:[],unknowns:[],confidence:0.5,data_completeness:"unknown",source_event_ids:[],model_version:"1",explanation:"x",defensive_interpretation:"x"},
 "agent-state.schema.json":{schema_version:"1.0.0",scenario_id:"s",agent_id:"a",role_class:"retail",quote_balance_base_units:"1",token_balance_base_units:"0",risk_aversion:0.5,holding_horizon_ms:0,observation_latency_ms:0,execution_latency_ms:0,observation_noise:{profile:"none",scale:0},public_information_sensitivity:0.5,transaction_cost_sensitivity:0.5,random_stream_id:"r"},
 "action-intent.schema.json":{schema_version:"1.0.0",intent_id:"i",scenario_id:"s",agent_id:"a",action_kind:"HOLD",created_at_ms:0,random_stream_id:"r"},
 "curve-replay-state.schema.json":{schema_version:"1.0.0",market,virtual_token_reserves_base_units:"1",virtual_quote_reserves_base_units:"1",real_token_reserves_base_units:"1",real_quote_reserves_base_units:"1",token_total_supply_base_units:"1",protocol_fees_base_units:"0",creator_fees_base_units:"0",complete:false,lifecycle:"bonding_curve",as_of_event_id:null,curve_buy_quote_volume_base_units:"0",curve_sell_quote_volume_base_units:"0",curve_token_volume_base_units:"0",execution_count:0,ignored_non_curve_event_count:0},
 "simulation-ground-truth.schema.json":{schema_version:"1.0.0",scenario_id:"s",agent_id:"a",simulated_role:"retail",latent_controller_group:null,ground_truth_behavior_labels:["unknown"]},
 "source-evidence.schema.json":{schema_version:"cook-source-evidence.1",status:"UNVERIFIED",scope:{},source:{},capture:{},issues:[],source_attestation:"UNKNOWN",signature_verified:false},
 "historical-event-index.schema.json":{schema_version:"cook-historical-event-index.1",batch_ids:[],batch_manifest:[],batch_count:0,event_occurrence_count:0,duplicate_count:0,unique_event_count:0,entries:[],source_attestation:"UNKNOWN",history_complete_attested:false,index_sha256:"a".repeat(64)},
 "paper-quote-plan.schema.json":{schema_version:"cook-paper-quote-plan.1",status:"BLOCKED",quote:{},reasons:[],paper_only:true,execution_enabled:false,transaction_signing_enabled:false,transaction_submission_enabled:false},
 "risk-alert-event.schema.json":{sequence:1,type:"ALERT_OPENED",alert_id:"a",at_ms:1,payload:{},previous_hash:"0".repeat(64),record_hash:"1".repeat(64)}
 };
 for(const [name,sample] of Object.entries(samples)){const result=validateJsonSchema(sample,registry.get(name),registry);assert.equal(result.valid,true,name+": "+JSON.stringify(result.errors));}
});
test("event timeline uses chain coordinates rather than block time",()=>{
 const a=event(1),b=event(2);a.ordering.instruction_index=0;b.ordering.instruction_index=1;a.event_time_ms=2000;b.event_time_ms=1000;
 const r=auditObservedEventTimeline({events:[b,a],slotTimes:[{slot:100,block_time_ms:1500}]});
 assert.deepEqual(r.ordered_event_ids,["e1","e2"]);assert.equal(r.block_time_used_for_ordering,false);
 assert.ok(r.issues.some(x=>x.code==="EVENT_TIME_NON_MONOTONIC"||x.code==="EVENT_BLOCK_TIME_SKEW"));
});
test("timeline rejects missing total-order coordinates and conflicting event identities",()=>{
 const a=event(1);delete a.ordering.transaction_index;assert.equal(auditObservedEventTimeline({events:[a]}).status,"REVIEW_REQUIRED");
 const b=event(1);b.payload.quote_amount_base_units="999";assert.equal(auditObservedEventTimeline({events:[event(1),b]}).status,"REVIEW_REQUIRED");
});
test("candle evidence recomputation catches tampered OHLCV and keeps coverage unknown",()=>{
 const a=event(1);a.provenance="synthetic";a.market=market;a.ordering={event_sequence:0,ordering_confidence:"synthetic"};
 a.synthetic_metadata={scenario_id:"s",random_seed:1,generator_version:"test"};
 const candles=[{schema_version:"1.0.0",market,interval_start_ms:0,interval_end_ms:60000,open_price:"2",high_price:"2",low_price:"2",close_price:"2",quote_volume_base_units:"20",token_volume_base_units:"10",buy_quote_volume_base_units:"20",sell_quote_volume_base_units:"0",execution_count:1,first_event_id:"e1",last_event_id:"e1",event_order_completeness:"complete",provenance:"synthetic",scenario_id:"s"}];
 assert.equal(auditCandleEvidence({events:[a],candles,intervalMs:60000,coverageStatus:"PAGINATION_COMPLETE_DECLARED"}).status,"CONSISTENT");
 candles[0].close_price="3";const r=auditCandleEvidence({events:[a],candles,intervalMs:60000,coverageStatus:"PAGINATION_COMPLETE_DECLARED"});
 assert.equal(r.status,"REVIEW_REQUIRED");assert.equal(r.coverage_attestation,"UNKNOWN");
});
test("source provenance separates observed identity metadata from independent authentication",()=>{
 const scope={network:"local_sim",genesis_hash:"genesis",provenance:"observed_chain"};
 const source={source_type:"rpc",source_id:"rpc-1",endpoint_id:"operator-endpoint",observed_genesis_hash:"genesis"};
 const capture={commitment:"finalized",captured_at_ms:10,adapter_version:"1",query_fingerprint:"q"};
 const ok=assessSourceProvenance({scope,source,capture,rawPayload:{slot:1}});
 assert.equal(ok.status,"IDENTITY_MATCHED_NOT_AUTHENTICATED");assert.equal(ok.signature_verified,false);assert.equal(ok.source_attestation,"UNKNOWN");
 const bad=assessSourceProvenance({scope,source:{...source,observed_genesis_hash:"other"},capture,rawPayload:{}});
 assert.equal(bad.status,"REVIEW_REQUIRED");
});

test("timeline treats bonding-curve and post-graduation phases as one token lifecycle",()=>{
 const a=event(1),b=event(2);a.ordering.instruction_index=0;b.ordering.instruction_index=1;
 b.market={...b.market,market_phase:"post_graduation"};
 const r=auditObservedEventTimeline({events:[a,b]});
 assert.notEqual(r.status,"REVIEW_REQUIRED");assert.deepEqual(r.ordered_event_ids,["e1","e2"]);
});
