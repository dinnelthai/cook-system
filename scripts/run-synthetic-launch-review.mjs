import {readFileSync} from "node:fs";
import {reviewSyntheticLaunchBatch} from "../src/inner-market/synthetic-launch-review.mjs";
try{
 const [file,seed="42",runs="10"]=process.argv.slice(2);
 if(!file)throw Error("Usage: node scripts/run-synthetic-launch-review.mjs <synthetic-creation-markers.json> [seed] [runs]");
 const records=JSON.parse(readFileSync(file,"utf8"));
 const base=JSON.parse(readFileSync(new URL("../fixtures/synthetic/inner-market-mvp.json",import.meta.url),"utf8"));
 const result=reviewSyntheticLaunchBatch({records,base,seed:Number(seed),runs:Number(runs)});
 console.log(JSON.stringify(result,null,2));
 if(result.results.some(r=>r.status==="REVIEW_REQUIRED"))process.exitCode=2;
}catch(e){console.error(e.message);process.exitCode=1;}
