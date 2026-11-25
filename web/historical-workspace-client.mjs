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

/** Read-only POST avoids placing potentially private project keys in URLs. */
export async function queryHistoricalWorkspace(query,{fetcher=fetch}={}){
 const response=await fetcher("/api/historical-workspace/query",{method:"POST",cache:"no-store",signal:AbortSignal.timeout(30000),headers:{"Content-Type":"application/json"},body:JSON.stringify(query)});
 const body=await response.json();
 if(!response.ok)throw Error(typeof body?.code==="string"?body.code:"WORKSPACE_UNAVAILABLE");
 if(body?.schema_version!=="cook-historical-workspace-query.1"||body.revision!==query.revision||body.kind!==query.kind||body.execution_enabled!==false||body.settlement_allowed!==false||body.source_attestation!=="UNKNOWN")throw Error("INVALID_WORKSPACE_QUERY_RESPONSE");
 return body;
}
