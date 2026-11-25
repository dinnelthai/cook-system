import {readFile,writeFile,stat} from "node:fs/promises";
import {auditRecordedSyntheticBatch} from "../src/simulation/synthetic-batch-audit.mjs";
try{
 const [input,output]=process.argv.slice(2);
 if(!input||!output)throw Error("Usage: node scripts/review-synthetic-report-batch.mjs <existing-report-array.json> <new-audit.json>");
 if((await stat(input)).size>32*1024*1024)throw Error("INPUT_TOO_LARGE");
 const result=auditRecordedSyntheticBatch(JSON.parse(await readFile(input,"utf8")));
 await writeFile(output,JSON.stringify(result,null,2)+"\n",{flag:"wx",mode:0o600});
 console.log(JSON.stringify({status:result.status,summary:result.summary,output},null,2));
 if(result.status!=="INTERNALLY_CONSISTENT")process.exitCode=2;
}catch(e){console.error(e.message);process.exitCode=1}
