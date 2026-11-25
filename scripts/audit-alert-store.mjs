import {createAlertStore} from "../src/risk/alert-store.mjs";
const [path]=process.argv.slice(2);
if(!path){console.error("Usage: node scripts/audit-alert-store.mjs <private-alert-journal.jsonl>");process.exitCode=2;}
else try{console.log(JSON.stringify(await createAlertStore(path).audit(),null,2));}
catch(error){console.error("Alert journal audit rejected:",error.message);process.exitCode=1;}
