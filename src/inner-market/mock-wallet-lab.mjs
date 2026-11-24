// Fictional, in-memory accounting exercise. No addresses, keys, curve, RPC or network.
export const UNIT_PRICE=10, MOCK_FEE=1, GRANT=1000, MAX_WALLETS=20;
export function newLab(){return {wallets:[],events:[],nextId:1,paused:false};}
export function addWallet(state){
 if(state.wallets.length>=MAX_WALLETS)throw Error("最多 20 个虚拟钱包");
 const w={id:"SIM-"+state.nextId,cash:GRANT,token:0,fees:0};
 return {...state,nextId:state.nextId+1,wallets:[...state.wallets,w]};
}
export function previewRows(state,side,requests){
 if(!["BUY","SELL"].includes(side))throw Error("无效方向");
 if(state.paused)throw Error("实验已暂停");
 if(!Array.isArray(requests)||!requests.length)throw Error("请选择虚拟钱包");
 const seen=new Set();
 return requests.map(({id,quantity})=>{
  if(seen.has(id))throw Error("重复钱包");seen.add(id);
  const w=state.wallets.find(x=>x.id===id);
  if(!w||!Number.isSafeInteger(quantity)||quantity<1||quantity>1000000)throw Error("钱包或数量无效");
  const gross=quantity*UNIT_PRICE;
  const cashDelta=side==="BUY"?-gross-MOCK_FEE:gross-MOCK_FEE;
  const tokenDelta=side==="BUY"?quantity:-quantity;
  if(w.cash+cashDelta<0||w.token+tokenDelta<0)throw Error(id+" 余额不足");
  return {id,side,quantity,gross,fee:MOCK_FEE,cashDelta,tokenDelta};
 });
}
export function applyExercise(state,side,requests){
 const rows=previewRows(state,side,requests);
 const wallets=state.wallets.map(w=>{const r=rows.find(x=>x.id===w.id);return r?{...w,cash:w.cash+r.cashDelta,token:w.token+r.tokenDelta,fees:w.fees+r.fee}:w});
 const events=rows.map((r,i)=>({...r,sequence:state.events.length+i+1,source:"SYNTHETIC",status:"SIMULATED"}));
 return {...state,wallets,events:[...state.events,...events]};
}
export function totals(state){
 const cash=state.wallets.reduce((s,w)=>s+w.cash,0),token=state.wallets.reduce((s,w)=>s+w.token,0),fees=state.wallets.reduce((s,w)=>s+w.fees,0);
 const initial=state.wallets.length*GRANT,nav=cash+token*UNIT_PRICE;
 return {cash,token,fees,initial,nav,pnl:nav-initial};
}
