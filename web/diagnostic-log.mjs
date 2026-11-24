// Local, bounded diagnostics. Never store raw input, exception messages, URLs or wallet data.
const EVENTS=new Set(["app.start","fixture.loaded","fixture.failed","report.built","report.failed","page.open","report.import.started","report.import.failed","report.import.completed","sample.reset","sample.incomplete","experiment.started","experiment.completed","experiment.failed","file.export","log.export","log.cleared","runtime.error","runtime.rejection"]);
const PAGES=new Set(["dashboard","create","wallet","lab","market","profit","participants","logs"]);
const MODES=new Set(["SYNTHETIC","ARCHIVED_HISTORICAL"]);
const STATUSES=new Set(["REPORT_READY","REVIEW_REQUIRED"]);
const ERRORS=new Set(["Error","TypeError","RangeError","SyntaxError","ReferenceError","AbortError","NetworkError","UnknownError"]);
const ISSUE_CODES=new Set(["CASH_TRADE_AUDIT_FAILED","CREATOR_FEE_AUDIT_FAILED","INVENTORY_ADJUSTMENT_AUDIT_FAILED","HISTORICAL_NAV_INCOMPLETE","INVENTORY_LEDGER_CLOSING_MISMATCH","ACQUISITION_COST_MISMATCH","REALIZED_PNL_MISMATCH","INVENTORY_TRADE_SUMMARY_MISMATCH","UNVERIFIED_MARKET_TRADE","MARKET_HISTORY_OR_SNAPSHOT_INCOMPLETE","OUTSIDE_INNER_MARKET","REAL_RESERVE_UNKNOWN","MISSING_CURVE_FIELD"]);
const numeric=["duration_ms","file_bytes","issue_count","buy_count","sell_count","trial_count","match_count","seed","runs"];
export function errorKind(error){return ERRORS.has(error?.name)?error.name:"UnknownError"}
export function createDiagnosticLog({limit=1000,clock=()=>new Date()}={}){
 if(!Number.isSafeInteger(limit)||limit<1||limit>10000)throw new RangeError("invalid log limit");
 let entries=[],seq=0,dropped=0;
 const started=clock().toISOString();
 function record(event,detail={},level="INFO"){
  if(!EVENTS.has(event)||!["INFO","WARN","ERROR"].includes(level))throw new TypeError("unknown diagnostic event or level");
  const d={};
  for(const k of numeric)if(Number.isSafeInteger(detail[k])&&detail[k]>=0)d[k]=detail[k];
  if(PAGES.has(detail.page))d.page=detail.page;
  if(MODES.has(detail.source_mode))d.source_mode=detail.source_mode;
  if(STATUSES.has(detail.status))d.status=detail.status;
  if(ERRORS.has(detail.error_kind))d.error_kind=detail.error_kind;
  if(Array.isArray(detail.issues))d.issues=[...new Set(detail.issues.slice(0,100).map(x=>typeof x==="string"?x.split(":")[0]:"").map(x=>ISSUE_CODES.has(x)?x:"OTHER_ISSUE"))];
  const row={seq:++seq,time:clock().toISOString(),level,event,detail:d};
  entries.push(row);if(entries.length>limit){entries.shift();dropped++;}
 }
 function snapshot(){return {schema_version:"cook-diagnostics.1",app:"cook-system",mode:"OFFLINE",session_started_at:started,exported_at:clock().toISOString(),dropped_count:dropped,entries:structuredClone(entries)}}
 function clear(){entries=[];dropped=0;record("log.cleared")}
 return {record,snapshot,clear};
}
