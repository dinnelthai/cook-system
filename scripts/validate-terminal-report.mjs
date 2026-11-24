import {readFile} from "node:fs/promises";
import {buildTerminalState} from "../src/inner-market/terminal-state.mjs";
const path=process.argv[2];
if(!path){console.error("Usage: node scripts/validate-terminal-report.mjs <normalized-report.json>");process.exitCode=1;}
else{
 try{
  const input=JSON.parse(await readFile(path,"utf8"));
  const state=buildTerminalState(input);
  console.log(JSON.stringify(state,null,2));
  process.exitCode=state.settlement_allowed?0:2;
 }catch(error){console.error("Report rejected:",error.name);process.exitCode=1;}
}
