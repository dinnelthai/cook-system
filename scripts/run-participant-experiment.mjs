import {readFileSync} from "node:fs";
import {runParticipantExperiment} from "../src/inner-market/participant-experiment.mjs";
try {
 const [seed="42",runs="100"]=process.argv.slice(2);
 const base=JSON.parse(readFileSync(new URL("../fixtures/synthetic/inner-market-mvp.json",import.meta.url),"utf8"));
 const report=runParticipantExperiment({base,seed:Number(seed),runs:Number(runs)});
 console.log(JSON.stringify(report,null,2));
 if(report.total_matches!==report.total_trials)process.exitCode=2;
}catch(e){console.error(e.message);process.exitCode=1}
