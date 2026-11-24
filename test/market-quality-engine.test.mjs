import test from "node:test";
import assert from "node:assert/strict";
import {analyzeMarketQuality} from "../src/core/market-quality-engine.mjs";
const market={chain_id:"solana",network:"synthetic",token_mint:"token",quote_mint:"SOL",curve_program_id:"curve",market_phase:"bonding_curve"};
const event=(id,side,actor,quote,price,time)=>({schema_version:"1.0.0",event_id:id,provenance:"synthetic",event_kind:side==="buy"?"CURVE_BUY_EXECUTED":"CURVE_SELL_EXECUTED",market,event_time_ms:time,
 ordering:{event_sequence:time,ordering_confidence:"synthetic"},source:{source_type:"simulator",source_id:"test"},
 payload:{actor_address:actor,quote_amount_base_units:quote,token_amount_base_units:"100",execution_price_decimal:price},
 quality:{is_complete:true,validation_status:"valid"},synthetic_metadata:{scenario_id:"mq",random_seed:1,generator_version:"test"}});
test("market quality separates gross turnover, net flow and address breadth",()=>{
 const r=analyzeMarketQuality({events:[event("a","buy","wallet-a","100","1",1),event("b","sell","wallet-b","90","1.1",2)]});
 assert.equal(r.metrics.gross_quote_turnover_base_units,"190");assert.equal(r.metrics.net_quote_flow_proxy_base_units,"10");
 assert.equal(r.metrics.unique_buyer_count,1);assert.equal(r.metrics.unique_seller_count,1);
 assert.equal(r.execution_enabled,false);assert.equal(r.is_trading_signal,false);
});
test("low breadth price shock is descriptive and not a control accusation",()=>{
 const r=analyzeMarketQuality({events:[event("a","buy","wallet-a","100","1",1),event("b","buy","wallet-b","100","1.3",2)]});
 assert.ok(r.alerts.some(a=>a.alert_type==="LOW_BREADTH_PRICE_SHOCK"));assert.ok(r.alerts.every(a=>a.inferred_relationships.length===0));
});
test("unattributed actors and unknown coverage remain explicitly uncertain",()=>{
 const e=event("a","buy",null,"100","1",1);delete e.payload.actor_address;
 const r=analyzeMarketQuality({events:[e]});assert.equal(r.coverage_attestation,"UNKNOWN");
 assert.ok(r.alerts.some(a=>a.alert_type==="ATTRIBUTION_UNCERTAINTY"));
});
