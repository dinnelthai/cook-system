import {assertProjectAggregate} from "./project-aggregate.mjs";
import {describeProjectLifecycleEvidence} from "./project-lifecycle-evidence.mjs";
import {describeProjectRiskReview} from "./project-risk-review.mjs";
import {reviewProjectConfiguration,describeOfflineWorkflow} from "./project-offline-workflow.mjs";
import {reviewIntervalModelEvidence} from "./project-interval-model-evidence.mjs";
import {reviewProjectContinuity} from "./project-continuity-review.mjs";
import {describeLaunchReview,describeHistoricalOperatingComponents} from "./project-governance-review.mjs";
import {describeOperationalEvidence} from "./project-operational-evidence.mjs";
import {buildProjectRuntime} from "./project-runtime.mjs";
import {consolidateProjectRisk} from "./global-project-risk.mjs";
import {indexProjectEvidence} from "./project-evidence-index.mjs";
/** M18–24: read-only review projection, scoped to a single local snapshot.
 * A digest/link match establishes internal association, not source truth.
 * Never sums different intervals, infers trading permissions or initiates actions. */
export function buildProjectBusinessReview(projectInput,archives=[],orders=[]){
 const p=assertProjectAggregate(projectInput);
 if(!Array.isArray(archives)||archives.length>256||!Array.isArray(orders)||orders.length>256)throw Error("PROJECT_BUSINESS_REVIEW_INPUT_LIMIT");
 const {findings,unknown,intervals,receipts}=indexProjectEvidence(p,archives,orders);
 const lifecycle=describeProjectLifecycleEvidence(p,archives,orders),risk=describeProjectRiskReview(p,archives,orders);
 const section=(kind)=>({linked_report_count:intervals.filter(x=>x.reviews.some(r=>r.kind===kind)).length,
  review_count:intervals.reduce((n,x)=>n+x.reviews.filter(r=>r.kind===kind).length,0),
  status:intervals.some(x=>x.reviews.some(r=>r.kind===kind&&r.status==="REVIEW_REQUIRED"))?"REVIEW_REQUIRED":
    intervals.some(x=>x.reviews.some(r=>r.kind===kind))?"DECLARED_EVIDENCE_PRESENT":"MISSING"});
 const treasury=section("TREASURY_REVIEW"),market=section("MARKET_EVIDENCE_REVIEW"),close=section("PROJECT_CLOSE_REVIEW");
 const configuration=reviewProjectConfiguration(p);
 const model_evidence=reviewIntervalModelEvidence(p,intervals,archives);
 findings.push(...model_evidence.findings);
 unknown.push(...model_evidence.unknown);
 const continuity=reviewProjectContinuity(p,intervals,archives);
 findings.push(...continuity.findings);
 unknown.push(...continuity.unknown);
 const launch_review=describeLaunchReview(p,configuration);
 const operating_components=describeHistoricalOperatingComponents(p,intervals,archives);
 findings.push(...operating_components.findings);
 unknown.push(...operating_components.unknown);
 const operational_evidence=describeOperationalEvidence(p,archives,receipts);
 findings.push(...operational_evidence.findings);
 unknown.push(...operational_evidence.unknown);
 const runtime=buildProjectRuntime(p,{archives,intervals,lifecycle,configuration,risk,findings,receipts,operational:operational_evidence});
 findings.push(...runtime.issues);
 unknown.push(...runtime.unknown);
 const global_risk=consolidateProjectRisk({historical:risk,configuration,findings,unknown,runtime});
 runtime.risk={...runtime.risk,status:global_risk.status,counts:global_risk.counts};
 if(global_risk.status==="REVIEW_REQUIRED")runtime.status="REVIEW_REQUIRED";
 const offline_workflow=describeOfflineWorkflow({configuration,lifecycle,intervals,receipts,risk:global_risk,findings});
 const gates=[
  {id:"project_identity",status:p.token.mint&&p.network.genesis_hash?"DECLARED_PRESENT":"MISSING"},
  {id:"linked_closed_interval",status:intervals.length?"DECLARED_PRESENT":"MISSING"},
  {id:"treasury_review",status:treasury.status},{id:"market_review",status:market.status},
  {id:"order_evidence",status:receipts.length?"DECLARED_RECORDS_PRESENT":"MISSING"},
  ...["independent_genesis_check","retained_finalized_history","independent_account_ownership","independent_financial_parity","real_browser_acceptance","load_and_recovery_acceptance"].map(id=>({id,status:"NOT_RUN"}))
 ];
 return {schema_version:"cook-project-business-review.1",project_id:p.project_id,project_revision:p.revision,recorded_stage:p.lifecycle.stage,
  configuration,offline_workflow,model_evidence,continuity,launch_review,operating_components,operational_evidence,runtime,
  status:offline_workflow.status==="REVIEW_REQUIRED"?"REVIEW_REQUIRED":"EVIDENCE_INCOMPLETE",
  treasury:{...treasury,project_wide_total:null,live_balance:null},market:{...market,live_market_assessed:false},close,
  orders:{record_count:receipts.length,unresolved_count:receipts.filter(r=>!["DECLARED_SAMPLE_MATCH"].includes(r.status)).length,records:receipts},
  global_risk,
  risk:{...global_risk.counts,status:global_risk.status,cross_module_finding_count:findings.length,configuration_issue_count:configuration.issues.length},lifecycle:{recorded_stage:lifecycle.recorded_stage,blockers:lifecycle.blockers},
  capacity:{archive_count:archives.length,archive_limit:256,order_count:orders.length,order_limit:256,
   status:archives.length>=256||orders.length>=256?"LIMIT_REACHED":archives.length>=230||orders.length>=230?"NEAR_LIMIT":"WITHIN_LIMIT"},
  intervals,findings,unknown,data_integration:{status:"EXTERNAL_ACCEPTANCE_PENDING",gates,real_data_connected:false,source_attestation:"UNKNOWN"},
  source_attestation:"UNKNOWN",lifecycle_mutated:false,settlement_allowed:false,execution_enabled:false};
}
