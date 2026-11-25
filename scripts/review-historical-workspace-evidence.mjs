import {writeFile} from "node:fs/promises";
import {readBoundedRegularFile} from "../src/core/bounded-private-file.mjs";
import {WORKSPACE_MAX_BYTES} from "../src/inner-market/historical-project-workspace.mjs";
import {reviewHistoricalWorkspaceEvidence} from "../src/inner-market/historical-workspace-evidence.mjs";
try{
 const [input,output,...extra]=process.argv.slice(2);
 if(!input||!output||extra.length)throw Error("Usage: node scripts/review-historical-workspace-evidence.mjs <workspace.json> <new-evidence-index.json>");
 const bytes=await readBoundedRegularFile(input,WORKSPACE_MAX_BYTES);
 const result=reviewHistoricalWorkspaceEvidence(JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes)));
 await writeFile(output,JSON.stringify(result)+"\n",{flag:"wx",mode:0o600});
 console.log(JSON.stringify({status:result.status,counts:result.counts,archive_status:result.archive_audit.status}));
 if(result.status!=="INTERNALLY_CONSISTENT")process.exitCode=2;
}catch(e){console.error(e.message);process.exitCode=1;}
