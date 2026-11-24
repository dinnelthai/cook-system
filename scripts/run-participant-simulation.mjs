import {writeFile} from "node:fs/promises";
import {runParticipantSimulation} from "../src/simulation/participant-simulator.mjs";
const [output="participant-simulation.json",seedText="42",stepsText="240"]=process.argv.slice(2);
try{
 const seed=Number(seedText),steps=Number(stepsText),result=runParticipantSimulation({seed,steps});
 await writeFile(output,JSON.stringify(result,null,2)+"\n",{flag:"wx",mode:0o600});
 console.log(JSON.stringify({status:result.status,output,summary:result.summary,execution_enabled:false},null,2));
}catch(error){console.error("Simulation failed:",error.message);process.exitCode=1;}
