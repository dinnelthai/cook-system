import {readFile,stat} from "node:fs/promises";
import {createHistoricalEventStore} from "../src/core/historical-event-store.mjs";
const [directory,inputPath]=process.argv.slice(2);
if(!directory||!inputPath||process.argv.length!==4){
 console.error("Usage: node scripts/archive-historical-events.mjs <private-store-directory> <normalized-scope-and-events.json>");
 process.exitCode=2;
}else{
 try{
  const info=await stat(inputPath);if(!info.isFile()||info.size>32*1024*1024)throw Error("invalid input file");
  const bytes=await readFile(inputPath);if(bytes.length>32*1024*1024)throw Error("input too large");
  const batch=await createHistoricalEventStore(directory).put(JSON.parse(bytes.toString("utf8")));
  console.log(JSON.stringify({batch_id:batch.batch_id,event_count:batch.events.length,issues:batch.issues,source_attestation:batch.source_attestation,history_complete:batch.history_complete,execution_enabled:false},null,2));
 }catch(e){console.error("Historical archive rejected:",e.name);process.exitCode=1;}
}
