import {writeFile} from "node:fs/promises";
import {runParticipantObservationSuite} from "../src/simulation/participant-observation-stress.mjs";
try{
 const [output="participant-observation-suite.json"]=process.argv.slice(2);
 const r=runParticipantObservationSuite();
 await writeFile(output,JSON.stringify(r,null,2)+"\n",{flag:"wx",mode:0o600});
 console.log(JSON.stringify({status:r.status,case_count:r.case_count,passed_count:r.passed_count,output,execution_enabled:false}));
 if(r.status!=="SYNTHETIC_REGRESSION_PASS")process.exitCode=1;
}catch(e){console.error(e.message);process.exitCode=1;}
