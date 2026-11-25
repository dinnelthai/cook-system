import {createHash,randomUUID} from "node:crypto";
import {mkdir,open,link,unlink} from "node:fs/promises";
import {readBoundedRegularFile} from "./bounded-private-file.mjs";
import {join} from "node:path";
import {sanitizeDiagnosticSnapshot} from "../../web/diagnostic-log.mjs";
import {sanitizeDiagnosticBundle} from "../../web/diagnostic-bundle.mjs";
const maxBytes=8*1024*1024;
const hash=v=>createHash("sha256").update(v).digest("hex");
const readBounded=path=>readBoundedRegularFile(path,maxBytes);
export async function archiveDiagnosticSnapshot({inputPath,directory}){
 if(typeof directory!=="string"||!directory.trim())throw Error("DIAGNOSTIC_DIRECTORY_REQUIRED");
 const raw=JSON.parse((await readBounded(inputPath)).toString("utf8"));
 const bundle=raw?.schema_version==="cook-diagnostic-bundle.1";
 const snapshot=bundle?sanitizeDiagnosticBundle(raw):sanitizeDiagnosticSnapshot(raw);
 const bytes=Buffer.from(JSON.stringify(snapshot)+"\n");if(bytes.length>maxBytes)throw Error("DIAGNOSTIC_ARCHIVE_LIMIT");
 const id=hash(bytes),path=join(directory,id+".json");await mkdir(directory,{recursive:true,mode:0o700});
 const temp=join(directory,"."+randomUUID()+".diag.tmp");
 try{const f=await open(temp,"wx",0o600);try{await f.writeFile(bytes);await f.sync();}finally{await f.close();}
  try{await link(temp,path);}catch(e){if(e.code!=="EEXIST")throw e;const existing=await readBounded(path);if(!existing.equals(bytes))throw Error("DIAGNOSTIC_ARCHIVE_CONFLICT");}
 }finally{await unlink(temp).catch(e=>{if(e.code!=="ENOENT")throw e;});}
 return {schema_version:"cook-diagnostic-archive-result.1",archive_id:id,entry_count:bundle?snapshot.browser.entries.length:snapshot.entries.length,server_entry_count:bundle?(snapshot.server?.entries.length??0):0,source_attestation:"UNKNOWN",execution_enabled:false};
}
