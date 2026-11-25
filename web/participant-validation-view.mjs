/** Read-only imported experiment summary, not independent proof of a run. */
export function summarizeImportedParticipantValidation(input){
 if(input?.schema_version!=="cook-participant-validation-suite.1"||input.source_mode!=="SYNTHETIC"||input.real_market_validated!==false||input.execution_enabled!==false||
 !Array.isArray(input.groups)||input.groups.length!==4||!/^[a-f0-9]{64}$/.test(input.digest??""))throw Error("INVALID_PARTICIPANT_VALIDATION_IMPORT");
 const ids=["seed_path_integrity","observation_faults","environment_contracts","fixed_detector_templates"];
 const arrays=[input.paths,input.observation_cases,input.environment_cases,input.detector_cases];
 const groups=ids.map((id,i)=>{
  const g=input.groups.find(x=>x?.id===id),rows=arrays[i];
  if(!g||!Array.isArray(rows)||rows.length<1||rows.length>300||g.case_count!==rows.length)throw Error("INVALID_PARTICIPANT_VALIDATION_GROUP");
  const passed=rows.filter(x=>i===3?["TRUE_POSITIVE","TRUE_NEGATIVE"].includes(x?.result):x?.passed===true).length;
  if(g.passed_count!==passed)throw Error("PARTICIPANT_VALIDATION_COUNT_MISMATCH");
  return [id,rows.length,passed,rows.length-passed];
 });
 return {groups,status:groups.every(g=>g[3]===0)?"DECLARED_COUNTS_MATCH":"DECLARED_FAILURES",calibration_status:input.calibration?.status==="NOT_RUN_NO_HISTORICAL_DATA"?"NOT_RUN_NO_HISTORICAL_DATA":"UNVERIFIED_IMPORTED_REVIEW",source_attestation:"UNKNOWN"};
}

/** Compare only matched QA configurations and case identity, never performance
 * or profitability of participant strategies. Browser counts remain unverified. */
export function compareImportedParticipantValidation(before,after){
 const a=summarizeImportedParticipantValidation(before),b=summarizeImportedParticipantValidation(after);
 const config=x=>{const c=x.configuration;if(!c||!Array.isArray(c.seeds)||!c.seeds.length||c.seeds.length>25||
 c.seeds.some(s=>!Number.isSafeInteger(s)||s<0)||new Set(c.seeds).size!==c.seeds.length||
 !Number.isSafeInteger(c.steps)||c.steps<120||c.steps>1000||!/^[a-f0-9]{64}$/.test(c.base_fixture_digest??""))throw Error("INVALID_VALIDATION_CONFIGURATION");
 return JSON.stringify([c.seeds,c.steps,c.base_fixture_digest]);};
 if(config(before)!==config(after))return {status:"NOT_COMPARABLE",groups:[],changed_cases:[],source_attestation:"UNKNOWN"};
 const groups=a.groups.map((r,i)=>[r[0],r[1],r[2],b.groups[i][2],b.groups[i][2]-r[2]]);
 const specs=[["paths",x=>String(x.seed)],["observation_cases",x=>JSON.stringify([x.scenario_id,x.profile])],["environment_cases",x=>x.case_id],["detector_cases",x=>x.scenario_id]];
 const changed=[];
 for(const [field,id] of specs){
  const map=rows=>{const m=new Map();for(const r of rows){const k=id(r);if(typeof k!=="string"||!k||m.has(k))throw Error("INVALID_VALIDATION_CASE_ID");m.set(k,field==="detector_cases"?["TRUE_POSITIVE","TRUE_NEGATIVE"].includes(r.result):r.passed===true);}return m;};
  const x=map(before[field]),y=map(after[field]);
  if(x.size!==y.size||[...x.keys()].some(k=>!y.has(k)))return {status:"NOT_COMPARABLE",groups:[],changed_cases:[],source_attestation:"UNKNOWN"};
  for(const [key,pass] of x)if(pass!==y.get(key))changed.push({group:field,case_id:key,change:y.get(key)?"RECOVERED":"REGRESSION"});
 }
 return {status:changed.some(c=>c.change==="REGRESSION")?"DECLARED_REGRESSION":changed.length?"DECLARED_RECOVERY":"DECLARED_UNCHANGED",groups,changed_cases:changed,source_attestation:"UNKNOWN"};
}
