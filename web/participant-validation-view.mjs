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
