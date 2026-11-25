import {readFile,writeFile} from "node:fs/promises";
import {benchmarkParticipantValidation} from "../src/simulation/participant-experiment-benchmark.mjs";
try{
 const [output="participant-benchmark.json",repeatText="3"]=process.argv.slice(2);
 const base=JSON.parse(await readFile(new URL("../fixtures/synthetic/inner-market-mvp.json",import.meta.url),"utf8"));
 const report=benchmarkParticipantValidation({base,repeats:Number(repeatText)});
 await writeFile(output,JSON.stringify(report,null,2)+"\n",{flag:"wx",mode:0o600});
 console.log(JSON.stringify({status:report.status,min_elapsed_ms:report.min_elapsed_ms,max_elapsed_ms:report.max_elapsed_ms,output}));
 if(report.status!=="SYNTHETIC_REGRESSION_PASS")process.exitCode=1;
}catch(e){console.error(e.message);process.exitCode=1;}
