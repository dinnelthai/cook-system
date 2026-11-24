// Read-only historical evidence risk classification. Not a trading signal.
const severityRank={CRITICAL:0,WARNING:1,UNKNOWN:2};
const validStatus=new Set(["PASS","REVIEW","UNKNOWN","UNAVAILABLE"]);
const checks=[
 ["accounting","FINANCIAL_AUDIT","财务对账","CRITICAL"],
 ["market_coverage","MARKET_HISTORY","市场历史覆盖","CRITICAL"],
 ["economic_classification","ECONOMIC_CLASSIFICATION","经济分类认证","CRITICAL"],
 ["cost_basis","COST_BASIS","库存成本认证","CRITICAL"],
 ["valuation","VALUATION","资产估值","WARNING"],
 ["candle_evidence","CANDLE_EVIDENCE","K 线证据","WARNING"],
 ["source_attestation","SOURCE_ATTESTATION","来源认证","CRITICAL"],
 ["wallet_attribution","WALLET_ATTRIBUTION","资金归属认证","CRITICAL"]
];
const alert=(code,severity,label,reason)=>({code,severity,label,reason});
const signed=v=>typeof v==="string"&&/^(0|-?[1-9][0-9]*)$/.test(v);
export function assessObservationFreshness({observedAtMs,nowMs,maxAgeMs}){
 if(!Number.isSafeInteger(nowMs)||nowMs<0||!Number.isSafeInteger(maxAgeMs)||maxAgeMs<=0)throw Error("invalid freshness policy");
 if(observedAtMs==null)return {status:"UNKNOWN",age_ms:null};
 if(!Number.isSafeInteger(observedAtMs)||observedAtMs<0||observedAtMs>nowMs)return {status:"REVIEW",age_ms:null};
 const age=nowMs-observedAtMs;
 return {status:age>maxAgeMs?"STALE":"FRESH",age_ms:age};
}
/** Derive a deterministic summary from existing closed-interval audit results.
 * Never infer current market risk, ownership or independent source authentication.
 * Optional account/cash reports are diagnostic inputs, not trusted attestations.
 */
export function assessHistoricalRisk({reportChecks,sourceMode,accountAudit=null,cashAudit=null}){
 if(!["SYNTHETIC","ARCHIVED_HISTORICAL"].includes(sourceMode)||!Array.isArray(reportChecks))throw Error("invalid historical risk context");
 const byId=new Map();
 for(const c of reportChecks){
  if(!c||typeof c.id!=="string"||byId.has(c.id)||!validStatus.has(c.status))throw Error("invalid or duplicate report check");
  byId.set(c.id,c.status);
 }
 const alerts=[];
 for(const [id,code,label,level] of checks){
  const s=byId.get(id);
  if(s==="REVIEW")alerts.push(alert(code,level,label,"AUDIT_REVIEW_REQUIRED"));
  else if(s!=="PASS")alerts.push(alert(code,"UNKNOWN",label,"EVIDENCE_UNAVAILABLE"));
 }
 if(sourceMode==="SYNTHETIC")alerts.push(alert("SYNTHETIC_ONLY","UNKNOWN","合成样本","NOT_CHAIN_EVIDENCE"));
 if(accountAudit===null)alerts.push(alert("RECEIPT_AUDIT","UNKNOWN","历史回执核验","EVIDENCE_UNAVAILABLE"));
 else{
  if(accountAudit.schema_version!=="cook-archived-account-audit.1"||accountAudit.status!=="INTERNALLY_CONSISTENT")alerts.push(alert("RECEIPT_AUDIT","CRITICAL","历史回执核验","AUDIT_REVIEW_REQUIRED"));
  for(const [code,label,value] of [["NATIVE_BALANCE_DIFF","SOL 余额差额",accountAudit.native?.difference_lamports],["TOKEN_BALANCE_DIFF","Token 余额差额",accountAudit.token?.difference_base_units]]){
   if(!signed(value))alerts.push(alert(code,"UNKNOWN",label,"EVIDENCE_UNAVAILABLE"));
   else if(value!=="0")alerts.push(alert(code,"CRITICAL",label,"NONZERO_DIFFERENCE"));
  }
 }
 if(cashAudit===null)alerts.push(alert("CASH_POSTINGS","UNKNOWN","现金分录交叉审计","EVIDENCE_UNAVAILABLE"));
 else if(cashAudit.schema_version!=="cook-archived-cash-crosscheck.1"||cashAudit.status!=="AMOUNTS_INTERNALLY_CONSISTENT")alerts.push(alert("CASH_POSTINGS","CRITICAL","现金分录交叉审计","AUDIT_REVIEW_REQUIRED"));
 alerts.push(alert("CURRENT_MARKET","UNKNOWN","当前市场状态","HISTORICAL_SCOPE_ONLY"));
 alerts.push(alert("INVENTORY_CONCENTRATION","UNKNOWN","持仓集中度","NO_VERIFIED_OWNERSHIP"));
 alerts.push(alert("LIQUIDITY_RISK","UNKNOWN","实时流动性","NO_CURRENT_EVIDENCE"));
 alerts.sort((a,b)=>severityRank[a.severity]-severityRank[b.severity]||a.code.localeCompare(b.code,"en"));
 const counts={critical:0,warning:0,unknown:0};
 for(const a of alerts)counts[a.severity.toLowerCase()]++;
 return {schema_version:"cook-historical-risk.1",status:counts.critical?"REVIEW_REQUIRED":counts.warning?"WARNING":"EVIDENCE_INCOMPLETE",scope:"CLOSED_INTERVAL",alerts,counts,source_attestation:"UNKNOWN",live_risk_assessed:false,execution_enabled:false};
}
