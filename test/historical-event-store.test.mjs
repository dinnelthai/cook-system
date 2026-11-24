import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,rm,writeFile,readdir} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {buildHistoricalEventBatch,verifyHistoricalEventBatch,createHistoricalEventStore} from "../src/core/historical-event-store.mjs";
const scope={chain_id:"solana",network:"synthetic",genesis_hash:"fixture",token_mint:"token",quote_mint:"SOL",provenance:"synthetic",interval_id:"closed-test"};
const event=(i)=>({schema_version:"1.0.0",event_id:"event-"+i,event_kind:"CURVE_BUY_EXECUTED",provenance:"synthetic",market:{chain_id:"solana",network:"synthetic",token_mint:"token",quote_mint:"SOL"},event_time_ms:i,ordering:{ordering_confidence:"synthetic",event_sequence:i},source:{source_id:"fixture",source_type:"simulator"},payload:{quote_amount_base_units:"100"},quality:{is_complete:true,validation_status:"valid"},synthetic_metadata:{scenario_id:"test"}});
test("canonical historical batch has stable identity across order and identical duplicates",()=>{
 const a=buildHistoricalEventBatch({scope,events:[event(2),event(1),event(1)]}),b=buildHistoricalEventBatch({scope,events:[event(1),event(2)]});
 assert.equal(a.batch_id,b.batch_id);assert.deepEqual(a.events.map(e=>e.event_id),["event-1","event-2"]);
 assert.equal(a.source_attestation,"UNKNOWN");assert.equal(a.history_complete,false);assert.equal(a.execution_enabled,false);
 assert.deepEqual(verifyHistoricalEventBatch(a),a);
});
test("rejects conflicting duplicates, mixed scope, mixed scenarios and tampering",()=>{
 const a=event(1),b=event(1);b.payload.quote_amount_base_units="999";
 assert.throws(()=>buildHistoricalEventBatch({scope,events:[a,b]}),/Conflicting duplicate/);
 const c=event(2);c.market.token_mint="other";assert.throws(()=>buildHistoricalEventBatch({scope,events:[a,c]}),/scope mismatch/);
 const d=event(2);d.synthetic_metadata.scenario_id="other";assert.throws(()=>buildHistoricalEventBatch({scope,events:[a,d]}),/mixed synthetic/);
 const batch=buildHistoricalEventBatch({scope,events:[a]});batch.history_complete=true;assert.throws(()=>verifyHistoricalEventBatch(batch),/integrity mismatch/);
});
test("quality warnings and empty batches cannot attest coverage",()=>{
 const e=event(1);e.quality.validation_status="warning";
 assert.deepEqual(buildHistoricalEventBatch({scope,events:[e]}).issues,["EVENT_QUALITY_REVIEW"]);
 assert.deepEqual(buildHistoricalEventBatch({scope,events:[]}).issues,["EMPTY_BATCH"]);
});
test("atomic store is idempotent across concurrent writers, survives reopening, detects corruption",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"cook-history-"));
 try{
 const s=createHistoricalEventStore(dir),input={scope,events:[event(1)]};
 const [a,b]=await Promise.all([s.put(input),s.put(input)]);
 assert.equal(a.batch_id,b.batch_id);
 assert.deepEqual(await readdir(dir),[a.batch_id+".json"]);
 assert.deepEqual(await createHistoricalEventStore(dir).get(a.batch_id),a);
 await assert.rejects(()=>s.get("../bad"),/invalid batch id/);
 await writeFile(join(dir,a.batch_id+".json"),JSON.stringify({...a,history_complete:true}));
 await assert.rejects(()=>s.get(a.batch_id),/integrity mismatch/);
 await assert.rejects(()=>s.put(input),/integrity mismatch/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
