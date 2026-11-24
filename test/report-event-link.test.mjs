import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {mkdtemp,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createHistoricalEventStore} from "../src/core/historical-event-store.mjs";
import {archiveReportEventLink,verifyReportEventLink} from "../src/inner-market/report-event-link.mjs";
const fixture=()=>JSON.parse(readFileSync(new URL("../fixtures/synthetic/inner-market-mvp.json",import.meta.url),"utf8"));
function withEvidence(){
 const input=fixture();
 const market={chain_id:"solana",network:"synthetic",token_mint:input.scope.tokenMint,quote_mint:"synthetic-quote",curve_program_id:"synthetic-curve",market_phase:"bonding_curve"};
 input.market.candleEvidence={
  schema_version:"terminal-candle-evidence.1",scope:input.scope,market,complete:true,startTimeMs:0,endTimeMs:180000,
  events:input.market.trades.map((t,i)=>({schema_version:"1.0.0",event_id:t.id,provenance:"synthetic",event_kind:t.side==="BUY"?"CURVE_BUY_EXECUTED":"CURVE_SELL_EXECUTED",market,event_time_ms:60000+i*60000,ordering:{event_sequence:i,ordering_confidence:"synthetic"},source:{source_type:"simulator",source_id:"fixture"},payload:{signature:"synthetic-"+i,actor_address:"synthetic-wallet",token_amount_base_units:i?"50":"100",quote_amount_base_units:t.quoteNotionalBaseUnits,quote_mint:market.quote_mint,execution_price_decimal:i?"1.8":"2",fee_components:[]},quality:{is_complete:true,validation_status:"valid"},synthetic_metadata:{scenario_id:"candle-test",random_seed:0,generator_version:"test.1"}}))
 };
 return input;
}

const bytes=i=>Buffer.from(JSON.stringify(i));
async function withStore(fn){const dir=await mkdtemp(join(tmpdir(),"cook-link-"));try{await fn(createHistoricalEventStore(dir),dir);}finally{await rm(dir,{recursive:true,force:true});}}
test("links exact report bytes to an immutable archive, with no attestation",async()=>{
 await withStore(async(store)=>{
  const raw=bytes(withEvidence()),m=await archiveReportEventLink(raw,store);
  assert.equal(m.event_count,2);assert.equal(m.source_mode,"SYNTHETIC");assert.equal(m.settlement_allowed,false);
  assert.deepEqual(await archiveReportEventLink(raw,store),m);
  const v=await verifyReportEventLink(raw,m,store);assert.equal(v.status,"INTEGRITY_MATCH");assert.equal(v.source_attestation,"UNKNOWN");
  await assert.rejects(()=>verifyReportEventLink(Buffer.concat([raw,Buffer.from("\n")]),m,store),/MANIFEST_MISMATCH/);
  await assert.rejects(()=>verifyReportEventLink(raw,{...m,source_attestation:"PASS"},store),/MANIFEST_MISMATCH/);
 });
});
test("missing or corrupted stored event batch cannot verify",async()=>{
 await withStore(async(store,dir)=>{
  const raw=bytes(withEvidence()),m=await archiveReportEventLink(raw,store);
  await writeFile(join(dir,m.event_batch_id+".json"),"{}");
  await assert.rejects(()=>verifyReportEventLink(raw,m,store));
  await rm(join(dir,m.event_batch_id+".json"));await assert.rejects(()=>verifyReportEventLink(raw,m,store));
 });
});
test("missing candle evidence or inconsistent report refuses archival association",async()=>{
 await withStore(async(store)=>{
  await assert.rejects(()=>archiveReportEventLink(bytes(fixture()),store),/CANDLE_EVIDENCE_REQUIRED/);
  const i=withEvidence();i.market.candleEvidence.events[0].payload.quote_amount_base_units="999";
  await assert.rejects(()=>archiveReportEventLink(bytes(i),store),/REPORT_REVIEW_REQUIRED/);
  const j=withEvidence();j.cash.historyComplete=false;
  await assert.rejects(()=>archiveReportEventLink(bytes(j),store),/REPORT_REVIEW_REQUIRED/);
 });
});
test("historical association requires localnet scope and in-range observed slots",async()=>{
 await withStore(async(store)=>{
  const i=withEvidence();i.sourceMode="ARCHIVED_HISTORICAL";
  const e=i.market.candleEvidence;e.market.network="local_sim";e.market.quote_mint="So11111111111111111111111111111111111111112";
  for(const [idx,x] of e.events.entries()){x.provenance="observed_chain";x.payload.quote_mint=e.market.quote_mint;delete x.synthetic_metadata;x.ordering={slot:11+idx,transaction_index:0,instruction_index:0,event_sequence:0,ordering_confidence:"complete"};}
  await assert.rejects(()=>archiveReportEventLink(bytes(i),store),/LOCALNET_EVIDENCE_SCOPE_REQUIRED/);
  for(const s of [i.scope,i.cash.scope,i.inventory.scope,i.inventory.opening.scope,i.inventory.closing.scope,i.inventory.tradeSummary.scope,i.creator.scope,i.nav.scope,i.market.scope,e.scope,...i.cash.entries,...i.creator.entries])Object.assign(s,{openingCutoff:"slot:10",closingCutoff:"slot:20",network:"localnet",genesisHash:"test-fixture"});
  const raw=bytes(i),m=await archiveReportEventLink(raw,store);assert.equal(m.source_mode,"ARCHIVED_HISTORICAL");assert.equal((await verifyReportEventLink(raw,m,store)).status,"INTEGRITY_MATCH");
  e.events[1].ordering.slot=21;await assert.rejects(()=>archiveReportEventLink(bytes(i),store),/EVENT_OUTSIDE_REPORT_INTERVAL/);
 });
});
