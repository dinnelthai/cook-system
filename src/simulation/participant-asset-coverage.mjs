import {runParticipantSimulation} from "./participant-simulator.mjs";
import {reviewParticipantStates,verifyParticipantStateCheckpoint} from "./participant-state-review.mjs";
import {buildUnifiedSyntheticReview} from "../core/unified-synthetic-review.mjs";
const cases=["EMPTY_ACCOUNTS","MIXED_ASSET_SHAPES","LARGE_INTEGER_BALANCES","MAX_ACCOUNT_COUNT"];
const assets=[["0","0"],["1","0"],["0","1"],["1000000000000","1000000000000"]];
/** Fixed passive accounting fixtures only. Varies account coverage and numeric
 * range, not participant decisions, acquisition, distribution or trading. */
export function runParticipantAssetCoverage({seed=42}={}){
 if(!Number.isSafeInteger(seed))throw Error("INVALID_ASSET_COVERAGE_SEED");
 const results=[];
 for(const id of cases){
  const scenarioId="asset-qa-"+id.toLowerCase()+"-"+seed;
  const count=id==="MAX_ACCOUNT_COUNT"?256:8;
  const agents=Array.from({length:count},(_,i)=>{
   let [q,t]=id==="EMPTY_ACCOUNTS"?assets[0]:assets[i%4];
   if(id==="LARGE_INTEGER_BALANCES"&&i===0){q="1000000000000000000000000000000";t="1000000000000000000000000000001";}
   return {scenario_id:scenarioId,agent_id:"account-"+i,role_class:"observer",quote_balance_base_units:q,token_balance_base_units:t};
  });
  const report=runParticipantSimulation({scenarioId,seed,steps:120,agents});
  const state=reviewParticipantStates(report),audit=buildUnifiedSyntheticReview(report);
  const checkpoint=state.checkpoints[0],rows=checkpoint?.accounts??[];
  const participantRows=rows.filter(r=>r.account_id.startsWith("agent:"));
  const shapeCounts={EMPTY:0,QUOTE_ONLY:0,TOKEN_ONLY:0,BOTH_ASSETS:0};
  for(const row of participantRows)shapeCounts[row.asset_state]++;
  const rowMap=new Map(participantRows.map(r=>[r.account_id,r]));
  const exact=agents.every(a=>{
   const r=rowMap.get("agent:"+a.agent_id);
   return r?.quote_balance_base_units===a.quote_balance_base_units&&r?.token_balance_base_units===a.token_balance_base_units;
  });
  const expectedCounts={EMPTY:0,QUOTE_ONLY:0,TOKEN_ONLY:0,BOTH_ASSETS:0};
  for(const a of agents){const q=a.quote_balance_base_units!=="0",t=a.token_balance_base_units!=="0";expectedCounts[q?(t?"BOTH_ASSETS":"QUOTE_ONLY"):(t?"TOKEN_ONLY":"EMPTY")]++;}
  const checks=[
   {id:"account_count",passed:participantRows.length===count&&rows.length===count+1},
   {id:"exact_asset_amounts",passed:exact},
   {id:"asset_shape_classification",passed:Object.keys(expectedCounts).every(k=>shapeCounts[k]===expectedCounts[k])},
   {id:"no_activity_inferred",passed:report.summary.trade_count===0&&participantRows.every(r=>r.recorded_activity==="NO_RECORDED_ACTIVITY"&&r.intent==="UNKNOWN")},
   {id:"ledger_and_checkpoint",passed:audit.status==="INTERNALLY_CONSISTENT"&&state.status==="INTERNALLY_CONSISTENT"&&checkpoint!=null&&verifyParticipantStateCheckpoint(report,checkpoint).status==="RECOMPUTED_MATCH"},
   {id:"no_numeric_pass_for_empty_market",passed:audit.numeric_audit.status==="UNKNOWN"}
  ];
  results.push({case_id:id,account_count:count,asset_shape_counts:shapeCounts,checks,passed:checks.every(c=>c.passed)});
 }
 return {schema_version:"cook-participant-asset-coverage.1",seed,status:results.every(x=>x.passed)?"SYNTHETIC_REGRESSION_PASS":"REVIEW_REQUIRED",
  cases:results,case_count:results.length,passed_count:results.filter(x=>x.passed).length,real_market_validated:false,execution_enabled:false};
}
