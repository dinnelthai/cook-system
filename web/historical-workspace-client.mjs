/** Local historical workspace transport; no retry of ambiguous writes. */
export async function requestHistoricalWorkspace({fetcher=fetch,method="GET",workspace,expectedRevision,revisions=false}={}){
 const path="/api/historical-workspace"+(revisions?"/revisions":"");
 const options={method,cache:"no-store",signal:AbortSignal.timeout(30000)};
 if(method==="POST"){options.headers={"Content-Type":"application/json"};options.body=JSON.stringify({workspace,expectedRevision});}
 const response=await fetcher(path,options);
 const body=await response.json();
 if(!response.ok)throw Error(typeof body?.code==="string"?body.code:"WORKSPACE_UNAVAILABLE");
 if(revisions){if(!Array.isArray(body?.revisions))throw Error("INVALID_WORKSPACE_RESPONSE");}
 else if(!Number.isSafeInteger(body?.revision)||body.revision<0||method==="GET"&&!body.workspace||method==="POST"&&!["SAVED","ALREADY_PRESENT"].includes(body.status))throw Error("INVALID_WORKSPACE_RESPONSE");
 return body;
}
