import {spawnSync} from "node:child_process";
import {readFile,lstat} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {resolve,relative} from "node:path";
const root=resolve(fileURLToPath(new URL("../",import.meta.url)));
const secretPatterns=[
 ["PRIVATE_KEY_PEM",/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
 ["GITHUB_TOKEN",/\bgh[pousr]_[A-Za-z0-9]{30,}\b/g],
 ["SLACK_TOKEN",/\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g],
 ["AWS_ACCESS_KEY",/\bAKIA[0-9A-Z]{16}\b/g],
 ["OPENAI_API_KEY",/\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/g],
 ["GOOGLE_API_KEY",/\bAIza[0-9A-Za-z_-]{35}\b/g],
 ["TELEGRAM_BOT_TOKEN",/\b\d{8,12}:[A-Za-z0-9_-]{30,}\b/g],
 ["NPM_TOKEN",/\bnpm_[A-Za-z0-9]{30,}\b/g]
];
const sensitivePath=/(^|\/)\.env(?:\..*)?$|(^|\/)(?:id_rsa|id_ed25519)$|\.(?:pem|p12|pfx|keystore)$/i;
export function scanSecretMarkers(content){
 const findings=[];
 for(const [kind,pattern] of secretPatterns){pattern.lastIndex=0;let match;while((match=pattern.exec(content))!==null){const line=content.slice(0,match.index).split("\n").length;findings.push({kind,line});if(pattern.lastIndex===match.index)pattern.lastIndex++;}}
 return findings;
}
function git(args){const r=spawnSync("git",args,{cwd:root,encoding:"utf8",maxBuffer:16*1024*1024});if(r.error||r.status!==0)throw Error("GIT_TRACKED_FILE_LIST_UNAVAILABLE");return r.stdout;}
async function main(){
 const paths=git(["ls-files","-z"]).split("\0").filter(Boolean),findings=[];let scanned=0,tooLarge=0;
 for(const path of paths){
  if(path===".env.example")continue;
  if(sensitivePath.test(path)){findings.push({path,kind:"SENSITIVE_TRACKED_PATH",line:null});continue;}
  let st;try{st=await lstat(resolve(root,path));}catch{continue;}
  if(!st.isFile()||st.isSymbolicLink())continue;
  if(st.size>5*1024*1024){tooLarge++;continue;}
  let content;try{content=await readFile(resolve(root,path),"utf8");}catch{continue;}
  if(content.includes("\0"))continue;
  scanned++;
  for(const f of scanSecretMarkers(content))findings.push({path,kind:f.kind,line:f.line});
 }
 const result={schema_version:"cook-repository-hygiene.1",status:findings.length?"REVIEW_REQUIRED":"PASS_CURRENT_TRACKED_TREE_ONLY",tracked_file_count:paths.length,scanned_text_file_count:scanned,oversized_file_count:tooLarge,findings,git_history_scanned:false,ignored_local_files_scanned:false,limitation:"This checks only the current tracked working tree for high-confidence secret markers and sensitive paths. It does not inspect Git history, ignored files, external secret stores, or prove that credentials have been rotated."};
 process.stdout.write(JSON.stringify(result,null,2)+"\n");
 if(findings.length)process.exitCode=1;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
