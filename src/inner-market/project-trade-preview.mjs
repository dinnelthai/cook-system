import {validateProjectTrade} from './project-trade-validation.mjs';
// Read-only preparation only; no executable quote or authorization is issued.
export function createProjectTradePreview({projects,wallets,portfolio,genesis}) {
 return async request => {
  const project=projects.get(request.project_id);
  const managed=await wallets.list();
  const draft=validateProjectTrade(project,request,managed.map(w=>w.address),{genesis});
  const snapshot=await portfolio.snapshot({limit:1,mint:draft.mint});
  if(snapshot.genesis_hash!==genesis)throw Error('PROJECT_NETWORK_MISMATCH');
  const rows=draft.orders.map(order=>{
   const w=snapshot.wallets.find(x=>x.address===order.wallet);
   if(!w)throw Error('WALLET_BALANCE_UNAVAILABLE');
   let available;
   if(draft.side==='buy'){
    if(w.balance_status!=='AVAILABLE'||!/^\d+$/.test(w.balance_lamports??''))throw Error('WALLET_BALANCE_UNAVAILABLE');
    available=BigInt(w.balance_lamports);
   }else{
    if(w.token_accounts_status!=='AVAILABLE')throw Error('WALLET_BALANCE_UNAVAILABLE');
    available=w.token_accounts.filter(a=>a.mint===draft.mint).reduce((sum,a)=>sum+BigInt(a.amount_base_units),0n);
   }
   if(BigInt(order.amount_base_units)>available)throw Error('INSUFFICIENT_BALANCE');
   return {...order,available_base_units:available.toString()};
  });
  if(projects.get(project.project_id).revision!==project.revision)throw Error('PROJECT_REVISION_CONFLICT');
  return {...draft,orders:rows,total_base_units:rows.reduce((n,o)=>n+BigInt(o.amount_base_units),0n).toString(),balance_as_of:snapshot.as_of??null,quote_status:'UNAVAILABLE',execution_enabled:false};
 };
}
