import {deduplicateEvents,sortForReplay} from "../core/event-order.mjs";
import {createInitialPumpSwapPoolState,replayPumpSwapPoolEvents,reconcilePumpSwapPoolSnapshot} from "../core/pool-state.mjs";
const PUMP="6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P", AMM="pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA";
const KINDS=new Set(["MARKET_CREATED","CURVE_COMPLETE","CURVE_MIGRATED","POOL_CREATED","POOL_BUY_EXECUTED","POOL_SELL_EXECUTED","POOL_LIQUIDITY_ADDED","POOL_LIQUIDITY_REMOVED","POOL_FEE_MOVEMENT","POOL_BOOST_BUY_BURN","POST_COMPLETE_POOL_LEG"]);
const POOL_KINDS=new Set([...KINDS].filter(k=>k.startsWith("POOL_")&&k!=="POOL_CREATED"));
const id=v=>typeof v==="string"&&v.length>0&&v.length<=256&&v.trim()===v;
const uint=v=>typeof v==="string"&&/^(0|[1-9]\d{0,19})$/.test(v)&&BigInt(v)<2n**64n;
const slot=v=>Number.isSafeInteger(v)&&v>=0;
const sig=e=>e.source?.signature;
const usable=e=>e.quality?.is_complete===true&&e.quality?.validation_status==="valid"&&id(sig(e))&&e.payload?.signature===sig(e);
const fact=e=>e?{event_id:e.event_id,signature:sig(e)??null,slot:e.ordering?.slot??null}:null;
/** Review normalized, archived collector output only. Does not attest raw RPC
 * provenance, infer owner balances, generate transactions or authorize actions. */
export function reviewGraduationHistory(input){
 if(input?.schema_version!=="1.1.0"||!Array.isArray(input.events)||input.events.length>100000||!Array.isArray(input.pool_replays)||input.pool_replays.length>64)throw Error("INVALID_PUMP_HISTORY_REPORT");
 const m=input.market,curve=input.bonding_curve_address;
 if(m?.chain_id!=="solana"||!["mainnet","devnet","local_sim"].includes(m.network)||m.curve_program_id!==PUMP||!id(m.token_mint)||!id(m.quote_mint)||!id(curve)||m.curve_account!==curve)throw Error("INVALID_HISTORY_SCOPE");
 const issues=[],add=(code,level="UNKNOWN",pool=null)=>issues.push({code,level,pool_address:pool});
 const relevant=input.events.filter(e=>KINDS.has(e?.event_kind));
 if(relevant.some(e=>e.provenance!=="observed_chain"||["chain_id","network","token_mint","quote_mint","curve_program_id"].some(k=>e.market?.[k]!==m[k])||(e.market?.curve_account!=null&&e.market.curve_account!==curve)))throw Error("MIXED_GRADUATION_SCOPE");
 let ordered;
 try{ordered=sortForReplay(deduplicateEvents(relevant));}catch{throw Error("INVALID_GRADUATION_ORDER");}
 if(ordered.some(e=>!usable(e)))add("EVENT_QUALITY_UNCONFIRMED");
 const select=k=>ordered.filter(e=>e.event_kind===k);
 const creates=select("MARKET_CREATED"),completes=select("CURVE_COMPLETE"),migrations=select("CURVE_MIGRATED"),poolCreates=select("POOL_CREATED");
 if(creates.length!==1)add("CREATION_EVIDENCE_MISSING_OR_AMBIGUOUS",creates.length>1?"FAIL":"UNKNOWN");
 if(completes.length>1||migrations.length>1)add("AMBIGUOUS_CURVE_LIFECYCLE","FAIL");
 const complete=completes.length===1?completes[0]:null,migration=migrations.length===1?migrations[0]:null;
 if(complete&&creates.length===1&&ordered.indexOf(creates[0])>=ordered.indexOf(complete))add("COMPLETE_BEFORE_CREATION","FAIL");
 if(migration&&(!complete||ordered.indexOf(complete)>=ordered.indexOf(migration)))add("MIGRATION_WITHOUT_PRIOR_COMPLETION",complete?"FAIL":"UNKNOWN");
 const address=migration?.payload?.pool_address??null;
 const pair=address?poolCreates.filter(e=>e.payload?.pool_address===address):[];
 if(migration&&(!id(address)||pair.length!==1))add("MIGRATED_POOL_CREATION_MISSING_OR_AMBIGUOUS",pair.length>1?"FAIL":"UNKNOWN");
 const creation=pair.length===1?pair[0]:null;
 let link="UNKNOWN",amounts=null;
 if(migration&&creation){
  const p=migration.payload,c=creation.payload;
  if(c.pool_program_id!==AMM||c.base_mint!==m.token_mint||c.quote_mint!==m.quote_mint||p.mint!==m.token_mint||p.quote_mint!==m.quote_mint){link="FAIL";add("MIGRATION_POOL_IDENTITY_MISMATCH","FAIL",address);}
  else if(!usable(migration)||!usable(creation)||sig(migration)!==sig(creation)||migration.ordering.slot!==creation.ordering.slot||migration.ordering.transaction_index!==creation.ordering.transaction_index){add("MIGRATION_TRANSACTION_LINK_UNCONFIRMED","UNKNOWN",address);}
  else{
   link="MATCHED_DECLARED_TRANSACTION";
   const fields=[p.migrated_token_amount_base_units,p.migrated_quote_amount_base_units,p.pool_migration_fee_base_units,c.base_amount_in_base_units,c.quote_amount_in_base_units];
   if(fields.every(uint)){
    amounts={migrated_token_base_units:fields[0],migrated_quote_base_units:fields[1],migration_fee_base_units:fields[2],pool_creation_token_input_base_units:fields[3],pool_creation_quote_input_base_units:fields[4],declared_input_comparison:fields[0]===fields[3]&&fields[1]===fields[4]?"MATCH":"DIFFERENT_REQUIRES_EXPLANATION"};
    if(amounts.declared_input_comparison!=="MATCH")add("MIGRATION_DECLARED_INPUT_DIFFERENCE","UNKNOWN",address);
   }else add("MIGRATION_AMOUNTS_UNAVAILABLE","UNKNOWN",address);
  }
 }
 const rows=new Map();
 for(const r of input.pool_replays){if(!id(r?.pool_address)||rows.has(r.pool_address))throw Error("INVALID_OR_DUPLICATE_POOL_RECORD");rows.set(r.pool_address,r);}
 const pools=[];
 for(const [pool,r] of rows){
  const out={pool_address:pool,linked_to_migration:pool===address&&link==="MATCHED_DECLARED_TRANSACTION",creation:null,replay_status:"UNKNOWN",snapshot_status:"UNKNOWN",snapshot_slot:null,metrics:null,reported_coverage:r.signature_coverage?.coverage_complete===true?"DECLARED_COMPLETE":"UNKNOWN",reported_replay_status:r.replay_status??null};
  pools.push(out);
  const candidates=poolCreates.filter(e=>e.payload?.pool_address===pool);
  if(candidates.length!==1){add("POOL_CREATION_MISSING_OR_AMBIGUOUS",candidates.length>1?"FAIL":"UNKNOWN",pool);continue;}
  const start=candidates[0],p=start.payload,s=r.current_snapshot,d=s?.decoded_pool,b=s?.base_vault,q=s?.quote_vault,dd=d?.data;
  out.creation=fact(start);
  if(p.pool_program_id!==AMM||p.base_mint!==m.token_mint||p.quote_mint!==m.quote_mint){add("POOL_CREATION_SCOPE_MISMATCH","FAIL",pool);continue;}
  const events=ordered.filter(e=>POOL_KINDS.has(e.event_kind)&&e.payload?.pool_address===pool);
  if(events.some(e=>ordered.indexOf(e)<=ordered.indexOf(start))){add("POOL_EVENT_BEFORE_CREATION","FAIL",pool);continue;}
  if(!usable(start)||events.some(e=>!usable(e))||r.signature_coverage?.coverage_complete!==true||!Array.isArray(r.data_gaps)||r.data_gaps.length||!Array.isArray(r.unresolved_events)||r.unresolved_events.length||!Array.isArray(r.initialization_evidence)||r.initialization_evidence.length||!Array.isArray(s?.errors)||s.errors.length){add("POOL_EVIDENCE_INCOMPLETE","UNKNOWN",pool);continue;}
  if(!dd||!b||!q){add("POOL_SNAPSHOT_MISSING","UNKNOWN",pool);continue;}
  if(d.account_owner!==AMM||dd.base_mint!==m.token_mint||dd.quote_mint!==m.quote_mint||b.mint!==m.token_mint||q.mint!==m.quote_mint||(d.account_address!=null&&d.account_address!==pool)||b.token_authority!==pool||q.token_authority!==pool){add("POOL_SNAPSHOT_SCOPE_MISMATCH","FAIL",pool);continue;}
  // Missing account address is not proof of pool identity.
  if(d.account_address==null){add("POOL_ACCOUNT_ADDRESS_UNATTESTED","UNKNOWN",pool);}
  if(![d.context_slot,b.context_slot,q.context_slot].every(slot)||d.context_slot!==b.context_slot||d.context_slot!==q.context_slot||events.some(e=>e.ordering.slot>d.context_slot)||start.ordering.slot>d.context_slot){add("POOL_SNAPSHOT_SLOT_NOT_COMPARABLE","UNKNOWN",pool);continue;}
  if(events.some(e=>["POOL_BUY_EXECUTED","POOL_SELL_EXECUTED"].includes(e.event_kind)&&e.quality?.transaction_balance_reconciliation?.status!=="PASS")){add("POOL_TRADE_RECONCILIATION_UNCONFIRMED","UNKNOWN",pool);continue;}
  try{
   if(![p.pool_base_reserves_base_units,p.pool_quote_reserves_base_units,b.amount_base_units,q.amount_base_units,dd.protocol_fees_base_units,dd.creator_fees_base_units,dd.lp_supply_base_units].every(uint)||typeof dd.virtual_quote_reserves_base_units!=="string"||!/^-?(0|[1-9]\d{0,38})$/.test(dd.virtual_quote_reserves_base_units))throw Error("INVALID_POOL_AMOUNTS");
   const replay=replayPumpSwapPoolEvents(createInitialPumpSwapPoolState({poolCreatedEvent:start,decodedPool:d}),events);
   out.replay_status=replay.status;
   const reconciliation=reconcilePumpSwapPoolSnapshot({replayedState:replay.state,decodedPool:d,baseVault:b,quoteVault:q});
   out.snapshot_status=reconciliation.status;out.snapshot_slot=reconciliation.snapshot_slot;
   if(replay.status!=="PASS"||reconciliation.status!=="PASS"){add("POOL_REPLAY_OR_SNAPSHOT_NOT_RECONCILED",replay.status==="FAIL"||reconciliation.status==="FAIL"?"FAIL":"UNKNOWN",pool);continue;}
   out.metrics={base_vault_base_units:replay.state.pool_base_reserves_base_units,quote_vault_base_units:replay.state.pool_quote_reserves_base_units,virtual_quote_base_units:replay.state.virtual_quote_reserves_base_units,effective_quote_base_units:reconciliation.effective_quote_reserves_base_units,protocol_fee_bucket_base_units:replay.state.protocol_fees_base_units,creator_fee_bucket_base_units:replay.state.creator_fees_base_units,lp_supply_base_units:dd.lp_supply_base_units,trade_count:replay.state.trade_count,liquidity_add_count:replay.state.liquidity_add_count,liquidity_remove_count:replay.state.liquidity_remove_count,fee_sweep_count:replay.state.fee_sweep_count,metric_scope:"SUPPLIED_HISTORICAL_REPLAY_AND_SNAPSHOT_ONLY",lp_ownership:"UNKNOWN",creator_fee_cash_received:"UNKNOWN"};
  }catch{add("POOL_REPLAY_FAILED","FAIL",pool);}
 }
 if(address&&!rows.has(address))add("MIGRATED_POOL_REPLAY_MISSING","UNKNOWN",address);
 if(poolCreates.some(e=>!rows.has(e.payload?.pool_address)))add("POOL_CREATION_WITHOUT_REPLAY_RECORD");
 if(ordered.some(e=>POOL_KINDS.has(e.event_kind)&&!rows.has(e.payload?.pool_address)))add("POOL_EVENT_WITHOUT_REPLAY_RECORD");
 if(input.curve_replay_status!=="REPLAYED_FULL_CURVE_HISTORY"||input.current_account_reconciliation?.status!=="PASS"||input.signature_coverage?.coverage_complete!==true||!Array.isArray(input.data_gaps)||input.data_gaps.length)add("CURVE_COVERAGE_OR_RECONCILIATION_UNCONFIRMED");
 const status=issues.some(x=>x.level==="FAIL")?"REVIEW_REQUIRED":issues.length?"PARTIAL":"INTERNAL_CHECKS_CONSISTENT";
 return {schema_version:"cook-graduation-review.1",status,scope:{network:m.network,token_mint:m.token_mint,quote_mint:m.quote_mint,curve_address:curve},lifecycle:{creation:creates.length===1?fact(creates[0]):null,completion:fact(complete),migration:fact(migration),migration_pool_address:address,transaction_link:link,declared_amounts:amounts},pools,issues,source_attestation:"UNKNOWN",ownership_attestation:"UNKNOWN",settlement_allowed:false,execution_enabled:false};
}
