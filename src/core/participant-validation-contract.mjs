/** Shared pure report contract for offline QA artifacts, not source authentication.
 * Validates the known suite manifest and recomputes declared result consistency.
 * Does not run a simulator, generate transactions or evaluate trading policies. */
const groups=["seed_path_integrity","observation_faults","environment_contracts","fixed_detector_templates"];
const fields=["paths","observation_cases","environment_cases","detector_cases"];
const profiles=["BASELINE","DELAY_REORDER","DUPLICATE_DELIVERY","MISSING_RECORD","CONFLICTING_DUPLICATE","CORRUPTED_AMOUNT"];
const environmentFixed=["BASELINE_ACCOUNTING","RESERVE_EVIDENCE_MISSING","HISTORICAL_VALUATION_IMPAIRMENT","COMPOUND_ACCOUNTING_AND_COVERAGE_STRESS","NO_EXECUTION_EVIDENCE"];
const environmentSeed=["QUIET_OR_STALE_FEED","DELAYED_FEED_RECOVERY","TOTAL_OBSERVATION_OUTAGE","CONFLICT_ON_RECOVERY"];
const detectorTypes={"organic-public-response":null,"low-breadth-shock":"LOW_BREADTH_PRICE_SHOCK","data-quality-failure":"CURVE_STATE_OR_DATA_MISMATCH","unknown-attribution":"ATTRIBUTION_UNCERTAINTY"};
const hex=v=>typeof v==="string"&&/^[a-f0-9]{64}$/.test(v);
const ident=v=>typeof v==="string"&&v.length>0&&v.length<=256&&v.trim()===v;
function config(x){
 const c=x.configuration;
 if(!c||!Array.isArray(c.seeds)||!c.seeds.length||c.seeds.length>25||c.seeds.some(s=>!Number.isSafeInteger(s)||s<0)||new Set(c.seeds).size!==c.seeds.length||
 !Number.isSafeInteger(c.steps)||c.steps<120||c.steps>1000||!hex(c.base_fixture_digest))throw Error("INVALID_VALIDATION_CONFIGURATION");
 return JSON.stringify([c.seeds,c.steps,c.base_fixture_digest]);
}
function checkMap(rows){
 if(!Array.isArray(rows)||!rows.length||rows.length>64)throw Error("INVALID_VALIDATION_SUBCHECKS");
 const map=new Map();
 for(const r of rows){if(!ident(r?.id)||typeof r.passed!=="boolean"||map.has(r.id))throw Error("INVALID_VALIDATION_SUBCHECKS");map.set(r.id,r.passed);}
 return map;
}
const requiredPathChecks=["all_fixed_cohorts_present","mixed_observation_accounting","no_future_observation","delayed_first_observation","independent_cohort_recovery","passive_fixture_roles_unchanged","canonical_fixture_unmodified","observation_not_behavior_feedback"].map(x=>"mixed_conditions/"+x).concat(["passive_asset_coverage","per_account_ledger","record_numeric_consistency","generator_contract_consistency","asset_state_replay","checkpoint_recomputation","observer_accounting","detector_non_execution","compound_record_and_balance_conflict","compound_numeric_conflict","reproducible_fixture"]);
const requiredAssetChecks=["account_count","exact_asset_amounts","asset_shape_classification","no_activity_inferred","ledger_and_checkpoint","no_numeric_pass_for_empty_market"];
const requiredEnvironmentChecks={
 BASELINE_ACCOUNTING:["historical_report_ready","execution_disabled"],
 RESERVE_EVIDENCE_MISSING:["review_required","accounting_suppressed","real_reserve_unknown","live_liquidity_not_assessed"],
 HISTORICAL_VALUATION_IMPAIRMENT:["valid_accounting","cash_unchanged","drawdown_increased","execution_disabled"],
 COMPOUND_ACCOUNTING_AND_COVERAGE_STRESS:["review_required","risk_review_required","no_settlement","no_financial_metrics"],
 NO_EXECUTION_EVIDENCE:["no_executions","metrics_unavailable","no_fabricated_candles","not_a_signal"],
 QUIET_OR_STALE_FEED:["last_record_stale","missing_timestamp_unknown"],
 DELAYED_FEED_RECOVERY:["pending_at_close","caught_up","no_future_feedback"],
 TOTAL_OBSERVATION_OUTAGE:["not_confused_with_no_market_activity","age_unknown"],
 CONFLICT_ON_RECOVERY:["conflicting_replay_rejected"]
};
function requireManifest(checks,required){
 if(!required||checks.size!==required.length||required.some(id=>!checks.has(id)))throw Error("VALIDATION_SUBCHECK_MANIFEST_MISMATCH");
}
function declaredChecks(r){
 const m=checkMap(r.checks);
 if(typeof r.passed!=="boolean"||r.passed!==[...m.values()].every(Boolean))throw Error("VALIDATION_SUBCHECK_RESULT_MISMATCH");
 return m;
}
function inspect(input){
 if(input?.schema_version!=="cook-participant-validation-suite.1"||input.source_mode!=="SYNTHETIC"||input.real_market_validated!==false||input.execution_enabled!==false||
 !Array.isArray(input.groups)||input.groups.length!==4||!hex(input.digest))throw Error("INVALID_PARTICIPANT_VALIDATION_IMPORT");
 const configuration=config(input),seeds=input.configuration.seeds;
 const expected=[
  seeds.map(String),
  seeds.flatMap(s=>profiles.map(p=>JSON.stringify(["observation-qa-"+s,p]))),
  [...environmentFixed,...seeds.flatMap(s=>environmentSeed.map(p=>p+":"+s))],
  seeds.flatMap(s=>Object.keys(detectorTypes).map(p=>p+"-"+s))
 ];
 const ids=[r=>String(r.seed),r=>JSON.stringify([r.scenario_id,r.profile]),r=>r.case_id,r=>r.scenario_id];
 const maps=[];
 const summary=groups.map((id,i)=>{
  const g=input.groups.find(x=>x?.id===id),rows=input[fields[i]];
  if(!g||!Array.isArray(rows)||rows.length!==expected[i].length||g.case_count!==rows.length)throw Error("INVALID_PARTICIPANT_VALIDATION_GROUP");
  const wanted=new Set(expected[i]),m=new Map();
  for(const r of rows){
   if(!r||typeof r!=="object")throw Error("INVALID_VALIDATION_CASE");
   const key=ids[i](r);if(!wanted.has(key)||m.has(key))throw Error("INVALID_VALIDATION_CASE_ID");
   let pass,checks=new Map();
   if(i===0||i===2){checks=declaredChecks(r);requireManifest(checks,i===0?requiredPathChecks:requiredEnvironmentChecks[key.split(':')[0]]);pass=r.passed;}
   else if(i===1){
    const expectedStatus=profiles.slice(0,3).includes(r.profile)?"RECOVERED_INTERNAL_MATCH":"REVIEW_REQUIRED";
    if(!["RECOVERED_INTERNAL_MATCH","REVIEW_REQUIRED"].includes(r.status)||r.expected_status!==expectedStatus||r.passed!==(r.status===expectedStatus))throw Error("INVALID_OBSERVATION_RESULT");
    pass=r.passed;
   }else{
    const type=Object.keys(detectorTypes).find(t=>seeds.some(s=>key===t+"-"+s));
    const expectedAlert=detectorTypes[type];
    if(r.expected_alert!==expectedAlert||typeof r.detected!=="boolean"||!Array.isArray(r.alert_types))throw Error("INVALID_DETECTOR_RESULT");
    const found=r.alert_types.includes(expectedAlert??"LOW_BREADTH_PRICE_SHOCK");
    const expectedResult=expectedAlert===null?(found?"FALSE_POSITIVE":"TRUE_NEGATIVE"):(found?"TRUE_POSITIVE":"FALSE_NEGATIVE");
    if(r.detected!==found||r.result!==expectedResult)throw Error("INVALID_DETECTOR_RESULT");
    pass=expectedResult==="TRUE_POSITIVE"||expectedResult==="TRUE_NEGATIVE";
   }
   if(i===0){
    const a=r.asset_coverage;
    const names=["EMPTY_ACCOUNTS","MIXED_ASSET_SHAPES","LARGE_INTEGER_BALANCES","MAX_ACCOUNT_COUNT"];
    if(!a||!Array.isArray(a.cases)||a.cases.length!==4||a.case_count!==4||a.seed!==r.seed)throw Error("INVALID_ASSET_COVERAGE_RESULT");
    const seen=new Set();
    for(const c of a.cases){if(!names.includes(c?.case_id)||seen.has(c.case_id))throw Error("INVALID_ASSET_COVERAGE_RESULT");seen.add(c.case_id);
     const assetChecks=declaredChecks(c);requireManifest(assetChecks,requiredAssetChecks);
      for(const [k,v] of assetChecks)checks.set("asset/"+c.case_id+"/"+k,v);
    }
    const passed=a.cases.filter(c=>c.passed).length;
    if(a.passed_count!==passed||a.status!==(passed===4?"SYNTHETIC_REGRESSION_PASS":"REVIEW_REQUIRED")||checks.get("passive_asset_coverage")!==(passed===4))throw Error("INVALID_ASSET_COVERAGE_RESULT");
   }
   m.set(key,{pass,checks});
  }
  maps.push(m);const passed=[...m.values()].filter(r=>r.pass).length;
  if(g.passed_count!==passed)throw Error("PARTICIPANT_VALIDATION_COUNT_MISMATCH");
  return [id,rows.length,passed,rows.length-passed];
 });
 const pass=summary.every(g=>g[3]===0);
 if(input.status!==(pass?"SYNTHETIC_REGRESSION_PASS":"REVIEW_REQUIRED"))throw Error("PARTICIPANT_EXPERIMENT_STATUS_MISMATCH");
 return {configuration,maps,summary,status:pass?"DECLARED_COUNTS_MATCH":"DECLARED_FAILURES"};
}
export function summarizeImportedParticipantValidation(input){
 const v=inspect(input);
 return {groups:v.summary,status:v.status,calibration_status:input.calibration?.status==="NOT_RUN_NO_HISTORICAL_DATA"?"NOT_RUN_NO_HISTORICAL_DATA":"UNVERIFIED_IMPORTED_REVIEW",source_attestation:"UNKNOWN"};
}
export function compareImportedParticipantValidation(before,after){
 const a=inspect(before),b=inspect(after);
 const unavailable=()=>({status:"NOT_COMPARABLE",groups:[],changed_cases:[],changed_subchecks:[],source_attestation:"UNKNOWN"});
 if(a.configuration!==b.configuration)return unavailable();
 const summary=a.summary.map((r,i)=>[r[0],r[1],r[2],b.summary[i][2],b.summary[i][2]-r[2]]);
 const changed=[],subchecks=[];
 for(let i=0;i<fields.length;i++){
  const x=a.maps[i],y=b.maps[i];
  for(const [key,r] of x){
   const next=y.get(key);
   if(!next||r.checks.size!==next.checks.size||[...r.checks.keys()].some(k=>!next.checks.has(k)))return unavailable();
   if(r.pass!==next.pass)changed.push({group:fields[i],case_id:key,change:next.pass?"RECOVERED":"REGRESSION"});
   for(const [id,pass] of r.checks)if(pass!==next.checks.get(id))subchecks.push({group:fields[i],case_id:key,check_id:id,change:next.checks.get(id)?"RECOVERED":"REGRESSION"});
  }
 }
 const all=[...changed,...subchecks];
 return {status:all.some(c=>c.change==="REGRESSION")?"DECLARED_REGRESSION":all.length?"DECLARED_RECOVERY":"DECLARED_UNCHANGED",groups:summary,changed_cases:changed,changed_subchecks:subchecks,source_attestation:"UNKNOWN"};
}
