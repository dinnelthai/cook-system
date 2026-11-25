import {createHash} from "node:crypto";
import {canonicalJson} from "../core/canonical-json.mjs";
import {buildTerminalState} from "../inner-market/terminal-state.mjs";
import {auditCalibrationIntervals,calibrationNetworkKey} from "./calibration-interval-audit.mjs";
/** Readiness of supplied closed-interval historical evidence for future
 * descriptive calibration. No behavior fitting, policy tuning or predictions. */
export function assessHistoricalCalibrationReadiness(reports=[]){
 if(!Array.isArray(reports)||reports.length>50)throw Error("INVALID_CALIBRATION_REPORT_SET");
 const rows=[],seen=new Set();
 for(const input of reports){
  if(input?.sourceMode!=="ARCHIVED_HISTORICAL")throw Error("ARCHIVED_CALIBRATION_REPORT_REQUIRED");
  const s=input.scope;
  if(!s||typeof s.network!=="string"||typeof s.genesisHash!=="string"||!s.network||!s.genesisHash)throw Error("CALIBRATION_SCOPE_INCOMPLETE");
  const key=canonicalJson([calibrationNetworkKey(s.network),s.genesisHash,s.tokenMint,s.quoteAsset,s.openingCutoff,s.closingCutoff]);
  if(seen.has(key))throw Error("DUPLICATE_CALIBRATION_INTERVAL");seen.add(key);
  const r=buildTerminalState(input);
  const checks=["trade_evidence","market_coverage","candle_evidence","archived_evidence"].map(id=>({id,status:r.checks.find(c=>c.id===id)?.status??"UNKNOWN"}));
  rows.push({report_digest:createHash("sha256").update(canonicalJson(input),"utf8").digest("hex"),
   report_status:r.status,checks,internal_coverage_complete:r.status==="REPORT_READY"&&checks.every(c=>c.status==="PASS"),
   source_attestation:"UNKNOWN"});
 }
 return {schema_version:"cook-calibration-readiness.1",status:rows.length?"HISTORICAL_INPUT_REVIEWED_NOT_CALIBRATED":"NOT_RUN_NO_HISTORICAL_DATA",
  report_count:rows.length,internally_complete_count:rows.filter(r=>r.internal_coverage_complete).length,rows,
  interval_audit:auditCalibrationIntervals(reports.map(r=>r.scope)),
  independent_source_attestation:"UNKNOWN",nonoverlapping_intervals_verified:false,empirical_calibration_performed:false,real_market_validated:false,execution_enabled:false};
}
