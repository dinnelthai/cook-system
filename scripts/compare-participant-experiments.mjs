import {writeFile} from "node:fs/promises";
import {readBoundedRegularFile} from "../src/core/bounded-private-file.mjs";
import {compareParticipantExperiments} from "../src/simulation/participant-experiment-artifact.mjs";
try{
 const [baseline,candidate,output]=process.argv.slice(2);
 if(!baseline||!candidate||!output)throw Error("BASELINE_CANDIDATE_OUTPUT_REQUIRED");
 const read=async p=>JSON.parse((await readBoundedRegularFile(p,4*1024*1024)).toString("utf8"));
 const v=compareParticipantExperiments(await read(baseline),await read(candidate));
 await writeFile(output,JSON.stringify(v,null,2)+"\n",{flag:"wx",mode:0o600});
 console.log(JSON.stringify({status:v.status,changed_cases:v.changed_cases.length,output}));
 if(!["DECLARED_UNCHANGED","DECLARED_RECOVERY"].includes(v.status))process.exitCode=1;
}catch(e){console.error(e.message);process.exitCode=1;}
