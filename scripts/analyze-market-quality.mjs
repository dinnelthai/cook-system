import {readFile,writeFile} from "node:fs/promises";
import {analyzeMarketQuality} from "../src/core/market-quality-engine.mjs";
const [inputPath,outputPath]=process.argv.slice(2);
if(!inputPath){console.error("Usage: node scripts/analyze-market-quality.mjs <events-and-evidence.json> [output.json]");process.exitCode=2;}
else try{
 const input=JSON.parse(await readFile(inputPath,"utf8")),report=analyzeMarketQuality(input);
 const output=JSON.stringify(report,null,2)+"\n";
 if(outputPath)await writeFile(outputPath,output,{flag:"wx",mode:0o600});else process.stdout.write(output);
}catch(error){console.error("Market quality analysis rejected:",error.message);process.exitCode=1;}
