import {benchmarkProjectReplay} from "../src/inner-market/project-replay-benchmark.mjs";
try{
 const result=benchmarkProjectReplay({revisions:Number(process.argv[2]??1000),repeats:Number(process.argv[3]??3)});
 console.log(JSON.stringify(result,null,2));if(result.status!=="PASS")process.exitCode=1;
}catch(e){console.error(e.message);process.exitCode=1;}
