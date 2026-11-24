import {rebuildHistoricalEventIndex} from "../src/core/historical-event-index.mjs";
const [directory]=process.argv.slice(2);
if(!directory||process.argv.length!==3){console.error("Usage: node scripts/rebuild-historical-event-index.mjs <private-store-directory>");process.exitCode=2;}
else try{const report=await rebuildHistoricalEventIndex(directory);console.log(JSON.stringify(report,null,2));}
catch(error){console.error("Historical event index rebuild rejected:",error.message);process.exitCode=1;}
