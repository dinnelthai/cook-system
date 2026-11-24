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
  const idx=await rebuildHistoricalEventIndex(dir);assert.equal(idx.batch_count,2);assert.equal(idx.event_occurrence_count,4);assert.equal(idx.duplicate_count,1);assert.equal(idx.unique_event_count,3);
  assert.equal((await loadHistoricalEventIndex(dir)).index_sha256,idx.index_sha256);
  const q=await queryHistoricalEventIndex({directory:dir,filter:{event_id:"e2"}});assert.equal(q.result_count,1);assert.equal(q.results[0].event.event_id,"e2");
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
