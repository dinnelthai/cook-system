import {writeFile} from "node:fs/promises";
import {runParticipantSimulation} from "../src/simulation/participant-simulator.mjs";
import {reviewParticipantObservationCoverage} from "../src/simulation/participant-observation-model.mjs";
try{
 const [output="participant-coverage.json"]=process.argv.slice(2);
 const report=runParticipantSimulation({scenarioId:"observer-coverage",seed:42,steps:240});
 const r=reviewParticipantObservationCoverage(report,{seed:42});
 await writeFile(output,JSON.stringify(r,null,2)+"\n",{flag:"wx",mode:0o600});
 console.log(JSON.stringify({status:r.status,observer_count:r.observer_count,checkpoint_count:r.checkpoint_count,output,execution_enabled:false}));
}catch(e){console.error(e.message);process.exitCode=1;}
