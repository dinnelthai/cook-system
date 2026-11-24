import {writeFile} from "node:fs/promises";
import {runHeldOutDefensiveEvaluation} from "../src/simulation/defensive-evaluation.mjs";
const [output="heldout-defensive-evaluation.json",seedText="701,702,703,704,705"]=process.argv.slice(2);
try{const seeds=seedText.split(",").map(Number),report=runHeldOutDefensiveEvaluation({seeds});
 await writeFile(output,JSON.stringify(report,null,2)+"\n",{flag:"wx",mode:0o600});
 console.log(JSON.stringify({status:report.status,output,case_count:report.case_count,metrics:report.metrics},null,2));
}catch(error){console.error("Held-out evaluation failed:",error.message);process.exitCode=1;}
