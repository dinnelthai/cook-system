/** Fixed, synthetic participant stress cases for defensive offline evaluation.
 * These are hand-authored observations, not actor policies or execution traces.
 * No trade sizing, order generation, ordering attacks, wallet orchestration,
 * issuer decision optimization, or connection to a real network.
 */
const catalogue=Object.freeze([
 {id:"independent",role:"Independent Trader",traits:["heterogeneous demand","independent risk constraints"],observable:"Baseline accounting and market-data consistency",limitation:"Independent ownership cannot be inferred from address count."},
 {id:"retail",role:"Retail",traits:["heterogeneous budgets","varied information and holding horizons"],observable:"Broadly distributed activity with variable data coverage",limitation:"Similar activity does not prove common control or independence."},
 {id:"sniper",role:"Sniper / Fast Entrant",traits:["early participation","short-horizon activity"],observable:"Early inventory concentration stress",limitation:"Early activity does not establish malicious intent."},
 {id:"arbitrage",role:"Arbitrage / Searcher",traits:["cross-venue price comparison","fee and inventory constraints"],observable:"Unverified external reference-price risk",limitation:"A single inner curve does not establish a cross-venue arbitrage opportunity."},
 {id:"sandwich",role:"Sandwich-related MEV",traits:["transaction-ordering externality","adverse execution quality"],observable:"Synthetic victim execution shortfall",limitation:"Shortfall alone does not prove a sandwich attack; no attack sequence or policy is simulated."},
 {id:"early-holder",role:"Early Holder",traits:["concentrated existing inventory","uncertain holding horizon"],observable:"Fixed portfolio impairment stress",limitation:"Inventory does not establish future selling intent."},
]);
const cases=Object.freeze([
 {id:"baseline",roleId:"independent",title:"Baseline verified report",expectedAuditStatus:"REPORT_READY",patch:"NONE",risk:"NONE"},
 {id:"retail-coverage",roleId:"retail",title:"Incomplete participation records",expectedAuditStatus:"REVIEW_REQUIRED",patch:"MARKET_HISTORY_MISSING",risk:"DATA_COVERAGE"},
 {id:"early-inventory",roleId:"sniper",title:"Unverified opening inventory basis",expectedAuditStatus:"REVIEW_REQUIRED",patch:"OPENING_BASIS_UNKNOWN",risk:"INVENTORY_UNCERTAINTY"},
 {id:"arbitrage-reference",roleId:"arbitrage",title:"Unverified reference valuation",expectedAuditStatus:"REVIEW_REQUIRED",patch:"NAV_UNVERIFIED",risk:"REFERENCE_UNCERTAINTY"},
 {id:"sandwich-shortfall",roleId:"sandwich",title:"Adverse execution evidence",expectedAuditStatus:"REVIEW_REQUIRED",patch:"EXECUTION_RECONCILIATION_UNKNOWN",risk:"EXECUTION_QUALITY"},
 {id:"holder-impairment",roleId:"early-holder",title:"Fixed historical NAV impairment",expectedAuditStatus:"REPORT_READY",patch:"HISTORICAL_NAV_IMPAIRMENT",risk:"VALUATION_LOSS"},
]);
export function getParticipantCatalogue(){return structuredClone(catalogue)}
export function getParticipantStressCases(){return structuredClone(cases)}

/** Apply only a fixed synthetic accounting perturbation, never a trading action. */
export function buildParticipantStressInput(base,caseId){
 if(base?.sourceMode!=="SYNTHETIC")throw new Error("synthetic fixtures only");
 const c=cases.find(x=>x.id===caseId);
 if(!c)throw new Error("unknown fixed participant case");
 const f=structuredClone(base);
 switch(c.patch){
  case "NONE":break;
  case "MARKET_HISTORY_MISSING":f.market.historyComplete=false;break;
  case "OPENING_BASIS_UNKNOWN":f.inventory.opening.costBasis=null;f.inventory.ledger.cost_basis_complete=false;break;
  case "NAV_UNVERIFIED":f.nav.snapshots.at(-1).valuationStatus="UNKNOWN";break;
  case "EXECUTION_RECONCILIATION_UNKNOWN":f.market.trades[0].reconciliation="UNKNOWN";break;
  case "HISTORICAL_NAV_IMPAIRMENT":{
   // Abstract stress valuation only, not a curve price or executable quote.
   const s=f.nav.snapshots.at(-1);
   s.navBeforeFlowBaseUnits="800";
   s.navAfterFlowBaseUnits="800";
   break;
  }
  default:throw new Error("unsupported fixed perturbation");
 }
 return f;
}

export function evaluateParticipantStressCases({base,reportBuilder}){
 if(typeof reportBuilder!=="function")throw new TypeError("reportBuilder required");
 return cases.map(c=>{
  const r=reportBuilder(buildParticipantStressInput(base,c.id));
  return {case_id:c.id,role_id:c.roleId,title:c.title,risk_category:c.risk,expected_status:c.expectedAuditStatus,actual_status:r.status,passed:r.status===c.expectedAuditStatus,issues:r.issues,observed_drawdown_bps:r.accounting.max_observed_drawdown_bps,source_mode:"SYNTHETIC",execution_enabled:false};
 });
}
