import {benchmarkProjectReplay,benchmarkProjectStore} from "../src/inner-market/project-replay-benchmark.mjs";
try{
 const sqlite=process.argv[2]==="--sqlite";
 const result=sqlite?await benchmarkProjectStore({revisions:Number(process.argv[3]??100),repeats:Number(process.argv[4]??3)}):benchmarkProjectReplay({revisions:Number(process.argv[2]??1000),repeats:Number(process.argv[3]??3)});
 console.log(JSON.stringify(result,null,2));if(result.status!=="PASS")process.exitCode=1;
}catch(e){console.error(e.message);process.exitCode=1;}
