import {createHistoricalProjectCatalogue} from "./historical-project-catalogue.mjs";
const VERSION="cook-historical-project-workspace.1";
export const WORKSPACE_MAX_BYTES=64*1024*1024;
/** Group declared identities only. Incomplete identities remain isolated;
 * no ownership, financial aggregation, execution, or live lifecycle inferred. */
export function listHistoricalProjects(catalogue){
 const groups=new Map();
 for(const row of catalogue.list()){
  const complete=row.declared_identity_complete===true;
  const key=JSON.stringify(complete?[row.source_mode,row.network,row.genesisHash,row.projectId,row.tokenMint,row.quoteAsset]:["PROVISIONAL",row.key]);
  let project=groups.get(key);
  if(!project){project={key,project_id:row.projectId,token_mint:row.tokenMint,quote_asset:row.quoteAsset,source_mode:row.source_mode,network:row.network,genesis_hash:row.genesisHash,identity_status:complete?"DECLARED_ONLY":"PROVISIONAL",source_attestation:"UNKNOWN",record_keys:[],review_required_count:0};groups.set(key,project);}
  project.record_keys.push(row.key);
  if(row.audit_status!=="REPORT_READY")project.review_required_count++;
 }
 return [...groups.values()].map(p=>({...p,record_count:p.record_keys.length}));
}
export function exportHistoricalWorkspace(catalogue){
 return {schema_version:VERSION,source_attestation:"UNKNOWN",execution_enabled:false,records:catalogue.exportInputs()};
}
/** Recompute all input audits before returning a replacement catalogue.
 * A conflict or malformed member leaves the caller's original catalogue unchanged. */
export function restoreHistoricalWorkspace(bundle,{mergeInto=null}={}){
 if(bundle?.schema_version!==VERSION||bundle.execution_enabled!==false||bundle.source_attestation!=="UNKNOWN"||!Array.isArray(bundle.records)||bundle.records.length>8||Object.keys(bundle).some(k=>!["schema_version","source_attestation","execution_enabled","records"].includes(k)))throw Error("INVALID_WORKSPACE");
 const next=createHistoricalProjectCatalogue();
 if(mergeInto)for(const input of mergeInto.exportInputs())next.add(input);
 for(const input of bundle.records)next.add(input);
 return next;
}
