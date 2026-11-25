// QA display projection only. No market forecasts or trading recommendations.
export function experimentDisplayRows(experiment){
 if(experiment?.source_mode!=="SYNTHETIC"||experiment.execution_enabled!==false||!Array.isArray(experiment.summaries))throw Error("INVALID_QA_DISPLAY");
 return experiment.summaries.map(s=>{
  const runs=s.runs,counts=[s.stress_trials,s.review_required,s.expected_outcome_matches,s.drawdown_samples];
  if(!Number.isSafeInteger(runs)||runs<1||counts.some(n=>!Number.isSafeInteger(n)||n<0||n>runs))throw Error("INVALID_QA_COUNTS");
  return {role:s.role,runs,stress:counts[0],review:counts[1],matches:counts[2],drawdown_samples:counts[3],mean_drawdown:counts[3]>0?s.mean_observed_drawdown_bps??null:null};
 });
}
