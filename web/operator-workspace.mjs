// Browser presentation only: persisted selection is not proof of project identity.
const key="cook.project.selection.v1";
const valid=id=>typeof id==="string"&&id.length>0&&id.length<=128&&id.trim()===id&&!/[\u0000-\u001f\u007f]/.test(id);
export function readProjectSelection(storage){
 try{const id=storage.getItem(key);return valid(id)?id:null;}catch{return null;}
}
export function writeProjectSelection(storage,id){
 try{if(id===null){storage.removeItem(key);return true;}if(!valid(id))return false;storage.setItem(key,id);return storage.getItem(key)===id;}catch{return false;}
}
const groups=[
 ["准备",["DRAFT","READY"]],
 ["发行证据",["LAUNCH_SUBMITTED","LAUNCHED"]],
 ["内盘记录",["BONDING_CURVE_ACTIVE"]],
 ["迁移与外盘",["GRADUATION_PENDING","PUMPSWAP_ACTIVE"]],
 ["财务关闭",["EXIT_IN_PROGRESS","SETTLEMENT_PENDING","CLOSED"]],
 ["归档",["ARCHIVED"]]
];
export function projectStageStrip(stage){
 const current=groups.findIndex(([,stages])=>stages.includes(stage));
 return groups.map(([label],i)=>({label,state:current<0?"UNKNOWN":i===current?"CURRENT":i<current?"EARLIER":"LATER"}));
}
const taskDefinitions=[
 ["configuration","项目配置与风险声明","setup"],
 ["issuance_evidence","发行身份及证据","lifecycle"],
 ["historical_market","历史市场证据","market"],
 ["financial_interval","资金与库存核对","assets"],
 ["order_exceptions","历史订单异常","orders"],
 ["historical_lp_evidence","LP 头寸证据覆盖","assets"],
 ["independent_source","独立来源核验","risk"]
];
export function projectReviewTasks(runtime){
 const work=Array.isArray(runtime?.work)?runtime.work:[];
 return taskDefinitions.map(([id,label,target])=>{
  const matches=work.filter(x=>x.id===id);
  const status=matches.length===1&&typeof matches[0].status==="string"?matches[0].status:"UNKNOWN";
  return {id,label,target,status};
 });
}
export function riskEvidenceRows(findings,severity="ALL"){
 if(!Array.isArray(findings))return [];
 return findings.filter(f=>severity==="ALL"||f.severity===severity).map(f=>[
  f.severity,Array.isArray(f.categories)?f.categories.join(" / "):f.category??"未知",f.code,
  Array.isArray(f.references)&&f.references.length?f.references.join(" / "):"未提供引用"
 ]);
}
