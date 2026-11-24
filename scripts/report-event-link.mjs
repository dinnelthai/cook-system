import {readFile,stat} from "node:fs/promises";
import {createHistoricalEventStore} from "../src/core/historical-event-store.mjs";
import {archiveReportEventLink,verifyReportEventLink} from "../src/inner-market/report-event-link.mjs";
async function bounded(path,max){
 const info=await stat(path);if(!info.isFile()||info.size>max)throw Error("FILE_SIZE_INVALID");
 const data=await readFile(path);if(data.length>max)throw Error("FILE_SIZE_INVALID");return data;
}
const [action,reportPath,directory,manifestPath,...extra]=process.argv.slice(2);
if(!["archive","verify"].includes(action)||!reportPath||!directory||extra.length||(action==="verify")!==Boolean(manifestPath)){
 console.error("Usage: node scripts/report-event-link.mjs archive <report.json> <private-store-dir>\n       node scripts/report-event-link.mjs verify <report.json> <private-store-dir> <manifest.json>");
 process.exitCode=2;
}else try{
 const bytes=await bounded(reportPath,16*1024*1024),store=createHistoricalEventStore(directory);
 const result=action==="archive"?await archiveReportEventLink(bytes,store):await verifyReportEventLink(bytes,JSON.parse((await bounded(manifestPath,16384)).toString("utf8")),store);
 console.log(JSON.stringify(result,null,2));
}catch(e){console.error("Report event link rejected:",e.name);process.exitCode=1;}
