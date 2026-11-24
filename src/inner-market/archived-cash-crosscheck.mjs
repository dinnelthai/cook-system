import {auditArchivedAccountInterval,normalizeArchivedReceipt} from "./archived-account-audit.mjs";
import {reconcileProjectCash} from "./project-accounting.mjs";
import {parseBaseUnits,U128_MAX} from "../core/integer.mjs";

const CREDIT=new Set(["CAPITAL_IN","TRADE_NET_RECEIPT","CREATOR_FEE_RECEIVED","OTHER_INCOME"]);
const DEBIT=new Set(["CAPITAL_OUT","TRADE_CASH_COST","ISSUANCE_EXPENSE","OPERATING_EXPENSE","FAILED_TX_EXPENSE","OTHER_EXPENSE"]);
const amount=v=>parseBaseUnits(v,{name:"posting amount",max:U128_MAX});
const validId=v=>typeof v==="string"&&v.length>0&&v.length<=256&&v.trim()===v;

/** Offline reconciliation only. Caller supplies existing postings and evidence.
 * No economic intent, trading policy, cost basis or ownership is inferred.
 * Only one designated native account is supported. No signing or submission.
 */
export function auditArchivedCashPostings({accountInterval,projectId,postings,cashHistoryComplete}){
 if(!validId(projectId)||!Array.isArray(postings)||postings.length>20000||typeof cashHistoryComplete!=="boolean")throw Error("INVALID_CASH_AUDIT_INPUT");
 const account=auditArchivedAccountInterval(accountInterval);
 const {scope,receipts}=accountInterval;
 const normalized=receipts.map(r=>normalizeArchivedReceipt(r,scope.genesisHash));
 const bySignature=new Map(normalized.map(r=>[r.signature,r]));
 const quoteAsset="SOL_LAMPORTS";
 const issues=[];
 if(account.status!=="INTERNALLY_CONSISTENT")issues.push({code:"ACCOUNT_INTERVAL_REVIEW"});
 if(!cashHistoryComplete)issues.push({code:"CASH_HISTORY_INCOMPLETE"});
 const grouped=new Map();
 const ids=new Set();
 for(const p of postings){
  if(!p||!validId(p.id)||ids.has(p.id))throw Error("MISSING_OR_DUPLICATE_POSTING");
  ids.add(p.id);
  if(p.projectId!==projectId||p.quoteAsset!==quoteAsset||p.genesisHash!==scope.genesisHash||p.wallet!==scope.wallet||p.openingSlot!==scope.openingSlot||p.closingSlot!==scope.closingSlot)throw Error("POSTING_SCOPE_MISMATCH");
  if(!CREDIT.has(p.kind)&&!DEBIT.has(p.kind))throw Error("UNSUPPORTED_POSTING_KIND");
  const n=amount(p.amountBaseUnits);
  if(n===0n)throw Error("ZERO_POSTING");
  const r=bySignature.get(p.signature);
  if(!r){issues.push({code:"POSTING_WITHOUT_RECEIPT",posting_id:p.id});continue;}
  if(p.status!=="FINALIZED"||p.reconciliation!=="PASS"){issues.push({code:"POSTING_UNVERIFIED",posting_id:p.id});continue;}
  if(!grouped.has(p.signature))grouped.set(p.signature,[]);
  grouped.get(p.signature).push({p,n,signed:CREDIT.has(p.kind)?n:-n});
 }
 let matched=0;
 const classification=[];
 for(const r of normalized){
  const n=r.native.find(x=>x.address===scope.wallet);
  const observed=n?n.after-n.before:0n;
  const rows=grouped.get(r.signature)??[];
  const posted=rows.reduce((sum,x)=>sum+x.signed,0n);
  const start=issues.length;
  const issue=code=>issues.push({code,signature:r.signature});
  if(observed!==posted)issue("RECEIPT_CASH_DELTA_MISMATCH");
  if(observed===0n&&rows.length)issue("ZERO_DELTA_REQUIRES_SEPARATE_REVIEW");
  if(observed!==0n&&rows.length===0)issue("MISSING_CASH_POSTING");
  if(r.outcome==="FAILED"){
   const expected=r.feePayer===scope.wallet?r.fee:0n;
   if(expected>0n){
    if(rows.length!==1||rows[0].p.kind!=="FAILED_TX_EXPENSE"||rows[0].n!==expected)issue("FAILED_FEE_POSTING_MISMATCH");
   }else if(rows.length)issue("FAILED_RECEIPT_WITHOUT_WALLET_FEE");
  }else{
   if(rows.some(x=>x.p.kind==="FAILED_TX_EXPENSE"))issue("SUCCESS_MISCLASSIFIED_AS_FAILED_FEE");
   // Net cash delta alone does not support multiple gross economic components.
   // Do not infer that offsets or an additional fee are correct.
   if(rows.length>1)issue("MULTIPLE_COMPONENTS_REQUIRE_INDEPENDENT_EVIDENCE");
  }
  if(r.issues.length)issue("RECEIPT_REVIEW_REQUIRED");
  // A native balance delta cannot attest economic purpose. Failed fees are
  // structurally checkable; successful postings still require attribution.
  for(const {p} of rows)classification.push({posting_id:p.id,kind:p.kind,status:r.outcome==="FAILED"&&issues.length===start?"FAILED_FEE_STRUCTURALLY_CONSISTENT":"UNATTESTED"});
  if(issues.length===start)matched++;
 }
 const cash=reconcileProjectCash({projectId,quoteAsset,openingCashBaseUnits:account.native.opening_lamports,observedClosingCashBaseUnits:account.native.observed_closing_lamports,entries:postings,historyComplete:cashHistoryComplete});
 if(cash.status!=="RECONCILED")issues.push({code:"CASH_LEDGER_REVIEW",flags:cash.flags});
 return {schema_version:"cook-archived-cash-crosscheck.1",status:issues.length?"REVIEW_REQUIRED":"AMOUNTS_INTERNALLY_CONSISTENT",
  project_id:projectId,quote_asset:quoteAsset,receipt_count:normalized.length,matched_receipt_count:matched,posting_count:postings.length,
  account_audit:account,cash_audit:{status:cash.status,expected_closing_cash_base_units:cash.expected_closing_cash_base_units,observed_closing_cash_base_units:cash.observed_closing_cash_base_units,cash_difference_base_units:cash.cash_difference_base_units,flags:cash.flags},
  issues,classification,source_attestation:"UNKNOWN",economic_classification_attestation:"UNKNOWN",history_complete_attested:false,settlement_allowed:false,execution_enabled:false};
}
