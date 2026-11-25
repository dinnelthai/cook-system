import {performance} from "node:perf_hooks";
const groups=new Set(["projects","historical_workspace","terminal","local_wallet","static","rejected","unknown"]);
const methods=new Set(["GET","POST","HEAD","OPTIONS"]);
export function classifyDiagnosticRoute(path){
 if(typeof path!=="string")return "unknown";
 if(path==="/api/projects"||path.startsWith("/api/projects/"))return "projects";
 if(path==="/api/historical-workspace"||path.startsWith("/api/historical-workspace/"))return "historical_workspace";
 if(path.startsWith("/api/terminal/"))return "terminal";
 if(path.startsWith("/api/local-wallet/"))return "local_wallet";
 return path.startsWith("/api/")?"unknown":"static";
}
/** Local, bounded transport observations only. No URLs, query strings, headers,
 * request bodies, account IDs, error messages or stack traces are retained. */
export function createHttpDiagnostics({limit=500,clock=()=>new Date(),monotonic=()=>performance.now()}={}){
 if(!Number.isSafeInteger(limit)||limit<1||limit>10000)throw Error("INVALID_HTTP_DIAGNOSTIC_LIMIT");
 const rows=[];let sequence=0,dropped=0;
 function observe(req,res){
  let group="unknown",finished=false;const started=monotonic(),method=methods.has(req.method)?req.method:"OTHER";
  const complete=outcome=>{
   if(finished)return;finished=true;
   const status=outcome==="FINISHED"&&Number.isInteger(res.statusCode)&&res.statusCode>=100&&res.statusCode<=599?res.statusCode:null;
   const elapsed=monotonic()-started;
   rows.push({sequence:++sequence,time:clock().toISOString(),route_group:group,method,status_code:status,outcome,duration_ms:Number.isFinite(elapsed)?Math.max(0,Math.round(elapsed)):null});
   if(rows.length>limit){rows.shift();dropped++;}
  };
  res.once("finish",()=>complete("FINISHED"));
  res.once("close",()=>complete("DISCONNECTED"));
  return value=>{group=groups.has(value)?value:"unknown";};
 }
 return {observe,snapshot:()=>({schema_version:"cook-http-diagnostics.1",mode:"LOCAL_ONLY",persistence_status:"MEMORY_ONLY",dropped_count:dropped,entries:structuredClone(rows),execution_enabled:false})};
}
