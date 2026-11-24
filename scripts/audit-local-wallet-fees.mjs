import {readFileSync} from "node:fs";
import {auditLocalNetworkFees} from "../src/inner-market/local-wallet-accounting.mjs";
try {
  const [configPath,receiptPath]=process.argv.slice(2);
  if(!configPath||!receiptPath)throw new Error("Usage: node scripts/audit-local-wallet-fees.mjs CONFIG.json RECEIPTS.json");
  const config=JSON.parse(readFileSync(configPath,"utf8"));
  const payload=JSON.parse(readFileSync(receiptPath,"utf8"));
  const report=auditLocalNetworkFees({...payload,config});
  console.log(JSON.stringify(report,null,2));
  if(report.status!=="RECONCILED")process.exitCode=2;
}catch(e){console.error(e.message);process.exitCode=1}
