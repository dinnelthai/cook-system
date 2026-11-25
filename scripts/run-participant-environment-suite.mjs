import {readFile,writeFile} from "node:fs/promises";
import {runParticipantEnvironmentSuite} from "../src/simulation/participant-environment-stress.mjs";
try{
 const [output="participant-environment-suite.json"]=process.argv.slice(2);
 const base=JSON.parse(await readFile(new URL("../fixtures/synthetic/inner-market-mvp.json",import.meta.url),"utf8"));
 const r=runParticipantEnvironmentSuite({base});
 await writeFile(output,JSON.stringify(r,null,2)+"\n",{flag:"wx",mode:0o600});
 console.log(JSON.stringify({status:r.status,case_count:r.case_count,passed_count:r.passed_count,output,execution_enabled:false}));
 if(r.status!=="SYNTHETIC_REGRESSION_PASS")process.exitCode=1;
}catch(e){console.error(e.message);process.exitCode=1;}
