import {readFile,stat} from "node:fs/promises";
import {auditHistoricalCoverage} from "../src/core/historical-coverage-audit.mjs";
const [inputPath]=process.argv.slice(2);
if(!inputPath||process.argv.length!==3){console.error("Usage: node scripts/audit-historical-coverage.mjs <scope-scan-and-events.json>");process.exitCode=2;}
else try{
 const info=await stat(inputPath);if(!info.isFile()||info.size>32*1024*1024)throw Error("invalid input file");
 const input=JSON.parse(await readFile(inputPath,"utf8"));
 const report=auditHistoricalCoverage(input);
 console.log(JSON.stringify(report,null,2));
 process.exitCode=report.status==="REVIEW_REQUIRED"?3:report.status==="PARTIAL"?2:0;
}catch(e){console.error("Historical coverage audit rejected:",e.name);process.exitCode=1;}
