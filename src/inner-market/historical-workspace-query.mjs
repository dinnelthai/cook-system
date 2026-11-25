import {restoreHistoricalWorkspace,listHistoricalProjects} from "./historical-project-workspace.mjs";
import {reviewHistoricalWorkspaceEvidence} from "./historical-workspace-evidence.mjs";
const key=v=>typeof v==="string"&&v.length>0&&v.length<=16384;
const uint=v=>Number.isSafeInteger(v)&&v>=0;
const kinds=["projects","project","record","events"];
/** Queries are pinned to immutable saved revisions. Never accept caller-provided
 * report results, live data, or infer economic ownership across reports. */
export function validateHistoricalWorkspaceQuery(q){
 if(!q||typeof q!=="object"||Array.isArray(q)||!kinds.includes(q.kind)||!uint(q.revision))throw Error("INVALID_WORKSPACE_QUERY");
 const allowed=["kind","revision",...(q.kind==="projects"?[]:["projectKey"]),...(["record","events"].includes(q.kind)?["recordKey"]:[]),...(q.kind==="events"?["offset","limit"]:[])];
 if(Object.keys(q).some(k=>!allowed.includes(k))||q.kind!=="projects"&&!key(q.projectKey)||["record","events"].includes(q.kind)&&!key(q.recordKey))throw Error("INVALID_WORKSPACE_QUERY");
 if(q.kind==="events"&&(!uint(q.offset??0)||!uint(q.limit??50)||(q.limit??50)<1||(q.limit??50)>100))throw Error("INVALID_WORKSPACE_QUERY");
 return q;
}
export function queryHistoricalWorkspace(store,query){
 const q=validateHistoricalWorkspaceQuery(query),snapshot=store.load(q.revision);
 const c=restoreHistoricalWorkspace(snapshot.workspace),projects=listHistoricalProjects(c);
 const base={schema_version:"cook-historical-workspace-query.1",revision:snapshot.revision,digest:snapshot.digest,kind:q.kind,source_attestation:"UNKNOWN",history_complete_attested:false,settlement_allowed:false,execution_enabled:false};
 if(q.kind==="projects")return {...base,projects};
 const project=projects.find(p=>p.key===q.projectKey);
 if(!project)throw Error("WORKSPACE_PROJECT_NOT_FOUND");
 if(q.kind==="project")return {...base,project,records:c.list().filter(r=>project.record_keys.includes(r.key))};
 if(!project.record_keys.includes(q.recordKey))throw Error("WORKSPACE_RECORD_NOT_FOUND");
 if(q.kind==="record"){
  const {report}=c.get(q.recordKey),state=report.terminal_state;
  return {...base,project_key:project.key,record_key:q.recordKey,scope:report.scope,status:report.status,issues:report.issues,trust:report.trust,accounting:report.accounting,treasury:state.treasury,performance:state.performance,market_history:report.market_history,market_state:report.market_state,checks:state.checks,risk:state.risk,candle_evidence:{status:state.candles.status,reason:state.candles.reason},receipt_evidence_status:state.archived_evidence.status};
 }
 const index=reviewHistoricalWorkspaceEvidence(snapshot.workspace),record=index.records.find(r=>r.record_key===q.recordKey&&r.project_key===project.key);
 if(!record)throw Error("WORKSPACE_RECORD_NOT_FOUND");
 const {events,...summary}=record,offset=q.offset??0,limit=q.limit??50,rows=events.slice(offset,offset+limit);
 return {...base,record:summary,workspace_archive_status:index.archive_audit.status,offset,limit,events:rows,next_offset:offset+rows.length<events.length?offset+rows.length:null};
}
