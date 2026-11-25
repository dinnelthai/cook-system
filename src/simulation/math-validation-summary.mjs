import {verifyParticipantExperiment} from "./participant-experiment-artifact.mjs";
/** Reuse validated experiment artifact; report test coverage without
 * interpreting synthetic success ratios as market probabilities. */
export function summarizeMathValidation(report){
 const integrity=verifyParticipantExperiment(report);
 const subchecks=new Map();
 for(const path of report.paths)for(const c of path.checks){
  const row=subchecks.get(c.id)??{id:c.id,case_count:0,passed_count:0};
  row.case_count++;row.passed_count+=Number(c.passed);subchecks.set(c.id,row);
 }
 const templateMap=new Map();
 for(const c of report.detector_cases){
  const key=c.scenario_id.replace(/-[0-9]+$/,"");
  const row=templateMap.get(key)??{template:key,case_count:0,passed_count:0};
  row.case_count++;row.passed_count+=Number(["TRUE_POSITIVE","TRUE_NEGATIVE"].includes(c.result));templateMap.set(key,row);
 }
 return {schema_version:"cook-math-validation-summary.1",status:report.status,integrity:integrity.status,
  artifact_digest:integrity.digest,seed_count:report.configuration.seeds.length,
  groups:report.groups.map(g=>({...g})),path_subchecks:[...subchecks.values()],
  fixed_templates:[...templateMap.values()],independent_trials_verified:false,
  real_world_error_rates:null,confidence_interval:null,source_attestation:"UNKNOWN",execution_enabled:false};
}
