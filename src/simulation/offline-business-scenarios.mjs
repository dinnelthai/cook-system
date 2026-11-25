import {createHash} from "node:crypto";
import {canonicalJson} from "../core/canonical-json.mjs";
import {getParticipantStressCases,buildParticipantStressInput} from "../inner-market/participant-stress-lab.mjs";
import {buildUnifiedHistoricalReport} from "../inner-market/unified-historical-report.mjs";
import {runBusinessScenarioAcceptance} from "./business-scenario-acceptance.mjs";
const digest=x=>createHash("sha256").update(canonicalJson(x),"utf8").digest("hex");
/** Fixed retrospective synthetic QA, not a strategy contest or optimization.
 * Compare source-quality and financial consistency states, no market actions. */
export function evaluateOfflineBusinessScenarios(base){
 if(base?.sourceMode!=="SYNTHETIC")throw Error("SYNTHETIC_FIXTURE_REQUIRED");
 const input_digest=digest(base),baseline=buildUnifiedHistoricalReport(base);
 const cases=getParticipantStressCases().map(c=>{
  const input=buildParticipantStressInput(base,c.id),r=buildUnifiedHistoricalReport(input);
  const before=baseline.terminal_state.treasury.closing_cash_base_units;
  const after=r.terminal_state.treasury.closing_cash_base_units;
  const checks=[
   {id:"expected_report_status",passed:r.status===c.expectedAuditStatus},
   {id:"non_execution",passed:r.execution_enabled===false},
   {id:"rejected_report_blocks_test_settlement",passed:r.status!=="REVIEW_REQUIRED"||r.settlement_allowed===false},
   {id:"cash_unchanged_for_valuation_only",passed:c.id!=="holder-impairment"||(before!=null&&before===after)}
  ];
  return {case_id:c.id,category:c.risk,expected_status:c.expectedAuditStatus,actual_status:r.status,
   input_digest:digest(input),checks,passed:checks.every(x=>x.passed)};
 });
 const business=runBusinessScenarioAcceptance(base);
 const unchanged=digest(base)===input_digest;
 const body={schema_version:"cook-offline-business-scenarios.1",source_mode:"SYNTHETIC",
  baseline:{input_digest,status:baseline.status},stress:{case_count:cases.length,passed_count:cases.filter(c=>c.passed).length,cases},
  business,fixture_unchanged:unchanged,
  status:unchanged&&cases.every(c=>c.passed)&&business.status==="SYNTHETIC_REGRESSION_PASS"?"SYNTHETIC_REGRESSION_PASS":"REVIEW_REQUIRED",
  real_market_validated:false,production_ready:false,execution_enabled:false,settlement_allowed:false};
 return {...body,digest:digest(body)};
}
