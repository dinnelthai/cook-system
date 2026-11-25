import {readFile,writeFile} from "node:fs/promises";
import {runOfflineRiskLaboratory} from "../src/simulation/offline-risk-laboratory.mjs";
try{
 const [output="offline-risk-laboratory.json"]=process.argv.slice(2);
 const base=JSON.parse(await readFile(new URL("../fixtures/synthetic/inner-market-mvp.json",import.meta.url),"utf8"));
 const report=runOfflineRiskLaboratory({base});
 await writeFile(output,JSON.stringify(report,null,2)+"\n",{flag:"wx",mode:0o600});
 console.log(JSON.stringify({status:report.status,participant_groups:report.participant.groups,pool_cases:report.pools.case_count,pool_passed:report.pools.passed_count,output,execution_enabled:false}));
 if(report.status!=="SYNTHETIC_REGRESSION_PASS")process.exitCode=1;
}catch(e){console.error(e.message);process.exitCode=1;}
