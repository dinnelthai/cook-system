import {openHistoricalWorkspaceStore} from "./historical-workspace-store.mjs";
import {WORKSPACE_MAX_BYTES} from "./historical-project-workspace.mjs";
import {queryHistoricalWorkspace,validateHistoricalWorkspaceQuery} from "./historical-workspace-query.mjs";
/** Explicitly enabled loopback-only historical workspace API. The host server
 * must enforce Host/Origin/fetch-site restrictions before dispatch. No live operations. */
export function createHistoricalWorkspaceHandler({path,readRequestJson}){
 return async(req,res)=>{
  const send=(status,body)=>{res.writeHead(status,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});res.end(JSON.stringify(body));};
  const revisions=req.url==="/api/historical-workspace/revisions",query=req.url==="/api/historical-workspace/query";
  if(query&&(req.method!=="POST"||req.headers["content-type"]!=="application/json")){send(405,{code:"WORKSPACE_METHOD_NOT_ALLOWED"});return;}
  if(req.method!=="GET"&&(revisions||req.method!=="POST"||req.headers["content-type"]!=="application/json")){send(405,{code:"WORKSPACE_METHOD_NOT_ALLOWED"});return;}
  let input,store;
  try{
   if(req.method==="POST"){
    try{input=JSON.parse(await readRequestJson(req,query?64*1024:WORKSPACE_MAX_BYTES+1024));}
    catch(e){if(e.message==="BODY_TOO_LARGE"){send(413,{code:"BODY_TOO_LARGE"});return;}send(400,{code:"INVALID_WORKSPACE_REQUEST"});return;}
    if(query){try{validateHistoricalWorkspaceQuery(input);}catch{send(400,{code:"INVALID_WORKSPACE_QUERY"});return;}}
    else if(!input||typeof input!=="object"||Array.isArray(input)||Object.keys(input).some(k=>!["workspace","expectedRevision"].includes(k))||!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<0||!input.workspace){send(400,{code:"INVALID_WORKSPACE_REQUEST"});return;}
   }
   store=openHistoricalWorkspaceStore(path);
   if(query){send(200,queryHistoricalWorkspace(store,input));return;}
   if(req.method==="GET"){send(200,revisions?{revisions:store.listRevisions()}:store.load());return;}
   const result=store.save(input.workspace,{expectedRevision:input.expectedRevision});
   send(200,{revision:result.revision,digest:result.digest,status:result.status});
  }catch(e){
   if(["WORKSPACE_REVISION_NOT_FOUND","WORKSPACE_PROJECT_NOT_FOUND","WORKSPACE_RECORD_NOT_FOUND"].includes(e.message)){send(404,{code:e.message});return;}
   if(e.message==="WORKSPACE_REVISION_CONFLICT"){send(409,{code:e.message});return;}
   if(["WORKSPACE_STORAGE_LIMIT","WORKSPACE_SIZE_LIMIT"].includes(e.message)){send(413,{code:e.message});return;}
   if(e.message==="WORKSPACE_INTEGRITY_FAILURE"){send(422,{code:e.message});return;}
   if(req.method==="POST"&&store&&e.code===undefined){send(422,{code:"WORKSPACE_VALIDATION_FAILED"});return;}
   send(503,{code:"WORKSPACE_UNAVAILABLE"});
  }finally{store?.close();}
 };
}
