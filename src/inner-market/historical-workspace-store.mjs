import {DatabaseSync} from "node:sqlite";
import {lstatSync,mkdirSync,openSync,closeSync,realpathSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {createHash} from "node:crypto";
import {canonicalJson} from "../core/canonical-json.mjs";
import {restoreHistoricalWorkspace,exportHistoricalWorkspace,WORKSPACE_MAX_BYTES} from "./historical-project-workspace.mjs";
import {createHistoricalProjectCatalogue} from "./historical-project-catalogue.mjs";

const MAX_REVISIONS=32,MAX_TOTAL_BYTES=128*1024*1024;
const hash=text=>createHash("sha256").update(text,"utf8").digest("hex");
const empty=()=>exportHistoricalWorkspace(createHistoricalProjectCatalogue());
const validRevision=n=>Number.isSafeInteger(n)&&n>=0;
function privateDatabasePath(path){
 if(typeof path!=="string"||!path)throw Error("INVALID_WORKSPACE_PATH");
 const target=resolve(path),parent=dirname(target);
 mkdirSync(parent,{recursive:true,mode:0o700});
 const dir=lstatSync(parent);
 if(!dir.isDirectory()||dir.isSymbolicLink()||realpathSync(parent)!==parent)throw Error("UNSAFE_WORKSPACE_DIRECTORY");
 if(process.platform!=="win32"&&(dir.mode&0o077)!==0)throw Error("WORKSPACE_DIRECTORY_NOT_PRIVATE");
 try{closeSync(openSync(target,"wx",0o600));}catch(e){if(e.code!=="EEXIST")throw e;}
 const file=lstatSync(target);
 if(!file.isFile()||file.isSymbolicLink()||(process.platform!=="win32"&&(file.mode&0o077)!==0))throw Error("UNSAFE_WORKSPACE_FILE");
 return target;
}
/** Local retrospective snapshot journal. Explicit writes only; no wallet or RPC dependency.
 * Filesystem ownership, ACLs and backups remain operator responsibilities. */
export function openHistoricalWorkspaceStore(path){
 const db=new DatabaseSync(privateDatabasePath(path));
 try{
  db.exec("PRAGMA busy_timeout=3000; PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL;");
  db.exec("CREATE TABLE IF NOT EXISTS historical_workspace_revision (revision INTEGER PRIMARY KEY CHECK(revision>0), content TEXT NOT NULL, digest TEXT NOT NULL, bytes INTEGER NOT NULL CHECK(bytes>=0));");
  const latest=db.prepare("SELECT revision,content,digest,bytes FROM historical_workspace_revision ORDER BY revision DESC LIMIT 1");
  const byRevision=db.prepare("SELECT revision,content,digest,bytes FROM historical_workspace_revision WHERE revision=?");
  const totals=db.prepare("SELECT COUNT(*) AS count, COALESCE(SUM(bytes),0) AS bytes FROM historical_workspace_revision");
  const insert=db.prepare("INSERT INTO historical_workspace_revision(revision,content,digest,bytes) VALUES(?,?,?,?)");
  function decode(row){
   if(!row)return {revision:0,digest:null,workspace:empty()};
   if(!validRevision(row.revision)||row.revision===0||typeof row.content!=="string"||Buffer.byteLength(row.content)!==row.bytes||row.bytes>WORKSPACE_MAX_BYTES||hash(row.content)!==row.digest)throw Error("WORKSPACE_INTEGRITY_FAILURE");
   const workspace=exportHistoricalWorkspace(restoreHistoricalWorkspace(JSON.parse(row.content)));
   return {revision:row.revision,digest:row.digest,workspace};
  }
  function load(revision){
   if(revision===undefined)return decode(latest.get());
   if(!validRevision(revision))throw Error("INVALID_WORKSPACE_REVISION");
   if(revision===0)return decode(null);
   const row=byRevision.get(revision);if(!row)throw Error("WORKSPACE_REVISION_NOT_FOUND");
   return decode(row);
  }
  function save(bundle,{expectedRevision}={}){
   if(!validRevision(expectedRevision))throw Error("EXPECTED_REVISION_REQUIRED");
   // Validate input and derive the normalized envelope before acquiring write lock.
   const workspace=exportHistoricalWorkspace(restoreHistoricalWorkspace(bundle));
   const content=JSON.stringify(workspace),bytes=Buffer.byteLength(content),digest=hash(content);
   if(bytes>WORKSPACE_MAX_BYTES)throw Error("WORKSPACE_SIZE_LIMIT");
   db.exec("BEGIN IMMEDIATE");
   try{
    const current=decode(latest.get());
    if(current.revision!==expectedRevision)throw Error("WORKSPACE_REVISION_CONFLICT");
    if(canonicalJson(current.workspace)===canonicalJson(workspace)){db.exec("COMMIT");return {...current,status:"ALREADY_PRESENT"};}
    const usage=totals.get();
    if(usage.count>=MAX_REVISIONS||usage.bytes+bytes>MAX_TOTAL_BYTES)throw Error("WORKSPACE_STORAGE_LIMIT");
    const revision=current.revision+1;
    insert.run(revision,content,digest,bytes);
    db.exec("COMMIT");
    return {revision,digest,workspace,status:"SAVED"};
   }catch(e){db.exec("ROLLBACK");throw e;}
  }
  return {load,save,listRevisions:()=>db.prepare("SELECT revision,digest,bytes FROM historical_workspace_revision ORDER BY revision").all(),close:()=>db.close()};
 }catch(e){db.close();throw e;}
}
