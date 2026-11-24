import {readFile,stat} from "node:fs/promises";
import {buildTerminalState} from "../src/inner-market/terminal-state.mjs";
const [path,...extra]=process.argv.slice(2),limit=16*1024*1024;
if(!path||extra.length){console.error("Usage: node scripts/validate-terminal-report.mjs <normalized-report.json>");process.exitCode=1;}
else try{
 const info=await stat(path);if(!info.isFile()||info.size>limit)throw Error("REPORT_SIZE_INVALID");
 const bytes=await readFile(path);if(bytes.length>limit)throw Error("REPORT_SIZE_INVALID");
 const state=buildTerminalState(JSON.parse(bytes.toString("utf8")));
 console.log(JSON.stringify(state,null,2));
 // 0: synthetic review only; 2: internally ready but no settlement;
 // 3: review required (including contradictory candle evidence); 1: invalid.
 process.exitCode=state.status!=="REPORT_READY"||state.candles.status==="REVIEW"?3:state.settlement_allowed?0:2;
}catch(error){console.error("Report rejected:",error.name);process.exitCode=1;}
