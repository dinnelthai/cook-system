// Never retry an ambiguous submission: later wallets remain untouched.
export async function runTradeBatch(wallets, execute){
 let stopped=false;const out=[];
 for(const wallet of wallets){
  if(stopped){out.push({wallet,status:'NOT_ATTEMPTED'});continue}
  const result=await execute(wallet);out.push({wallet,...result});
  if(result.status==='UNKNOWN')stopped=true;
 }
 return out;
}
