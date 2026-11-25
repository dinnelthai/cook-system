import {writeFile} from "node:fs/promises";
import {runParticipantSimulation} from "../src/simulation/participant-simulator.mjs";
import {reviewParticipantStates} from "../src/simulation/participant-state-review.mjs";
try{
 const [output="participant-state-review.json"]=process.argv.slice(2);
 const report=runParticipantSimulation({scenarioId:"participant-state-qa",seed:42,steps:240});
 const v=reviewParticipantStates(report);
 await writeFile(output,JSON.stringify(v,null,2)+"\n",{flag:"wx",mode:0o600});
 console.log(JSON.stringify({status:v.status,checkpoint_count:v.checkpoints.length,output,execution_enabled:false}));
 if(v.status!=="INTERNALLY_CONSISTENT")process.exitCode=1;
}catch(e){console.error(e.message);process.exitCode=1;}
