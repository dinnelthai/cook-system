import {createHash} from "node:crypto";
import {canonicalJson} from "../core/canonical-json.mjs";
import {assertProjectAggregate} from "./project-aggregate.mjs";
import {reviewGraduationHistory} from "./graduation-history-review.mjs";
import {derivePumpBondingCurveAddress} from "../adapters/pump/pump-history-collector.mjs";
const hash=x=>createHash("sha256").update(canonicalJson(x),"utf8").digest("hex");
/** Archive a bounded historical milestone summary only. Supplied history is not
 * authenticated; no market actions or automatic lifecycle changes are possible. */
export function reviewProjectGraduationEvidence(projectInput,history){
 const p=assertProjectAggregate(projectInput);
 if(!history||typeof history!=="object"||Array.isArray(history))throw Error("INVALID_GRADUATION_HISTORY");
 if(p.network.cluster!=="localnet"||!p.network.genesis_hash||!p.token.mint||!p.token.issuance_signature)throw Error("PROJECT_GRADUATION_IDENTITY_INCOMPLETE");
 if(!Array.isArray(history.events)||history.events.length>1000||!Array.isArray(history.pool_replays)||history.pool_replays.length>20)throw Error("PROJECT_GRADUATION_HISTORY_LIMIT");
 const provenance=history.source_provenance,market=history.market;
 if(provenance?.scope?.network!=="local_sim"||provenance.scope.provenance!=="observed_chain"||provenance.scope.genesis_hash!==p.network.genesis_hash||provenance.source?.observed_genesis_hash!==p.network.genesis_hash||provenance.status==="REVIEW_REQUIRED")throw Error("GRADUATION_GENESIS_SCOPE_MISMATCH");
 if(market?.network!=="local_sim"||market.token_mint!==p.token.mint||market.quote_mint!==p.network.quote_mint||history.bonding_curve_address!==derivePumpBondingCurveAddress(p.token.mint))throw Error("GRADUATION_PROJECT_SCOPE_MISMATCH");
 const g=reviewGraduationHistory(history),l=g.lifecycle;
 const eventById=id=>history.events.find(e=>e.event_id===id);
 const validFact=f=>Boolean(f&&Number.isSafeInteger(f.slot)&&f.slot>=0&&/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(f.signature)&&eventById(f.event_id)?.quality?.is_complete===true&&eventById(f.event_id)?.quality?.validation_status==="valid");
 const issues=g.issues.map(i=>i.code);
 const create=l.creation?eventById(l.creation.event_id):null;
 const creationMatch=validFact(l.creation)&&l.creation.signature===p.token.issuance_signature;
 if(l.creation&&!creationMatch)issues.push("PROJECT_CREATION_RECEIPT_MISMATCH");
 if(create&&p.token.creator_wallet_address&&create.payload?.creator_address!==p.token.creator_wallet_address)issues.push("PROJECT_CREATOR_MISMATCH");
 if(create&&p.token.supply_base_units!==null&&create.payload?.token_total_supply_base_units!==p.token.supply_base_units)issues.push("PROJECT_ISSUED_SUPPLY_MISMATCH");
 const conflict=g.status==="REVIEW_REQUIRED"||issues.some(i=>["PROJECT_CREATION_RECEIPT_MISMATCH","PROJECT_CREATOR_MISMATCH","PROJECT_ISSUED_SUPPLY_MISMATCH"].includes(i));
 const completionMatch=creationMatch&&validFact(l.completion);
 const migrationMatch=completionMatch&&validFact(l.migration)&&l.transaction_link==="MATCHED_DECLARED_TRANSACTION";
 const poolMatch=migrationMatch&&g.pools.some(x=>x.linked_to_migration&&x.pool_address===l.migration_pool_address&&x.replay_status==="PASS"&&x.snapshot_status==="PASS");
 const milestones=[
  {stage:"LAUNCHED",status:conflict?"REVIEW_REQUIRED":creationMatch?"RECORDED_NOT_ATTESTED":"UNKNOWN",evidence:l.creation},
  {stage:"GRADUATION_PENDING",status:conflict?"REVIEW_REQUIRED":completionMatch?"RECORDED_NOT_ATTESTED":"UNKNOWN",evidence:l.completion},
  {stage:"PUMPSWAP_ACTIVE",status:conflict?"REVIEW_REQUIRED":poolMatch?"REPLAY_MATCH_NOT_ATTESTED":migrationMatch?"MIGRATION_LINK_ONLY":"UNKNOWN",evidence:l.migration}
 ];
 return {schema_version:"cook-project-graduation-evidence.1",project_id:p.project_id,project_revision:p.revision,history_digest:hash(history),status:conflict?"REVIEW_REQUIRED":g.status==="INTERNAL_CHECKS_CONSISTENT"&&poolMatch?"INTERNAL_CHECKS_CONSISTENT":"PARTIAL",
  milestones,issues:[...new Set(issues)].slice(0,100),source_attestation:"UNKNOWN",ownership_attestation:"UNKNOWN",lifecycle_mutated:false,settlement_allowed:false,execution_enabled:false};
}
