import {createHash} from "node:crypto";
import {canonicalJson} from "../core/canonical-json.mjs";
import {buildUnifiedSyntheticReview} from "../core/unified-synthetic-review.mjs";
import {analyzeMarketQuality} from "../core/market-quality-engine.mjs";
import {runParticipantSimulation} from "./participant-simulator.mjs";
import {reviewParticipantStates,verifyParticipantStateCheckpoint} from "./participant-state-review.mjs";
import {reviewParticipantObservationCoverage} from "./participant-observation-model.mjs";
import {runParticipantEnvironmentSuite} from "./participant-environment-stress.mjs";
import {runParticipantObservationSuite} from "./participant-observation-stress.mjs";
import {runHeldOutDefensiveEvaluation} from "./defensive-evaluation.mjs";
import {assessHistoricalCalibrationReadiness} from "./participant-calibration-readiness.mjs";
const hash=v=>createHash("sha256").update(canonicalJson(v),"utf8").digest("hex");
const result=(id,passed)=>({id,passed:passed===true});
/** Offline regression only. Distinct seed paths, fixed faults, and fixed
 * detector templates are reported separately, never pooled into real accuracy. */
export function runParticipantValidationSuite({base,seeds=[701,702,703,704,705],steps=240,historicalReports=[]}={}){
 if(base?.sourceMode!=="SYNTHETIC"||!Array.isArray(seeds)||!seeds.length||seeds.length>25||
    new Set(seeds).size!==seeds.length||seeds.some(s=>!Number.isSafeInteger(s)||s<0)||
    !Number.isSafeInteger(steps)||steps<120||steps>1000)throw Error("INVALID_PARTICIPANT_VALIDATION_CONFIG");
 const environment=runParticipantEnvironmentSuite({base,seeds,steps});
 const observation=runParticipantObservationSuite({seeds,steps});
 const defensive=runHeldOutDefensiveEvaluation({seeds});
 const paths=[];
 for(const seed of seeds){
  const report=runParticipantSimulation({scenarioId:"validation-qa-"+seed,seed,steps});
  const ledger=buildUnifiedSyntheticReview(report),states=reviewParticipantStates(report);
  const coverage=reviewParticipantObservationCoverage(report,{seed});
  const detector=analyzeMarketQuality({events:report.detector_input.events});
  const bad=structuredClone(report);
  bad.agent_states[0].quote_balance_base_units=(BigInt(bad.agent_states[0].quote_balance_base_units)+1n).toString();
  bad.detector_input.events.reverse();
  const badState=reviewParticipantStates(bad);
  const checks=[
   result("per_account_ledger",ledger.status==="INTERNALLY_CONSISTENT"),
   result("record_numeric_consistency",ledger.numeric_audit.status==="PASS"),
   result("asset_state_replay",states.status==="INTERNALLY_CONSISTENT"&&states.endpoint_checked),
   result("checkpoint_recomputation",states.checkpoints.length>0&&verifyParticipantStateCheckpoint(report,states.checkpoints.at(-1)).status==="RECOMPUTED_MATCH"),
   result("observer_accounting",coverage.observers.every(o=>o.samples.every(s=>s.oracle_record_count===s.received_record_count+s.not_yet_due_record_count+s.missing_after_due_count))),
   result("detector_non_execution",detector.execution_enabled===false&&detector.is_trading_signal===false),
   result("compound_record_and_balance_conflict",badState.status==="REVIEW_REQUIRED"&&badState.checkpoints.length===0),
   result("reproducible_fixture",hash(report)===hash(runParticipantSimulation({scenarioId:"validation-qa-"+seed,seed,steps})))
  ];
  paths.push({seed,fixture_digest:hash(report),event_count:report.summary.event_count,account_count:ledger.observed_record_counts.agent_count+1,
   checks,passed:checks.every(c=>c.passed)});
 }
 const groups=[
  {id:"seed_path_integrity",case_count:paths.length,passed_count:paths.filter(p=>p.passed).length},
  {id:"observation_faults",case_count:observation.case_count,passed_count:observation.passed_count},
  {id:"environment_contracts",case_count:environment.case_count,passed_count:environment.passed_count},
  {id:"fixed_detector_templates",case_count:defensive.case_count,passed_count:defensive.cases.filter(c=>["TRUE_POSITIVE","TRUE_NEGATIVE"].includes(c.result)).length}
 ];
 const calibration=assessHistoricalCalibrationReadiness(historicalReports);
 const body={schema_version:"cook-participant-validation-suite.1",status:groups.every(g=>g.case_count===g.passed_count)?"SYNTHETIC_REGRESSION_PASS":"REVIEW_REQUIRED",
  configuration:{seeds:[...seeds],steps,base_fixture_digest:hash(base)},groups,paths,
  observation_cases:observation.cases,environment_cases:environment.cases,detector_cases:defensive.cases,
  calibration,source_mode:"SYNTHETIC",real_market_validated:false,execution_enabled:false};
 return {...body,digest:hash(body)};
}
