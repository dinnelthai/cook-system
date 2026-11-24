import {buildHistoricalEventBatch} from "./historical-event-store.mjs";
const plain=v=>v!==null&&typeof v==="object"&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;
const nonempty=v=>typeof v==="string"&&v.length>0&&v.length<=1024&&v.trim()===v;
const issue=(set,code)=>{if(!set.includes(code))set.push(code);};

/**
 * Check an explicitly supplied provider pagination manifest against a closed
 * event set. This proves internal cursor/page consistency only; it cannot
 * authenticate the provider or prove the provider returned all chain events.
 */
export function auditHistoricalCoverage({scope,scan,events}){
 const batch=buildHistoricalEventBatch({scope,events});
 if(!plain(scan)||scan.schema_version!=="cook-history-scan.1"||
    !nonempty(scan.scan_id)||!nonempty(scan.source_id)||!nonempty(scan.source_type)||
    !["ASC","DESC"].includes(scan.direction)||!plain(scan.requested_range)||
    !Array.isArray(scan.pages)||scan.pages.length>10000)throw Error("INVALID_COVERAGE_SCAN");
 const range=scan.requested_range,unit=range.unit;
 if(!["slot","event_time_ms"].includes(unit)||!Number.isSafeInteger(range.start)||range.start<0||
    !Number.isSafeInteger(range.end)||range.end<range.start||
    (scope.provenance==="observed_chain")!==(unit==="slot"))throw Error("INVALID_COVERAGE_RANGE");
 const byId=new Map(batch.events.map(e=>[e.event_id,e]));
 const ordered=batch.events;
 const rank=new Map(ordered.map((e,i)=>[e.event_id,i]));
 const issues=[],seen=new Set();
 let occurrences=0,previousRank=null,previousCursor=null,previousHasMore=true;
 const pages=scan.pages;
 for(let i=0;i<pages.length;i++){
  const p=pages[i];
  if(!plain(p)||p.page_index!==i||typeof p.has_more!=="boolean"||
     !Array.isArray(p.event_ids)||p.event_ids.length>10000||
     !(p.cursor_in===null||nonempty(p.cursor_in))||
     !(p.cursor_out===null||nonempty(p.cursor_out)))throw Error("INVALID_COVERAGE_PAGE");
  if(i===0&&p.cursor_in!==null)issue(issues,"COVERAGE_INITIAL_CURSOR_MISMATCH");
  if(i>0&&(!previousHasMore||p.cursor_in!==previousCursor))issue(issues,"COVERAGE_CURSOR_CHAIN_MISMATCH");
  if(p.has_more&&(!p.cursor_out||p.cursor_out===p.cursor_in))issue(issues,"COVERAGE_CURSOR_DID_NOT_ADVANCE");
  if(!p.has_more&&p.cursor_out!==null)issue(issues,"COVERAGE_TERMINAL_CURSOR_NOT_NULL");
  if(p.has_more&&p.event_ids.length===0)issue(issues,"COVERAGE_EMPTY_NONTERMINAL_PAGE");
  for(const id of p.event_ids){
   occurrences++;
   if(!nonempty(id))throw Error("INVALID_COVERAGE_EVENT_ID");
   const e=byId.get(id);
   if(!e){issue(issues,"COVERAGE_UNKNOWN_EVENT_ID");continue;}
   if(seen.has(id)){issue(issues,"COVERAGE_DUPLICATE_EVENT_ID");continue;}
   seen.add(id);
   if(e.source.source_id!==scan.source_id||e.source.source_type!==scan.source_type)issue(issues,"COVERAGE_SOURCE_MISMATCH");
   const position=unit==="slot"?e.ordering.slot:e.event_time_ms;
   if(position<range.start||position>range.end)issue(issues,"COVERAGE_EVENT_OUTSIDE_RANGE");
   const current=rank.get(id);
   if(previousRank!==null&&(scan.direction==="ASC"?current<=previousRank:current>=previousRank))issue(issues,"COVERAGE_EVENT_ORDER_MISMATCH");
   previousRank=current;
  }
  previousCursor=p.cursor_out;previousHasMore=p.has_more;
 }
 for(const id of byId.keys())if(!seen.has(id))issue(issues,"COVERAGE_EVENT_UNREFERENCED");
 if(!pages.length)issue(issues,"COVERAGE_PAGES_MISSING");
 const terminal=pages.length>0&&!pages.at(-1).has_more;
 if(pages.length&&!terminal)issue(issues,"COVERAGE_CURSOR_NOT_EXHAUSTED");
 const hard=issues.some(x=>x!=="COVERAGE_CURSOR_NOT_EXHAUSTED"&&x!=="COVERAGE_PAGES_MISSING");
 const status=hard?"REVIEW_REQUIRED":!pages.length||!terminal?"PARTIAL":"PAGINATION_COMPLETE_DECLARED";
 return {schema_version:"cook-historical-coverage-report.1",status,scope,scan_id:scan.scan_id,
  source:{source_id:scan.source_id,source_type:scan.source_type,attestation:"UNKNOWN"},
  requested_range:range,direction:scan.direction,page_count:pages.length,
  event_occurrence_count:occurrences,referenced_event_count:seen.size,
  unreferenced_event_count:byId.size-seen.size,cursor_exhausted_declared:terminal,
  issues,coverage_attestation:"UNKNOWN",history_complete_attested:false,
  note:"Pagination consistency is not independent proof of provider completeness or chain finality."};
}
