import {readFile,stat} from "node:fs/promises";
import {auditArchivedCashPostings} from "../src/inner-market/archived-cash-crosscheck.mjs";
const [path]=process.argv.slice(2);
if(!path||process.argv.length!==3){console.error("Usage: node scripts/audit-archived-cash.mjs <cash-evidence.json>");process.exitCode=2;}
else try{
 const info=await stat(path);if(!info.isFile()||info.size>32*1024*1024)throw Error("invalid input");
 const bytes=await readFile(path);if(bytes.length>32*1024*1024)throw Error("input too large");
 const result=auditArchivedCashPostings(JSON.parse(bytes.toString("utf8")));
 console.log(JSON.stringify(result,null,2));process.exitCode=result.status==="AMOUNTS_INTERNALLY_CONSISTENT"?0:2;
}catch(e){console.error("Archived cash audit rejected:",e.name);process.exitCode=1;}
