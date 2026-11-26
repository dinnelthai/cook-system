// Local, bounded diagnostics. Never store raw input, exception messages, URLs or wallet data.
const EVENTS=new Set(["app.start","fixture.loaded","fixture.failed","report.built","report.failed","page.open","report.import.started","report.import.failed","report.import.completed","sample.reset","sample.incomplete","experiment.started","experiment.completed","experiment.failed","file.export","log.export","log.cleared","runtime.error","runtime.rejection","metadata.saved","project.context.selected","project.aggregate.saved","project.aggregate.opened","project.issuance_evidence.recorded","review.settled","review.archived","review.restored","review.reset"]);
const PAGES=new Set(["dashboard","create","wallet","lab","market","profit","participants","logs","terminal","history","projects","inventory","liquidity"]);
const MODES=new Set(["SYNTHETIC","ARCHIVED_HISTORICAL"]);
const STATUSES=new Set(["REPORT_READY","REVIEW_REQUIRED"]);
const ERRORS=new Set(["Error","TypeError","RangeError","SyntaxError","ReferenceError","AbortError","NetworkError","UnknownError"]);
const ISSUE_CODES=new Set(["CLOSING_ACCOUNT_SET_CONTRADICTION","ACCOUNT_SET_TOTAL_MISMATCH","ACCOUNT_RECONCILIATION_CONTRADICTION","ACCOUNT_SCOPE_MISMATCH","DUPLICATE_ACCOUNT","UNEXPECTED_ACCOUNT","ACCOUNT_COST_WITHOUT_INVENTORY","ACCOUNT_VALUE_WITHOUT_INVENTORY","CASH_TRADE_AUDIT_FAILED","CREATOR_FEE_AUDIT_FAILED","INVENTORY_ADJUSTMENT_AUDIT_FAILED","HISTORICAL_NAV_INCOMPLETE","NAV_CASH_CAPITAL_FLOW_MISMATCH","PROJECT_TRADE_MARKET_EVENT_MISSING","PROJECT_TRADE_SIDE_MISMATCH","PROJECT_TRADE_MARKET_UNVERIFIED","PROJECT_TRADE_DUPLICATE_EVIDENCE","PROJECT_TRADE_ZERO_QUANTITY","PROJECT_TRADE_NOTIONAL_MISMATCH","PROJECT_TRADE_QUANTITY_MISMATCH","PROJECT_TRADE_SIGNATURE_MISMATCH","TRADE_RECEIPT_CLASSIFICATION_MISMATCH","TRADE_RECEIPT_TOKEN_EVIDENCE_MISSING","TRADE_RECEIPT_TOKEN_DELTA_MISMATCH","COST_BASIS_WITHOUT_OPENING_INVENTORY","COST_BASIS_WITHOUT_CLOSING_INVENTORY","COST_BASIS_NEGATIVE_INTERMEDIATE_INVENTORY","COST_BASIS_NEGATIVE_INTERMEDIATE_BASIS","COST_BASIS_RESIDUAL_WITHOUT_INVENTORY","COST_BASIS_REPLAY_ENDPOINT_MISMATCH","CANDLE_EVIDENCE_CONTRADICTION","NAV_ENDPOINT_FIELDS_MISSING","NAV_ENDPOINT_POSITION_MISMATCH","NAV_ENDPOINT_LEDGER_MISSING","NAV_ENDPOINT_CASH_MISMATCH","NAV_ENDPOINT_TOKEN_MISMATCH","NAV_ENDPOINT_RECEIVABLE_MISMATCH","NAV_ENDPOINT_VALUE_WITHOUT_INVENTORY","NAV_ENDPOINT_IDENTITY_MISMATCH","NAV_ENDPOINT_INTERVAL_MISSING","INVENTORY_LEDGER_CLOSING_MISMATCH","ACQUISITION_COST_MISMATCH","REALIZED_PNL_MISMATCH","INVENTORY_TRADE_SUMMARY_MISMATCH","UNVERIFIED_MARKET_TRADE","MARKET_HISTORY_OR_SNAPSHOT_INCOMPLETE","OUTSIDE_INNER_MARKET","REAL_RESERVE_UNKNOWN","MISSING_CURVE_FIELD","RECEIPT_CASH_REVIEW","REPORT_OPENING_CASH_MISMATCH","REPORT_CLOSING_CASH_MISMATCH","REPORT_OPENING_TOKEN_MISMATCH","REPORT_CLOSING_TOKEN_MISMATCH","AMBIGUOUS_CREATOR_RECEIPT_TRANSACTION","CASH_POSTING_ORDER_INVALID","NEGATIVE_INTERMEDIATE_CASH","MIXED_CANDLE_NETWORK_INSTANCE","INVALID_CANDLE_GENESIS","PORTFOLIO_VALUATION_SCOPE_MISMATCH","PORTFOLIO_VALUATION_SCOPE_UNVERIFIED","DAILY_LOSS_UNKNOWN","PORTFOLIO_REQUEST_TIMEOUT","PORTFOLIO_DEADLINE","HALT_STATE_STALE_OR_UNVERIFIED","HALT_STATE_LOCK_TIMEOUT","ALERT_STORE_LOCK_TIMEOUT","VALIDATION_SUBCHECK_MANIFEST_MISMATCH","RECEIPT_COORDINATES_INVALID","RECEIPT_COORDINATES_MISMATCH"]);
const numeric=["duration_ms","file_bytes","issue_count","buy_count","sell_count","trial_count","match_count","seed","runs","critical_count","warning_count","unknown_count"];
export function errorKind(error){return ERRORS.has(error?.name)?error.name:"UnknownError"}
export function createDiagnosticLog({limit=1000,clock=()=>new Date(),storage=null,storageKey="cook-diagnostics.v1"}={}){
 if(!Number.isSafeInteger(limit)||limit<1||limit>10000)throw new RangeError("invalid log limit");
 let entries=[],seq=0,dropped=0;
 let started=clock().toISOString(),persistence=storage?"AVAILABLE":"MEMORY_ONLY";
 const validTime=v=>typeof v==="string"&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v)&&Number.isFinite(Date.parse(v));
 function sanitize(detail={}){
  if(!detail||typeof detail!=="object")detail={};
  const d={};
  for(const k of numeric)if(Number.isSafeInteger(detail[k])&&detail[k]>=0)d[k]=detail[k];
  if(PAGES.has(detail.page))d.page=detail.page;
  if(MODES.has(detail.source_mode))d.source_mode=detail.source_mode;
  if(STATUSES.has(detail.status))d.status=detail.status;
  if(ERRORS.has(detail.error_kind))d.error_kind=detail.error_kind;
  if(Array.isArray(detail.issues))d.issues=[...new Set(detail.issues.slice(0,100).map(x=>typeof x==="string"?x.split(":")[0]:typeof x?.code==="string"?x.code.split(":")[0]:"").map(x=>ISSUE_CODES.has(x)?x:"OTHER_ISSUE"))];
  return d;
 }
 function persist(){if(!storage)return;try{storage.setItem(storageKey,JSON.stringify({schema_version:"cook-diagnostic-storage.1",started,seq,dropped,entries}));persistence="AVAILABLE";}catch{persistence="UNAVAILABLE";}}
 if(storage){try{
  const raw=storage.getItem(storageKey);
  if(raw!==null){
   if(typeof raw!=="string"||raw.length>8*1024*1024)throw Error("invalid stored diagnostics");
   const saved=JSON.parse(raw);
   if(saved.schema_version!=="cook-diagnostic-storage.1"||!validTime(saved.started)||!Number.isSafeInteger(saved.seq)||saved.seq<0||!Number.isSafeInteger(saved.dropped)||saved.dropped<0||!Array.isArray(saved.entries)||saved.entries.length>10000)throw Error("invalid stored diagnostics");
   let last=0;const restored=saved.entries.map(r=>{if(!r||!Number.isSafeInteger(r.seq)||r.seq<=last||r.seq>saved.seq||!validTime(r.time)||!EVENTS.has(r.event)||!["INFO","WARN","ERROR"].includes(r.level))throw Error("invalid stored diagnostic row");last=r.seq;return {seq:r.seq,time:r.time,level:r.level,event:r.event,detail:sanitize(r.detail)};});
   started=saved.started;seq=saved.seq;dropped=saved.dropped+Math.max(0,restored.length-limit);entries=restored.slice(-limit);persist();
  }
 }catch{persistence="UNAVAILABLE";}}
 function record(event,detail={},level="INFO"){
  if(!EVENTS.has(event)||!["INFO","WARN","ERROR"].includes(level))throw new TypeError("unknown diagnostic event or level");
  const row={seq:++seq,time:clock().toISOString(),level,event,detail:sanitize(detail)};
  entries.push(row);if(entries.length>limit){entries.shift();dropped++;}persist();
 }
 function snapshot(){return {schema_version:"cook-diagnostics.1",app:"cook-system",mode:"OFFLINE",session_started_at:started,exported_at:clock().toISOString(),dropped_count:dropped,persistence_status:persistence,entries:structuredClone(entries)}}
 function clear(){entries=[];dropped=0;record("log.cleared")}
 return {record,snapshot,clear};
}

/** Revalidate an exported diagnostic snapshot at the offline archive boundary.
 * Only the existing diagnostic allowlist is retained. */
export function sanitizeDiagnosticSnapshot(snapshot){
 if(!snapshot||snapshot.schema_version!=="cook-diagnostics.1"||snapshot.app!=="cook-system"||snapshot.mode!=="OFFLINE"||!Array.isArray(snapshot.entries)||snapshot.entries.length>10000||!Number.isSafeInteger(snapshot.dropped_count)||snapshot.dropped_count<0)throw Error("INVALID_DIAGNOSTIC_SNAPSHOT");
 const time=v=>typeof v==="string"&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v)&&Number.isFinite(Date.parse(v));
 if(!time(snapshot.session_started_at)||!time(snapshot.exported_at))throw Error("INVALID_DIAGNOSTIC_TIME");
 let previous=0;
 for(const r of snapshot.entries){
  if(!r||!Number.isSafeInteger(r.seq)||r.seq<=previous||!time(r.time)||!EVENTS.has(r.event)||!["INFO","WARN","ERROR"].includes(r.level))throw Error("INVALID_DIAGNOSTIC_ROW");
  previous=r.seq;
 }
 const saved=JSON.stringify({schema_version:"cook-diagnostic-storage.1",started:snapshot.session_started_at,seq:previous,dropped:snapshot.dropped_count,entries:snapshot.entries});
 if(saved.length>8*1024*1024)throw Error("DIAGNOSTIC_SNAPSHOT_LIMIT");
 const log=createDiagnosticLog({limit:10000,clock:()=>new Date(snapshot.exported_at),storage:{getItem:()=>saved,setItem:()=>{}}});
 const restored=log.snapshot();
 if(restored.persistence_status!=="AVAILABLE"||restored.entries.length!==snapshot.entries.length)throw Error("DIAGNOSTIC_RESTORE_FAILED");
 return {...restored,persistence_status:"OFFLINE_ARCHIVE"};
}
