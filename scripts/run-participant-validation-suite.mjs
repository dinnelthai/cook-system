import {readFile,writeFile} from "node:fs/promises";
import {performance} from "node:perf_hooks";
import {readBoundedRegularFile} from "../src/core/bounded-private-file.mjs";
import {runParticipantValidationSuite} from "../src/simulation/participant-validation-suite.mjs";
try{
 const [output="participant-validation-suite.json",historicalPath]=process.argv.slice(2);
 const base=JSON.parse(await readFile(new URL("../fixtures/synthetic/inner-market-mvp.json",import.meta.url),"utf8"));
 const historicalReports=historicalPath?JSON.parse((await readBoundedRegularFile(historicalPath,16*1024*1024)).toString("utf8")):[];
 const started=performance.now(),report=runParticipantValidationSuite({base,historicalReports});
 const elapsed_ms=Math.round(performance.now()-started);
 await writeFile(output,JSON.stringify(report,null,2)+"\n",{flag:"wx",mode:0o600});
 console.log(JSON.stringify({status:report.status,groups:report.groups,calibration:report.calibration.status,elapsed_ms,output,execution_enabled:false}));
 if(report.status!=="SYNTHETIC_REGRESSION_PASS")process.exitCode=1;
}catch(e){console.error(e.message);process.exitCode=1;}
