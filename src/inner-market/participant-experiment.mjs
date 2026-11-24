import { buildParticipantStressInput, getParticipantCatalogue } from "./participant-stress-lab.mjs";
import { buildHistoricalMvpReport } from "./historical-mvp-report.mjs";

/** Synthetic QA profiles only. Weights are invented test coverage parameters,
 * not empirical participant arrival, trading, attack or ownership probabilities.
 * No order sizes, directions, actor timing or execution policies are generated.
 */
const profiles=Object.freeze([
 ["independent","baseline",10],
 ["retail","retail-coverage",30],
 ["sniper","early-inventory",35],
 ["arbitrage","arbitrage-reference",40],
 ["sandwich","sandwich-shortfall",45],
 ["early-holder","holder-impairment",35],
]);
function random(seed){
 let x=seed>>>0;
 return ()=>{x=(Math.imul(x,1664525)+1013904223)>>>0;return x/4294967296};
}
export function runParticipantExperiment({base,seed=42,runs=100}){
 if(base?.sourceMode!=="SYNTHETIC")throw new Error("synthetic fixtures only");
 if(!Number.isSafeInteger(seed)||seed<0||seed>4294967295)throw new RangeError("seed must be uint32");
 if(!Number.isSafeInteger(runs)||runs<1||runs>1000)throw new RangeError("runs must be 1..1000");
 const next=random(seed),roles=getParticipantCatalogue();
 const summaries=[],observations=[];
 for(const [roleId,caseId,weight] of profiles){
  let reviewed=0,passed=0,perturbed=0,validDrawdown=0,drawdownSum=0;
  const issues={};
  for(let i=0;i<runs;i++){
   const useStress=next()*100<weight;
   const selected=useStress?caseId:"baseline";
   const input=buildParticipantStressInput(base,selected);
   const report=buildHistoricalMvpReport(input);
   const expected=selected==="baseline"||selected==="holder-impairment"?"REPORT_READY":"REVIEW_REQUIRED";
   const matches=report.status===expected;
   if(selected!=="baseline")perturbed++;
   if(matches)passed++;
   if(report.status==="REVIEW_REQUIRED")reviewed++;
   const dd=report.accounting.max_observed_drawdown_bps;
   if(dd!==null){validDrawdown++;drawdownSum+=Number(dd)}
   for(const issue of report.issues)issues[issue]=(issues[issue]??0)+1;
   observations.push({role_id:roleId,trial:i+1,scenario_id:selected,expected_status:expected,actual_status:report.status,passed:matches,observed_drawdown_bps:dd,issues:report.issues});
  }
  summaries.push({role_id:roleId,role:roles.find(r=>r.id===roleId).role,synthetic_qa_weight_percent:weight,runs,stress_trials:perturbed,review_required:reviewed,expected_outcome_matches:passed,drawdown_samples:validDrawdown,mean_observed_drawdown_bps:validDrawdown?Math.round(drawdownSum/validDrawdown):null,issue_counts:issues});
 }
 return {source_mode:"SYNTHETIC",experiment_kind:"ROLE_SPECIFIC_QA_MONTE_CARLO",seed,runs_per_role:runs,total_trials:observations.length,total_matches:summaries.reduce((s,r)=>s+r.expected_outcome_matches,0),summaries,observations,execution_enabled:false,note:"Invented QA sampling weights only, not a behavioral or market forecasting model. Does not generate trades or attack actions."};
}
