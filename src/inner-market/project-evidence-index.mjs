import {auditDeclaredHistoricalIntervals} from "../core/declared-historical-intervals.mjs";
import {archiveApplicable,evidenceApplicable} from "./project-evidence-scope.mjs";
const hex=v=>typeof v==="string"&&/^[a-f0-9]{64}$/.test(v);
const reviewKinds=["TREASURY_REVIEW","MARKET_EVIDENCE_REVIEW","PROJECT_CLOSE_REVIEW"];
const terminal=new Set(["REPORTED_SUCCESS","REPORTED_FAILURE"]);
/** Shared evidence facts consumed by risk and business review. */
export function indexProjectEvidence(p,archives,orders){
 const scoped=archives.filter(a=>archiveApplicable(p,a)),allOrders=orders.filter(o=>o.project_id===p.project_id);
 const findings=[],unknown=[];
 const add=(code,reference)=>findings.push({code,reference});
 const links=new Map(),linkScopes=new Map();
 for(const a of scoped.filter(x=>x.kind==="HISTORICAL_REPORT_LINK")){
  const v=a.payload,s=v.scope;
  if(v.status!=="DECLARED_MATCH"||!hex(v.report_digest)||!s||s.projectId!==p.project_id||!p.token.mint||s.tokenMint!==p.token.mint||
    !p.network.genesis_hash||s.genesisHash!==p.network.genesis_hash||s.quoteAsset!=="SOL_LAMPORTS"||
    !(p.network.cluster==="localnet"?["localnet","local_sim"].includes(s.network):s.network===p.network.cluster)||
    typeof s.openingCutoff!=="string"||!s.openingCutoff||typeof s.closingCutoff!=="string"||!s.closingCutoff||s.openingCutoff===s.closingCutoff){
   add("REPORT_LINK_SCOPE_CONFLICT",a.archive_id);continue;
  }
  if(links.has(a.archive_id)){add("DUPLICATE_REPORT_LINK_ARCHIVE_ID",a.archive_id);continue;}
  links.set(a.archive_id,{archive_id:a.archive_id,report_digest:v.report_digest,opening_cutoff:s.openingCutoff,closing_cutoff:s.closingCutoff,reviews:[]});
  linkScopes.set(a.archive_id,s);
 }
 for(const a of scoped.filter(x=>reviewKinds.includes(x.kind)||x.kind==="ORDER_RECEIPT_REVIEW")){
  const v=a.payload,link=links.get(a.kind==="ORDER_RECEIPT_REVIEW"?v.archive_id:v.report_link_archive_id);
  if(!link){add("REVIEW_REPORT_LINK_CONFLICT",a.archive_id);continue;}
  if(v.report_digest==null&&a.kind==="ORDER_RECEIPT_REVIEW"&&["UNKNOWN","PARTIAL","REVIEW_REQUIRED"].includes(v.status)){
   unknown.push({code:"LEGACY_RECEIPT_REPORT_DIGEST_UNAVAILABLE",reference:a.archive_id});
   if(v.status==="REVIEW_REQUIRED"||v.rpc_observation?.status==="REVIEW_REQUIRED")add("LINKED_REVIEW_CONFLICT",a.archive_id);
   continue;
  }
  if(v.report_digest!==link.report_digest){
   add("REVIEW_REPORT_LINK_CONFLICT",a.archive_id);
   add("INTERVAL_REPORT_DIGEST_CONFLICT",link.archive_id);continue;
  }
  if(a.kind==="PROJECT_CLOSE_REVIEW"&&["STALE","UNKNOWN_LEGACY"].includes(a.evidence_snapshot_status)){
   unknown.push({code:"CLOSE_EVIDENCE_SNAPSHOT_OUTDATED_OR_UNKNOWN",reference:a.archive_id});continue;
  }
  link.reviews.push({kind:a.kind,archive_id:a.archive_id,status:v.status});
  if(v.status==="REVIEW_REQUIRED"||v.rpc_observation?.status==="REVIEW_REQUIRED")add("LINKED_REVIEW_CONFLICT",a.archive_id);
 }
 const intervals=[...links.values()].map(l=>({...l,reviews:l.reviews.sort((a,b)=>a.archive_id.localeCompare(b.archive_id,"en"))}));
 const scopeDigests=new Map();
 for(const l of intervals){
  const key=JSON.stringify([l.opening_cutoff,l.closing_cutoff]);
  if(!scopeDigests.has(key))scopeDigests.set(key,new Set());
  scopeDigests.get(key).add(l.report_digest);
 }
 // Pin conflicts to every implicated interval, not only to project-wide risk.
 for(const l of intervals){
  const key=JSON.stringify([l.opening_cutoff,l.closing_cutoff]);
  if(scopeDigests.get(key).size>1)add("MULTIPLE_REPORT_DIGESTS_FOR_INTERVAL",l.archive_id);
 }
 // Reuse the canonical slot interval audit. An overlap is not itself
 // inconsistent accounting; overlapping reports must remain independent.
 const coverage=auditDeclaredHistoricalIntervals(intervals.map(l=>linkScopes.get(l.archive_id)),{limit:256});
 const overlapped=new Set();
 for(const pair of coverage.pairs)if(pair.status==="OVERLAP"){
  overlapped.add(pair.left_index);overlapped.add(pair.right_index);
 }
 for(const i of overlapped)unknown.push({code:"HISTORICAL_INTERVAL_OVERLAP_NOT_ADDITIVE",reference:intervals[i].archive_id});
 for(const i of coverage.unknown_indices)unknown.push({code:"HISTORICAL_INTERVAL_ORDER_UNVERIFIED",reference:intervals[i].archive_id});
 for(const issue of coverage.issues)add("HISTORICAL_INTERVAL_ORDER_CONFLICT",intervals[issue.index].archive_id);
 // A single immutable digest cannot encode two different declared boundaries.
 const byDigest=new Map();
 for(const l of intervals){
  if(!byDigest.has(l.report_digest))byDigest.set(l.report_digest,[]);
  byDigest.get(l.report_digest).push(l);
 }
 for(const rows of byDigest.values())if(rows.length>1){
  const boundaries=new Set(rows.map(l=>JSON.stringify([l.opening_cutoff,l.closing_cutoff])));
  for(const l of rows){
   if(boundaries.size>1)add("REPORT_DIGEST_BOUNDARY_CONFLICT",l.archive_id);
   else unknown.push({code:"DUPLICATE_REPORT_LINK_NOT_ADDITIVE",reference:l.archive_id});
  }
 }
 const receipts=allOrders.map(o=>{
  const stale=!evidenceApplicable(p,o);
  const matches=scoped.filter(a=>a.kind==="ORDER_RECEIPT_REVIEW"&&a.payload.order_id===o.order_id&&a.payload.order_revision===o.revision&&a.payload.order_head_hash===o.head_hash&&a.payload.signature===o.signature);
  const conflict=o.status==="REVIEW_REQUIRED"||matches.some(a=>a.payload.status==="REVIEW_REQUIRED"||a.payload.rpc_observation?.status==="REVIEW_REQUIRED");
  const linked=matches.filter(a=>links.get(a.payload.archive_id)?.report_digest===a.payload.report_digest&&hex(a.payload.report_digest));
  const status=conflict?"REVIEW_REQUIRED":stale?"STALE":!terminal.has(o.status)?"UNRESOLVED":
    linked.some(a=>a.payload.status==="INTERNAL_MATCH"&&a.payload.rpc_observation?.status==="DECLARED_SAMPLE_MATCH")?"DECLARED_SAMPLE_MATCH":"EVIDENCE_INCOMPLETE";
  if(conflict)add("ORDER_REVIEW_CONFLICT",o.order_id);
  return {order_id:o.order_id,recorded_status:o.status,project_revision:o.project_revision,order_revision:o.revision,stale,status,receipt_review_count:matches.length};
 });

 return {findings,unknown,intervals,receipts};
}
