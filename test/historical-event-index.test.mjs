import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createHistoricalEventStore} from "../src/core/historical-event-store.mjs";
import {rebuildHistoricalEventIndex,loadHistoricalEventIndex,queryHistoricalEventIndex} from "../src/core/historical-event-index.mjs";
const scope={chain_id:"solana",network:"synthetic",genesis_hash:"fixture",token_mint:"token",quote_mint:"SOL",provenance:"synthetic",interval_id:"index-test"};
const event=i=>({schema_version:"1.0.0",event_id:"e"+i,event_kind:"CURVE_BUY_EXECUTED",provenance:"synthetic",market:{chain_id:"solana",network:"synthetic",token_mint:"token",quote_mint:"SOL"},event_time_ms:i,ordering:{ordering_confidence:"synthetic",event_sequence:i},source:{source_type:"simulator",source_id:"fixture"},payload:{quote_amount_base_units:"10"},quality:{is_complete:true,validation_status:"valid"},synthetic_metadata:{scenario_id:"test"}});
test("index rebuilds atomically and queries a deduplicated event view",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"cook-index-"));
 try{const store=createHistoricalEventStore(dir);await store.put({scope,events:[event(1),event(2)]});await store.put({scope:{...scope,interval_id:"next"},events:[event(2),event(3)]});
  const idx=await store.rebuildIndex();assert.equal(idx.batch_count,2);assert.equal(idx.event_occurrence_count,4);assert.equal(idx.duplicate_count,1);assert.equal(idx.unique_event_count,3);
  assert.equal((await loadHistoricalEventIndex(dir)).index_sha256,idx.index_sha256);
  const q=await store.query({event_id:"e2"});assert.equal(q.result_count,1);assert.equal(q.results[0].event.event_id,"e2");
 }finally{await rm(dir,{recursive:true,force:true});}
});
test("index detects stale archive membership and tampered checksum",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"cook-index-stale-"));
 try{const store=createHistoricalEventStore(dir);await store.put({scope,events:[event(1)]});await rebuildHistoricalEventIndex(dir);
  await store.put({scope:{...scope,interval_id:"new"},events:[event(2)]});await assert.rejects(()=>loadHistoricalEventIndex(dir),/HISTORICAL_INDEX_STALE/);
  const idx=await rebuildHistoricalEventIndex(dir);await writeFile(join(dir,"index.json"),JSON.stringify({...idx,unique_event_count:99}));
  await assert.rejects(()=>loadHistoricalEventIndex(dir),/HISTORICAL_INDEX_CHECKSUM_MISMATCH/);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test("index detects tampering of any indexed batch, not only the queried batch",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"cook-index-batch-tamper-"));
 try{
  const store=createHistoricalEventStore(dir);
  await store.put({scope,events:[event(1)]});
  await store.put({scope:{...scope,interval_id:"second"},events:[event(2)]});
  const idx=await store.rebuildIndex(),unqueried=idx.batch_manifest[1].batch_id;
  await writeFile(join(dir,unqueried+".json"),"corrupt");
  await assert.rejects(()=>loadHistoricalEventIndex(dir),/HISTORICAL_INDEX_BATCH_CHECKSUM_MISMATCH/);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test("compound namespace encoding cannot collapse distinct scopes with delimiters",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"cook-index-key-"));
 try{const store=createHistoricalEventStore(dir);
  for(const [genesis_hash,token_mint] of [["a|b","c"],["a","b|c"]]){
   const e=event(1);e.market.token_mint=token_mint;
   await store.put({scope:{...scope,genesis_hash,token_mint},events:[e]});
  }
  const idx=await store.rebuildIndex();assert.equal(idx.unique_event_count,2);
  assert.equal(new Set(idx.entries.map(e=>e.event_key)).size,2);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test("observed events preserve chain order across batches in the same slot",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"cook-index-order-"));
 try{const store=createHistoricalEventStore(dir),s={...scope,network:"local_sim",provenance:"observed_chain"};
  const e=(id,tx,inner,seq)=>{const x=event(1);delete x.synthetic_metadata;x.event_id=id;x.provenance="observed_chain";x.market.network=s.network;x.ordering={slot:100,transaction_index:tx,instruction_index:0,inner_instruction_index:inner,event_sequence:seq,ordering_confidence:"complete"};return x;};
  await store.put({scope:s,events:[e("z",0,null,0),e("b",0,1,0)]});
  await store.put({scope:{...s,interval_id:"later"},events:[e("a",1,null,0),e("y",0,1,1)]});
  await store.rebuildIndex();const q=await store.query({network:"local_sim"},2);
  assert.deepEqual(q.results.map(r=>r.event.event_id),["z","b"]);assert.equal(q.matched_count,4);assert.equal(q.truncated,true);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test("unknown filters, invalid ranges and wrong scenario cannot silently broaden a query",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"cook-index-filter-"));
 try{const store=createHistoricalEventStore(dir);await store.put({scope,events:[event(1)]});await store.rebuildIndex();
  await assert.rejects(()=>store.query({tokenMint:"token"}),/UNKNOWN_INDEX_FILTER/);
  await assert.rejects(()=>store.query({from_time_ms:5,to_time_ms:1}),/INVALID_INDEX_FILTER_RANGE/);
  assert.equal((await store.query({scenario_id:"wrong"})).result_count,0);
 }finally{await rm(dir,{recursive:true,force:true});}
});
