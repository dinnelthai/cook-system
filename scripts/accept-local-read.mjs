import {open} from "node:fs/promises";
import {constants} from "node:fs";
import {auditLocalReadAcceptance} from "../src/inner-market/local-read-acceptance.mjs";
const [inputPath,...extra]=process.argv.slice(2);
if(!inputPath||extra.length){console.error("Usage: COOK_ACCEPT_RPC=http://127.0.0.1:8899 COOK_ACCEPT_GENESIS=<operator-pin> node scripts/accept-local-read.mjs <private-evidence.json>");process.exitCode=1;}
else try{
 const f=await open(inputPath,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
 let bytes;try{const info=await f.stat();if(!info.isFile()||info.size>16*1024*1024)throw Error("INVALID_EVIDENCE_FILE");bytes=await f.readFile();if(bytes.length>16*1024*1024)throw Error("INVALID_EVIDENCE_FILE");}finally{await f.close();}
 const {range,receiptSamples,reportInput}=JSON.parse(bytes.toString("utf8"));
 const r=await auditLocalReadAcceptance({endpoint:process.env.COOK_ACCEPT_RPC,expectedGenesisHash:process.env.COOK_ACCEPT_GENESIS,range,receiptSamples,reportInput});
 console.log(JSON.stringify(r,null,2));
 process.exitCode=r.status==="REVIEW_REQUIRED"?3:r.status==="PARTIAL"?2:0;
}catch{console.error("Local read acceptance rejected");process.exitCode=1;}
