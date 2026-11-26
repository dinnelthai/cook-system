import {formatHistoricalSol} from "./terminal-display.mjs";
// Static declarations only. Never infer available funds or grant execution.
const stages={DRAFT:"Draft",READY:"Ready",LAUNCH_SUBMITTED:"Issuance Recorded",LAUNCHED:"Issuance Verified",BONDING_CURVE_ACTIVE:"Bonding Curve",GRADUATION_PENDING:"Graduation Pending",PUMPSWAP_ACTIVE:"PumpSwap",EXIT_IN_PROGRESS:"Exit in Progress",SETTLEMENT_PENDING:"Settlement Pending",CLOSED:"Closed",ARCHIVED:"Archived"};
const runtime={HALTED:"Halted",ACTIVE:"Registered Active",REVIEW_REQUIRED:"Review Required"};
export const lifecycleLabel=v=>stages[v]??"Unknown";
export const operationalLabel=v=>runtime[v]??"Unknown";
export const limitFields=[["max_project_budget_base_units","Project Budget Limit (SOL)"],["max_order_size_base_units","Order Size Limit (SOL)"],["max_wallet_exposure_base_units","Wallet Exposure Limit (SOL)"]];
const u64=18446744073709551615n;
export function parseDeclaredSol(input){
 const s=String(input??"").trim();
 if(!s)return null;
 if(!/^(0|[1-9][0-9]{0,19})(\.[0-9]{1,9})?$/.test(s))throw Error("SOL_LIMIT_INVALID");
 const [whole,frac=""]=s.split(".");
 const n=BigInt(whole)*1000000000n+BigInt(frac.padEnd(9,"0"));
 if(n>u64)throw Error("SOL_LIMIT_OUT_OF_RANGE");
 return n.toString();
}
export function budgetInputValue(value){return value==null?"":formatHistoricalSol(value);}
export function parseBudgetDeclaration(fields){
 const limits=Object.fromEntries(limitFields.map(([k])=>[k,parseDeclaredSol(fields[k])]));
 const s=String(fields.max_drawdown_bps??"").trim();
 if(s&&!/^(0|[1-9][0-9]{0,4})$/.test(s))throw Error("DRAWDOWN_LIMIT_INVALID");
 const bps=s?Number(s):null;
 if(bps!==null&&bps>10000)throw Error("DRAWDOWN_LIMIT_INVALID");
 limits.max_drawdown_bps=bps;
 const [budget,order,wallet]=limitFields.map(([k])=>limits[k]===null?null:BigInt(limits[k]));
 if((budget!==null&&order!==null&&order>budget)||(budget!==null&&wallet!==null&&wallet>budget)||(wallet!==null&&order!==null&&order>wallet))throw Error("LIMIT_HIERARCHY_CONFLICT");
 return limits;
}
export function projectWalletRegistrationRows(project){
 return (project?.wallet_groups??[]).flatMap(g=>g.members.map(m=>[g.name,g.purpose,m.wallet_address,m.role,m.enabled?"Registered Enabled":"Registered Disabled",m.allocation_limit_base_units===null?"Not configured":formatHistoricalSol(m.allocation_limit_base_units)+" SOL","Ownership not independently verified"]));
}
