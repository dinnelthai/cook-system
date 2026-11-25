import {readFile,writeFile,stat} from "node:fs/promises";
import {reviewRecordedSyntheticSimulation} from "../src/simulation/synthetic-report-ledger.mjs";
try{
 const [input,output]=process.argv.slice(2);
 if(!input||!output)throw Error("Usage: node scripts/review-synthetic-simulation-ledger.mjs <existing-simulation.json> <new-ledger-input.json>");
 if((await stat(input)).size>32*1024*1024)throw Error("INPUT_TOO_LARGE");
 const result=reviewRecordedSyntheticSimulation(JSON.parse(await readFile(input,"utf8")));
 await writeFile(output,JSON.stringify(result.ledger_input,null,2)+"\n",{flag:"wx",mode:0o600});
 console.log(JSON.stringify({output,audit:result.audit,fee_attribution:result.fee_attribution},null,2));
 if(result.audit.status!=="INTERNALLY_CONSISTENT")process.exitCode=2;
}catch(e){console.error(e.message);process.exitCode=1}
