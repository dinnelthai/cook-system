import {readFile,writeFile} from "node:fs/promises";
import {readBoundedRegularFile} from "../src/core/bounded-private-file.mjs";
import {buildMathReviewReport} from "../src/inner-market/math-review-report.mjs";
try{
 const [validationPath,output,historicalPath]=process.argv.slice(2);
 if(!validationPath||!output)throw Error("USAGE: node scripts/review-math-models.mjs <validation.json> <new-output.json> [historical-inputs.json]");
 const read=async path=>JSON.parse((await readBoundedRegularFile(path,16*1024*1024)).toString("utf8"));
 const financialInput=JSON.parse(await readFile(new URL("../fixtures/synthetic/inner-market-mvp.json",import.meta.url),"utf8"));
 const report=buildMathReviewReport({financialInput,validationReport:await read(validationPath),historicalReports:historicalPath?await read(historicalPath):[]});
 await writeFile(output,JSON.stringify(report,null,2)+"\n",{flag:"wx",mode:0o600});
 console.log(JSON.stringify({status:report.status,checks:report.checks,execution_enabled:false}));
 if(report.status==="REVIEW_REQUIRED")process.exitCode=1;
}catch(e){console.error(e.message);process.exitCode=1;}
