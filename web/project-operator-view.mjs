import {formatHistoricalSol} from "./terminal-display.mjs";
// Static declarations only. Never infer available funds or grant execution.
const stages={DRAFT:"项目草稿",READY:"准备登记",LAUNCH_SUBMITTED:"发行提交登记",LAUNCHED:"发行已核验",BONDING_CURVE_ACTIVE:"内盘阶段",GRADUATION_PENDING:"迁移待核对",PUMPSWAP_ACTIVE:"外盘阶段",EXIT_IN_PROGRESS:"项目结束处理中",SETTLEMENT_PENDING:"等待结算",CLOSED:"已关闭",ARCHIVED:"已归档"};
const runtime={HALTED:"已暂停",ACTIVE:"登记为运行",REVIEW_REQUIRED:"待复核"};
export const lifecycleLabel=v=>stages[v]??"未知";
export const operationalLabel=v=>runtime[v]??"未知";
export const limitFields=[["max_project_budget_base_units","项目预算上限（SOL）"],["max_order_size_base_units","单笔金额上限（SOL）"],["max_wallet_exposure_base_units","单钱包风险敞口上限（SOL）"]];
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
 return (project?.wallet_groups??[]).flatMap(g=>g.members.map(m=>[g.name,g.purpose,m.wallet_address,m.role,m.enabled?"已启用登记":"已停用登记",m.allocation_limit_base_units===null?"未配置":formatHistoricalSol(m.allocation_limit_base_units)+" SOL","归属未独立核验"]));
}
