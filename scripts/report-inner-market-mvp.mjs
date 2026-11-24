import { readFileSync } from "node:fs";
import { buildHistoricalMvpReport } from "../src/inner-market/historical-mvp-report.mjs";

try {
  const path=process.argv[2]??new URL("../fixtures/synthetic/inner-market-mvp.json",import.meta.url);
  const report=buildHistoricalMvpReport(JSON.parse(readFileSync(path,"utf8")));
  process.stdout.write(JSON.stringify(report,null,2)+"\n");
  if(report.status!=="REPORT_READY")process.exitCode=2;
}catch(error){
  process.stderr.write("MVP input rejected: "+error.message+"\n");
  process.exitCode=1;
}
