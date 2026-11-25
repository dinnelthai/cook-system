import {sanitizeDiagnosticSnapshot} from "./diagnostic-log.mjs";
const groups=new Set(["projects","historical_workspace","terminal","local_wallet","static","rejected","unknown"]);
const methods=new Set(["GET","POST","HEAD","OPTIONS","OTHER"]);
const validTime=v=>typeof v==="string"&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v)&&Number.isFinite(Date.parse(v));
export function sanitizeHttpDiagnostics(s){
 if(!s||s.schema_version!=="cook-http-diagnostics.1"||s.mode!=="LOCAL_ONLY"||s.execution_enabled!==false||!Number.isSafeInteger(s.dropped_count)||s.dropped_count<0||!Array.isArray(s.entries)||s.entries.length>10000)throw Error("INVALID_HTTP_DIAGNOSTICS");
 let previous=0;
 const entries=s.entries.map(r=>{
  if(!r||!Number.isSafeInteger(r.sequence)||r.sequence<=previous||!validTime(r.time)||!groups.has(r.route_group)||!methods.has(r.method)||!["FINISHED","DISCONNECTED"].includes(r.outcome)||
  (r.outcome==="FINISHED"?(!Number.isInteger(r.status_code)||r.status_code<100||r.status_code>599):r.status_code!==null)||
  (r.duration_ms!==null&&(!Number.isSafeInteger(r.duration_ms)||r.duration_ms<0)))throw Error("INVALID_HTTP_DIAGNOSTIC_ROW");
  previous=r.sequence;return {sequence:r.sequence,time:r.time,route_group:r.route_group,method:r.method,status_code:r.status_code,outcome:r.outcome,duration_ms:r.duration_ms};
 });
 return {schema_version:"cook-http-diagnostics.1",mode:"LOCAL_ONLY",persistence_status:"MEMORY_ONLY",dropped_count:s.dropped_count,entries,execution_enabled:false};
}
export function sanitizeDiagnosticBundle(s){
 if(!s||s.schema_version!=="cook-diagnostic-bundle.1"||!["AVAILABLE","UNAVAILABLE"].includes(s.server_status))throw Error("INVALID_DIAGNOSTIC_BUNDLE");
 if(s.server_status==="UNAVAILABLE"&&s.server!==null)throw Error("INVALID_DIAGNOSTIC_BUNDLE");
 return {schema_version:"cook-diagnostic-bundle.1",browser:sanitizeDiagnosticSnapshot(s.browser),server_status:s.server_status,server:s.server_status==="AVAILABLE"?sanitizeHttpDiagnostics(s.server):null,execution_enabled:false};
}
export async function collectDiagnosticBundle(browser,{fetchImpl=globalThis.fetch,timeoutMs=2000}={}){
 const clean=sanitizeDiagnosticSnapshot(browser);let server=null;
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
 try{
  const response=await fetchImpl("/api/terminal/diagnostics",{method:"GET",cache:"no-store",redirect:"error",signal:controller.signal});
  if(!response.ok||!response.body)throw Error("HTTP_DIAGNOSTICS_UNAVAILABLE");
  const reader=response.body.getReader(),decoder=new TextDecoder("utf-8",{fatal:true});let bytes=0,raw="";
  try{for(;;){const {value,done}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>4*1024*1024)throw Error("HTTP_DIAGNOSTICS_LIMIT");raw+=decoder.decode(value,{stream:true});}raw+=decoder.decode();}
  finally{await reader.cancel().catch(()=>{});}
  server=sanitizeHttpDiagnostics(JSON.parse(raw));
 }catch{}finally{clearTimeout(timer);}
 return {schema_version:"cook-diagnostic-bundle.1",browser:clean,server_status:server?"AVAILABLE":"UNAVAILABLE",server,execution_enabled:false};
}
