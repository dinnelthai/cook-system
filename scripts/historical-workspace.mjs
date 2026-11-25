import {resolve} from "node:path";
import {writeFile} from "node:fs/promises";
import {readBoundedRegularFile} from "../src/core/bounded-private-file.mjs";
import {WORKSPACE_MAX_BYTES} from "../src/inner-market/historical-project-workspace.mjs";
import {openHistoricalWorkspaceStore} from "../src/inner-market/historical-workspace-store.mjs";
let store;
try{
 const [command,arg,revisionArg]=process.argv.slice(2);
 if(!["list","save","export"].includes(command))throw Error("Usage: node scripts/historical-workspace.mjs list | save <workspace.json> <expected-revision> | export <new-file.json> [revision]");
 if(command==="list"&&(arg!==undefined||revisionArg!==undefined)||command!=="list"&&!arg||command==="save"&&revisionArg===undefined)throw Error("INVALID_ARGUMENTS");
 const revision=revisionArg===undefined?undefined:/^(0|[1-9][0-9]*)$/.test(revisionArg)?Number(revisionArg):NaN;
 if(revision!==undefined&&!Number.isSafeInteger(revision))throw Error("INVALID_WORKSPACE_REVISION");
 const path=process.env.COOK_HISTORICAL_WORKSPACE_DB??resolve(".cook-system","historical-workspace","workspace.sqlite");
 store=openHistoricalWorkspaceStore(path);
 if(command==="list"){const current=store.load();console.log(JSON.stringify({revision:current.revision,revisions:store.listRevisions()},null,2));}
 if(command==="save"){
  const bytes=await readBoundedRegularFile(arg,WORKSPACE_MAX_BYTES);
  const input=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));
  const result=store.save(input,{expectedRevision:revision});
  console.log(JSON.stringify({status:result.status,revision:result.revision,digest:result.digest}));
 }
 if(command==="export"){
  const result=store.load(revision);
  await writeFile(arg,JSON.stringify(result.workspace),{flag:"wx",mode:0o600});
  console.log(JSON.stringify({status:"EXPORTED",revision:result.revision}));
 }
}catch(e){console.error(e.message);process.exitCode=1;}
finally{store?.close();}
