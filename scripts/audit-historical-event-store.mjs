import {createHistoricalEventStore} from "../src/core/historical-event-store.mjs";
const [directory,...extra]=process.argv.slice(2);
if(!directory||extra.length){console.error("Usage: node scripts/audit-historical-event-store.mjs <private-store-directory>");process.exitCode=1;}
else try{
 const report=await createHistoricalEventStore(directory).audit();
 console.log(JSON.stringify(report,null,2));
 process.exitCode=report.status==="REVIEW_REQUIRED"?3:report.status==="EMPTY"?2:0;
}catch(e){console.error("Historical archive audit rejected:",e.name);process.exitCode=1;}
