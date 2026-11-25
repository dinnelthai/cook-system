const priority={CRITICAL:0,WARNING:1,UNKNOWN:2};
/** One project snapshot, all retrospective risk findings. Deduplicate by code
 * while retaining distinct categories and references. No live risk certification. */
export function consolidateProjectRisk({historical,configuration,findings,unknown,runtime}){
 const merged=new Map();
 function add(code,severity,categories,references=[]){
  if(typeof code!=="string"||!Object.hasOwn(priority,severity))throw Error("INVALID_GLOBAL_RISK_FINDING");
  let row=merged.get(code);
  if(!row){row={code,severity,categories:new Set(),references:new Set()};merged.set(code,row);}
  if(priority[severity]<priority[row.severity])row.severity=severity;
  for(const category of categories)row.categories.add(category);
  for(const reference of references)if(typeof reference==="string"&&reference)row.references.add(reference);
 }
 for(const f of historical.findings)add(f.code,f.severity,[f.category],f.references);
 for(const f of findings)add(f.code,"CRITICAL",["CROSS_MODULE"],[f.reference]);
 for(const f of unknown)add(f.code,"UNKNOWN",["CROSS_MODULE"],[f.reference]);
 for(const code of configuration.issues)add(code,"CRITICAL",["CONFIGURATION"]);
 for(const code of configuration.warnings)add(code,"WARNING",["CONFIGURATION"]);
 for(const code of configuration.missing)add(code,"UNKNOWN",["CONFIGURATION"]);
 if(runtime.market.status==="REVIEW_REQUIRED")add("RUNTIME_MARKET_REVIEW_REQUIRED","CRITICAL",["MARKET"]);
 if(runtime.asset_intervals.some(i=>i.status==="REVIEW_REQUIRED"))add("RUNTIME_ASSET_REVIEW_REQUIRED","CRITICAL",["TREASURY"]);
 for(const code of ["PORTFOLIO_EXPOSURE_INPUT_UNAVAILABLE","PORTFOLIO_DRAWDOWN_INPUT_UNAVAILABLE","PORTFOLIO_DAILY_LOSS_INPUT_UNAVAILABLE","PORTFOLIO_DEPTH_INPUT_UNAVAILABLE"])
  add(code,"UNKNOWN",["PORTFOLIO"]);
 const rows=[...merged.values()].map(r=>{
  const categories=[...r.categories].sort();
  return {code:r.code,severity:r.severity,category:categories.length===1?categories[0]:"MULTIPLE",categories,references:[...r.references].sort()};
 }).sort((a,b)=>priority[a.severity]-priority[b.severity]||a.code.localeCompare(b.code,"en"));
 const counts={critical:0,warning:0,unknown:0};
 for(const r of rows)counts[r.severity.toLowerCase()]++;
 return {...historical,status:counts.critical?"REVIEW_REQUIRED":counts.warning?"WARNING":"EVIDENCE_INCOMPLETE",
  counts,findings:rows,scope:"ONE_PROJECT_EVIDENCE_SNAPSHOT",aggregation:"UNIQUE_RISK_CODES_WITH_CATEGORY_AND_REFERENCE_SETS",
  portfolio:{status:"NOT_ASSESSED_INPUTS_UNAVAILABLE",current_exposure:null,drawdown_bps:null,daily_loss:null,liquidation_depth:null},
  live_risk_assessed:false,execution_enabled:false,settlement_allowed:false,lifecycle_mutated:false};
}
