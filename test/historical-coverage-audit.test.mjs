import test from "node:test";
import assert from "node:assert/strict";
import {auditHistoricalCoverage} from "../src/core/historical-coverage-audit.mjs";
const scope={chain_id:"solana",network:"synthetic",genesis_hash:"fixture",token_mint:"token",quote_mint:"SOL",provenance:"synthetic",interval_id:"coverage-test"};
const event=i=>({schema_version:"1.0.0",event_id:"event-"+i,event_kind:"CURVE_BUY_EXECUTED",provenance:"synthetic",market:{chain_id:"solana",network:"synthetic",token_mint:"token",quote_mint:"SOL"},event_time_ms:i,ordering:{ordering_confidence:"synthetic",event_sequence:i},source:{source_id:"fixture",source_type:"simulator"},payload:{quote_amount_base_units:"100"},quality:{is_complete:true,validation_status:"valid"},synthetic_metadata:{scenario_id:"coverage"}});
const scan=(pages,extra={})=>({schema_version:"cook-history-scan.1",scan_id:"scan-1",source_id:"fixture",source_type:"simulator",direction:"ASC",requested_range:{unit:"event_time_ms",start:1,end:3},pages,...extra});
test("complete cursor chain covers the supplied event set but does not attest chain completeness",()=>{
 const r=auditHistoricalCoverage({scope,events:[event(1),event(2),event(3)],scan:scan([
  {page_index:0,cursor_in:null,cursor_out:"c1",has_more:true,event_ids:["event-1","event-2"]},
  {page_index:1,cursor_in:"c1",cursor_out:null,has_more:false,event_ids:["event-3"]}
 ])});
 assert.equal(r.status,"PAGINATION_COMPLETE_DECLARED");assert.equal(r.referenced_event_count,3);
 assert.equal(r.unreferenced_event_count,0);assert.equal(r.coverage_attestation,"UNKNOWN");
 assert.equal(r.history_complete_attested,false);
});
test("missing cursor page and cursor mismatch are reported rather than silently treated as complete",()=>{
 const r=auditHistoricalCoverage({scope,events:[event(1),event(2)],scan:scan([
  {page_index:0,cursor_in:null,cursor_out:"c1",has_more:true,event_ids:["event-1"]},
  {page_index:1,cursor_in:"wrong",cursor_out:null,has_more:false,event_ids:["event-2"]}
 ])});
 assert.equal(r.status,"REVIEW_REQUIRED");assert.ok(r.issues.includes("COVERAGE_CURSOR_CHAIN_MISMATCH"));
});
test("unexhausted cursor chain is partial even when all supplied events are referenced",()=>{
 const r=auditHistoricalCoverage({scope,events:[event(1)],scan:scan([
  {page_index:0,cursor_in:null,cursor_out:"c1",has_more:true,event_ids:["event-1"]}
 ])});
 assert.equal(r.status,"PARTIAL");assert.ok(r.issues.includes("COVERAGE_CURSOR_NOT_EXHAUSTED"));
});
test("duplicate, unknown and unreferenced events are explicit coverage failures",()=>{
 const r=auditHistoricalCoverage({scope,events:[event(1),event(2)],scan:scan([
  {page_index:0,cursor_in:null,cursor_out:null,has_more:false,event_ids:["event-1","event-1","unknown"]}
 ])});
 assert.equal(r.status,"REVIEW_REQUIRED");assert.ok(r.issues.includes("COVERAGE_DUPLICATE_EVENT_ID"));
 assert.ok(r.issues.includes("COVERAGE_UNKNOWN_EVENT_ID"));assert.ok(r.issues.includes("COVERAGE_EVENT_UNREFERENCED"));
});
test("events outside requested range or source identity cannot count as covered",()=>{
 const e=event(1);e.source.source_id="different";
 const r=auditHistoricalCoverage({scope,events:[e],scan:scan([
  {page_index:0,cursor_in:null,cursor_out:null,has_more:false,event_ids:["event-1"]}
 ],{requested_range:{unit:"event_time_ms",start:2,end:3}})});
 assert.equal(r.status,"REVIEW_REQUIRED");assert.ok(r.issues.includes("COVERAGE_SOURCE_MISMATCH"));
 assert.ok(r.issues.includes("COVERAGE_EVENT_OUTSIDE_RANGE"));
});
test("out-of-order pages and malformed cursor advancement are rejected",()=>{
 const r=auditHistoricalCoverage({scope,events:[event(1),event(2)],scan:scan([
  {page_index:0,cursor_in:null,cursor_out:"c1",has_more:true,event_ids:["event-2"]},
  {page_index:1,cursor_in:"c1",cursor_out:null,has_more:false,event_ids:["event-1"]}
 ])});
 assert.equal(r.status,"REVIEW_REQUIRED");assert.ok(r.issues.includes("COVERAGE_EVENT_ORDER_MISMATCH"));
});
