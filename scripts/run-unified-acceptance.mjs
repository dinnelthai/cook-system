import {spawnSync} from "node:child_process";
import {readdir,mkdir,writeFile,mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join,resolve,relative,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {createRequire} from "node:module";
import {readBoundedRegularFile} from "../src/core/bounded-private-file.mjs";
import {auditLocalReadAcceptance} from "../src/inner-market/local-read-acceptance.mjs";
import {resolveLocalFeatureFlags} from "../src/core/local-feature-flags.mjs";
const root=resolve(fileURLToPath(new URL("../",import.meta.url)));
const require=createRequire(import.meta.url);
const checks=[],operatorGates=[];
function git(args){const r=spawnSync("git",args,{cwd:root,encoding:"utf8",maxBuffer:4*1024*1024});return r.status===0?String(r.stdout).trim():null;}
function add(id,status,summary,details={}){checks.push({id,status,summary,...details});}
function command(id,args,{timeout=300000}={}){
 const started=Date.now(),r=spawnSync(process.execPath,args,{cwd:root,encoding:"utf8",timeout,maxBuffer:64*1024*1024,windowsHide:true});
 const out=String(r.stdout??""),err=String(r.stderr??""),summaryLines=(out+"\n"+err).split("\n").filter(s=>/# (tests|pass|fail|skipped)\b|schema validation|valid schemas|held-out|status:|error:|Error:/.test(s)).slice(-16);
 const ok=!r.error&&r.status===0;
 add(id,ok?"PASS":"FAIL",ok?"Command completed successfully":"Command failed",{
  command:[process.execPath,...args],exit_code:r.status??null,signal:r.signal??null,duration_ms:Date.now()-started,
  summary:summaryLines.map(s=>s.slice(0,300)),...(r.error?{runner_error:r.error.code??r.error.name}:{})
 });
 return {ok,out,err};
}
async function walk(dir){
 let result=[];for(const e of await readdir(dir,{withFileTypes:true})){const p=join(dir,e.name);if(e.isDirectory())result=result.concat(await walk(p));else if(e.isFile()&&p.endsWith(".mjs"))result.push(p);}return result;
}
function parseCount(out,key){const m=out.match(new RegExp("# "+key+" (\\d+)"));return m?Number(m[1]):null;}
async function main(){
 const started=new Date().toISOString(),nodeMajor=Number(process.versions.node.split(".")[0]);
 add("node_runtime",nodeMajor>=22?"PASS":"FAIL",nodeMajor>=22?"Node.js 22+ detected":"Node.js 22+ is required",{node_version:process.versions.node});
 const pkg=JSON.parse(await (await import("node:fs/promises")).readFile(join(root,"package.json"),"utf8"));
 const lock=JSON.parse(await (await import("node:fs/promises")).readFile(join(root,"package-lock.json"),"utf8"));
 add("package_lock",lock.lockfileVersion===3?"PASS":"FAIL",lock.lockfileVersion===3?"npm lockfile v3 present":"Expected package-lock v3",{lockfile_version:lock.lockfileVersion});
 const missing=[];for(const name of ["@solana/web3.js","@pump-fun/pump-sdk/swap","bn.js","ws"]){try{require.resolve(name)}catch{missing.push(name)}}
 add("runtime_dependencies",missing.length?"FAIL":"PASS",missing.length?"Missing installed dependencies; run npm ci":"Pinned runtime dependencies resolve",{missing});
 const flags=resolveLocalFeatureFlags({});
 add("execution_defaults",!flags.faucet&&!flags.transfer&&!flags.trading?"PASS":"FAIL","All local money-moving capabilities must default off",{defaults:flags});
 const files=[];for(const dir of ["src","scripts","test","web"])files.push(...await walk(join(root,dir)));
 let syntaxFailures=[];for(const file of files){const r=spawnSync(process.execPath,["--check",file],{cwd:root,encoding:"utf8",timeout:15000,windowsHide:true});if(r.status!==0)syntaxFailures.push({file:relative(root,file),exit_code:r.status,detail:String(r.stderr??"").split("\n").slice(0,3).join(" ").slice(0,300)});}
 add("module_syntax",syntaxFailures.length?"FAIL":"PASS",syntaxFailures.length?"One or more JavaScript modules failed node --check":"All tracked source-area .mjs files parsed",{module_count:files.length,failures:syntaxFailures.slice(0,20)});
 const hygiene=command("repository_hygiene",["scripts/audit-repository-hygiene.mjs"]);
 let hygieneResult=null;try{hygieneResult=JSON.parse(hygiene.out)}catch{}
 if(hygieneResult)add("repository_hygiene_detail",hygieneResult.findings.length?"FAIL":"PASS","High-confidence current-tree secret scan",{tracked_file_count:hygieneResult.tracked_file_count,scanned_text_file_count:hygieneResult.scanned_text_file_count,findings:hygieneResult.findings});
 const test=command("unit_and_integration_tests",["--test"]);
 if(test.ok)add("test_count","PASS","Automated test summary",{tests:parseCount(test.out,"tests"),passed:parseCount(test.out,"pass"),failed:parseCount(test.out,"fail"),skipped:parseCount(test.out,"skipped")});
 command("json_schema_registry",["scripts/validate-json-schemas.mjs"]);
 const temp=await mkdtemp(join(tmpdir(),"cook-unified-acceptance-"));
 try{
  const evalPath=join(temp,"heldout.json");
  const heldout=command("heldout_synthetic_regression",["scripts/run-heldout-defensive-evaluation.mjs",evalPath,"901,902,903"]);
  if(heldout.ok){try{const data=JSON.parse(await (await import("node:fs/promises")).readFile(evalPath,"utf8"));add("heldout_contract_detail",data.status==="SYNTHETIC_REGRESSION_ONLY"?"PASS":"FAIL","Synthetic regression only; not a real-market accuracy benchmark",{case_count:data.case_count,metrics:data.metrics,real_market_accuracy_claimed:data.real_market_accuracy_claimed});}catch{add("heldout_contract_detail","FAIL","Held-out artifact could not be parsed");}}
 }finally{await rm(temp,{recursive:true,force:true});}
 const evidencePath=process.env.COOK_ACCEPT_EVIDENCE,rpc=process.env.COOK_ACCEPT_RPC,genesis=process.env.COOK_ACCEPT_GENESIS;
 if(evidencePath&&rpc&&genesis){
  try{const bytes=await readBoundedRegularFile(resolve(root,evidencePath),16*1024*1024);const evidence=JSON.parse(bytes.toString("utf8"));const result=await auditLocalReadAcceptance({endpoint:rpc,expectedGenesisHash:genesis,range:evidence.range,receiptSamples:evidence.receiptSamples,reportInput:evidence.reportInput});
   add("localnet_read_only_preflight",result.status==="READ_PREFLIGHT_PASS"?"PASS":result.status==="PARTIAL"?"PARTIAL":"REVIEW_REQUIRED","Read-only Localnet preflight; no transactions submitted",{result});
  }catch{add("localnet_read_only_preflight","REVIEW_REQUIRED","Localnet preflight failed; inspect the operator's local evidence and endpoint configuration");}
 }else add("localnet_read_only_preflight","NOT_RUN","Set COOK_ACCEPT_RPC, COOK_ACCEPT_GENESIS and COOK_ACCEPT_EVIDENCE to opt into read-only local RPC checks",{required_environment:["COOK_ACCEPT_RPC","COOK_ACCEPT_GENESIS","COOK_ACCEPT_EVIDENCE"]});
 const gates=[
  ["browser_ui","NOT_RUN","Operator must open the terminal in a real browser and inspect all pages, console errors and disabled controls."],
  ["wallet_key_custody","NOT_RUN","Operator must inspect OS file permissions and verify API responses never expose key material."],
  ["wallet_transfer_confirmation","NOT_RUN","No transfer is submitted by this runner; use only a disposable localnet wallet after explicit approval."],
  ["historical_financial_parity","NOT_RUN","Compare closed-interval balances, fees, inventory, basis and NAV against independent chain evidence."],
  ["mainnet_archive_fixtures","NOT_RUN","Pump/PumpSwap and Raydium archive replay parity needs real confirmed receipts."],
  ["performance_soak","NOT_RUN","Run operator-controlled soak/load tests; CI does not establish production capacity."],
  ["credential_rotation","NOT_VERIFIED","A current-tree scan cannot rotate credentials or erase leaked Git history."]
 ];
 for(const [id,status,summary] of gates)operatorGates.push({id,status,summary});
 const failed=checks.filter(c=>c.status==="FAIL"||c.status==="REVIEW_REQUIRED");
 const pass=checks.filter(c=>c.status==="PASS").length;
 const report={schema_version:"cook-unified-acceptance.1",started_at:started,completed_at:new Date().toISOString(),
  repository:{commit:git(["rev-parse","HEAD"]),branch:git(["branch","--show-current"]),working_tree_dirty:git(["status","--porcelain"])?.length>0??null},
  environment:{node:process.versions.node,platform:process.platform,arch:process.arch},
  overall_status:failed.length?"FAILED":"CODE_CHECKS_PASS_OPERATOR_ACCEPTANCE_PENDING",
  summary:{passed:pass,failed:failed.length,not_run:checks.filter(c=>c.status==="NOT_RUN").length,operator_gates_pending:operatorGates.length},
  checks,operator_gates:operatorGates,
  safety_boundary:"This runner never starts or resets a validator, requests an airdrop, signs or submits a transaction, or sends a live order. Synthetic checks are not evidence of real-market accuracy or chain parity."};
 const out=process.argv[2]?resolve(root,process.argv[2]):join(root,".cook-system","acceptance","unified-acceptance-"+new Date().toISOString().replace(/[:.]/g,"-")+".json");
 await mkdir(dirname(out),{recursive:true});await writeFile(out,JSON.stringify(report,null,2)+"\n",{flag:"wx",mode:0o600});
 const testSummary=checks.find(c=>c.id==="test_count");
 process.stdout.write(JSON.stringify({overall_status:report.overall_status,passed:pass,failed:failed.length,tests:testSummary?.tests??null,test_failures:testSummary?.failed??null,report_path:relative(root,out),operator_gates_pending:operatorGates.length},null,2)+"\\n");
 if(failed.length)process.exitCode=1;
}
main().catch(error=>{process.stderr.write("Unified acceptance runner failed: "+(error.code??error.name)+"\n");process.exitCode=1;});
