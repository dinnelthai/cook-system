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

test("duplicate executions count once and mixed synthetic scenarios are rejected",()=>{
 const a=event("a","buy","wallet-a","100","1",1),b=event("b","sell","wallet-b","90","1.1",2);
 assert.equal(analyzeMarketQuality({events:[a,structuredClone(a),b]}).metrics.trade_count,2);
 b.synthetic_metadata.scenario_id="other";assert.throws(()=>analyzeMarketQuality({events:[a,b]}),/MIXED_OR_MISSING_SYNTHETIC_SCENARIO/);
});
test("unknown attribution and caller supplied authentication do not become verified metrics",()=>{
 const a=event("a","buy","wallet-a","100","1",1),b=event("b","buy"," ","100","1",2);
 const r=analyzeMarketQuality({events:[a,b],sourceAttestation:"VERIFIED",inventoryPositions:[{owner:"a",attribution_status:"verified",token_amount_base_units:"50"},{owner:"b",token_amount_base_units:"50"}]});
 assert.equal(r.source_attestation,"UNKNOWN");assert.equal(r.metrics.buyer_quote_hhi,null);assert.equal(r.metrics.holder_token_hhi,null);
 assert.equal(r.inventory_ownership_attestation,"UNKNOWN");
});
test("closing reserves cannot establish historical depth and duplicate inventory rows are rejected",()=>{
 const a=event("a","buy","wallet-a","100","1",1);
 const r=analyzeMarketQuality({events:[a],marketState:{virtual_quote_reserves_base_units:"1000"}});
 assert.equal(r.metrics.max_trade_to_virtual_quote_depth_bps,null);assert.equal(r.depth_evidence_status,"UNAVAILABLE");
 const p={position_id:"p",owner:"a",attribution_status:"verified",token_amount_base_units:"1"};
 assert.throws(()=>analyzeMarketQuality({events:[a],inventoryPositions:[p,p]}),/DUPLICATE_OR_INVALID_INVENTORY_POSITION/);
});
test("known quality contradiction withholds derived metrics and candles",()=>{
 const a=event("a","buy","wallet-a","100","1",1);a.quality.validation_status="warning";
 const r=analyzeMarketQuality({events:[a]});assert.equal(r.status,"REVIEW_REQUIRED");assert.equal(r.metrics,null);assert.deepEqual(r.candles,[]);
});

test("concentration uses exact aggregate squares, not per-address truncation",()=>{
 const events=[event("a","buy","a","1","1",1),event("b","buy","b","1","1",2),event("c","buy","c","1","1",3)];
 const r=analyzeMarketQuality({events});
 assert.equal(r.metrics.buyer_effective_count,3);
 assert.ok(Math.abs(r.metrics.buyer_quote_hhi-1/3)<1e-14);
 assert.equal(r.numerical_contract.concentration,"INTEGER_SUM_OF_SQUARES_ROUNDED_FOR_DISPLAY");
});
test("extreme historical price ratio does not become an unsafe number",()=>{
 const r=analyzeMarketQuality({events:[event("a","buy","a","1","0.00000000000000000001",1),event("b","buy","b","1","1",2)]});
 assert.equal(r.metrics.price_return_bps,null);
 assert.equal(r.metrics.price_return_exact_bps,((10n**20n-1n)*10000n).toString());
 assert.equal(r.numerical_contract.unsafe_numeric_return_withheld,true);
});
