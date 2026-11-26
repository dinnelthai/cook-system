import {createProjectTradePreview} from "./project-trade-preview.mjs";
import {validateProjectTrade} from "./project-trade-validation.mjs";

const id=value=>typeof value==="string"&&value.trim()===value&&value.length>0&&value.length<=128;
const clone=value=>structuredClone(value);

/** Project-bound trade orchestration. The executor is deliberately injected;
 * production wiring must opt in explicitly, while tests can use a mock. */
export function createProjectTradeService({store,wallets,portfolio,market,genesis,executionAdapter=null,now=()=>Date.now()}={}){
 if(!store||!wallets||!portfolio||!market)throw Error("INVALID_PROJECT_TRADE_SERVICE");
 const preview=createProjectTradePreview({projects:{get:projectId=>store.get(projectId)},wallets,portfolio,genesis}),activeExecutions=new Set(),activeProjects=new Map();
 async function createPreview(projectId,input){
  if(!id(projectId)||!input||typeof input!=="object"||Array.isArray(input))throw Error("INVALID_PROJECT_TRADE_REQUEST");
  const project=store.get(projectId);
  const slippageBps=input.slippage_bps??100;if(!Number.isInteger(slippageBps)||slippageBps<1||slippageBps>5000)throw Error("INVALID_SLIPPAGE_BPS");
  const {slippage_bps,...tradeInput}=input,request={...tradeInput,project_id:projectId,revision:project.revision};
  const draft=await preview(request),{revision,...bound}=draft,previewBase={...bound,project_revision:revision,slippage_bps:slippageBps};
  if(!executionAdapter||typeof executionAdapter.quoteWallet!=="function")return store.tradeExecution.createPreview(previewBase);
  const orders=[];for(const order of bound.orders){const quote=await executionAdapter.quoteWallet({project:clone(project),preview:previewBase,order:clone(order)});orders.push({...order,...quote})}
  if(bound.side==="buy"){const limits=project.limits,maxOrder=BigInt(limits.max_order_size_base_units),maxWallet=BigInt(limits.max_wallet_exposure_base_units),maxProject=BigInt(limits.max_project_budget_base_units);let total=0n;for(const order of orders){const amount=BigInt(order.slippage_limit_base_units);if(amount>maxOrder||amount>maxWallet)throw Error("PROJECT_TRADE_LIMIT_EXCEEDED");total+=amount}if(total>maxProject)throw Error("PROJECT_TRADE_LIMIT_EXCEEDED")}
  return store.tradeExecution.createPreview({...previewBase,orders,quote_status:"ESTIMATED",quoted_at_ms:now()});
 }
 async function execute(projectId,input){
  if(!id(projectId)||!input||typeof input!=="object"||Array.isArray(input))throw Error("INVALID_PROJECT_TRADE_EXECUTION");
  if(Object.keys(input).some(k=>!["preview_id","idempotency_key","confirm"].includes(k))||!id(input.preview_id)||!id(input.idempotency_key)||input.confirm!==true)throw Error("EXPLICIT_TRADE_CONFIRMATION_REQUIRED");
  if(!executionAdapter||typeof executionAdapter.executeWallet!=="function")throw Error("PROJECT_TRADE_EXECUTION_DISABLED");
  const active=activeProjects.get(projectId);if(active){if(active.idempotency_key===input.idempotency_key)return store.tradeExecution.getExecution(active.execution_id);throw Error("PROJECT_TRADE_EXECUTION_BUSY")}
  const saved=store.tradeExecution.getPreview(input.preview_id);
  if(saved.project_id!==projectId)throw Error("PROJECT_TRADE_PROJECT_MISMATCH");
  const at=now();if(!Number.isSafeInteger(at)||at>saved.expires_at_ms)throw Error("PROJECT_TRADE_PREVIEW_EXPIRED");
  const project=store.get(projectId);
  if(project.revision!==saved.project_revision)throw Error("PROJECT_REVISION_CONFLICT");
  const boundOrders=saved.orders.map(({wallet,amount_base_units})=>({wallet,amount_base_units}));
  const request={project_id:projectId,revision:project.revision,market_id:saved.market_id,side:saved.side,orders:boundOrders};
  const managed=await wallets.list();
  const draft=validateProjectTrade(project,request,managed.map(w=>w.address),{genesis});
  if(draft.mint!==saved.mint||draft.market_account!==saved.market_account||draft.side!==saved.side||JSON.stringify(draft.orders)!==JSON.stringify(boundOrders))throw Error("PROJECT_TRADE_PREVIEW_BINDING_CONFLICT");
  const started=store.tradeExecution.createExecution(projectId,saved.preview_id,input.idempotency_key,{confirm:true},draft.orders);
  const execution=started.execution;
  if(started.status==="ALREADY_STARTED")return execution;
  if(activeExecutions.has(execution.execution_id)||activeProjects.has(projectId))throw Error("PROJECT_TRADE_EXECUTION_BUSY");activeExecutions.add(execution.execution_id);activeProjects.set(projectId,{execution_id:execution.execution_id,idempotency_key:input.idempotency_key});
  try{
   for(const [ordinal,order] of draft.orders.entries()){
    const current=store.get(projectId);if(current.revision!==project.revision||current.execution_policy?.mode!=="LOCALNET_AUTHORIZED"||current.execution_policy.enabled!==true)throw Error("PROJECT_EXECUTION_NOT_AUTHORIZED");
    store.tradeExecution.updateWallet(execution.execution_id,ordinal,{status:"PREPARING"});
    let result,submitted=false;
    const quotedOrder=saved.orders[ordinal],preSign=()=>{const latest=store.get(projectId);if(latest.revision!==project.revision||latest.execution_policy?.mode!=="LOCALNET_AUTHORIZED"||latest.execution_policy.enabled!==true)throw Error("PROJECT_EXECUTION_NOT_AUTHORIZED")};
    try{result=await executionAdapter.executeWallet({project:clone(project),preview:clone(saved),order:clone(quotedOrder),ordinal,execution_id:execution.execution_id,preSign,onSubmitted:({signature})=>{submitted=true;return store.tradeExecution.updateWallet(execution.execution_id,ordinal,{status:"SUBMITTED",signature})}});}
    catch(error){result={status:submitted?"UNKNOWN":"REJECTED",reason:submitted?"SUBMISSION_UNCERTAIN":typeof error?.message==="string"&&/^[A-Z][A-Z0-9_]{2,100}$/.test(error.message)?error.message:"EXECUTION_ADAPTER_FAILED"};}
    const status=result?.status;
    if(!["CONFIRMED","FAILED","REJECTED","UNKNOWN"].includes(status))throw Error("INVALID_PROJECT_TRADE_RESULT");
    store.tradeExecution.updateWallet(execution.execution_id,ordinal,{status,signature:result.signature,reason:result.reason});
    if(status==="UNKNOWN")return store.tradeExecution.finishExecution(execution.execution_id,"STOPPED_UNKNOWN",result.reason??"UNKNOWN");
   }
   return store.tradeExecution.finishExecution(execution.execution_id,"COMPLETED");
  }catch(error){
   const current=store.tradeExecution.getExecution(execution.execution_id),activeWallet=current.wallets.find(wallet=>["PREPARING","SUBMITTED"].includes(wallet.status));
   if(activeWallet?.status==="PREPARING")store.tradeExecution.updateWallet(execution.execution_id,activeWallet.ordinal,{status:"REJECTED",reason:error.message==="PROJECT_EXECUTION_NOT_AUTHORIZED"?error.message:"EXECUTION_INTERRUPTED"});
   if(activeWallet?.status==="SUBMITTED")store.tradeExecution.updateWallet(execution.execution_id,activeWallet.ordinal,{status:"UNKNOWN",reason:"SUBMISSION_UNCERTAIN"});
   const latest=store.tradeExecution.getExecution(execution.execution_id);return store.tradeExecution.finishExecution(execution.execution_id,latest.wallets.some(wallet=>wallet.status==="UNKNOWN")?"STOPPED_UNKNOWN":"FAILED",error.message);
  }finally{activeExecutions.delete(execution.execution_id);activeProjects.delete(projectId)}
 }
 async function reconcile(projectId,executionId){
  if(!executionAdapter||typeof executionAdapter.reconcile!=="function")throw Error("PROJECT_TRADE_EXECUTION_DISABLED");
  const execution=store.tradeExecution.getExecution(executionId);if(execution.project_id!==projectId)throw Error("PROJECT_TRADE_PROJECT_MISMATCH");if(activeExecutions.has(executionId))throw Error("PROJECT_TRADE_EXECUTION_BUSY");
  let unknown=false,interrupted=false;
  for(const wallet of execution.wallets){
   if(wallet.status==="PREPARING"&&!wallet.signature){store.tradeExecution.updateWallet(executionId,wallet.ordinal,{status:"REJECTED",reason:"PREPARATION_INTERRUPTED"});interrupted=true;continue}
   if(!["SUBMITTED","UNKNOWN"].includes(wallet.status)||!wallet.signature)continue;
   const result=await executionAdapter.reconcile({signature:wallet.signature});
   store.tradeExecution.updateWallet(executionId,wallet.ordinal,{status:result.status,signature:wallet.signature,reason:result.reason});if(result.status==="UNKNOWN")unknown=true;
  }
  const refreshed=store.tradeExecution.getExecution(executionId);if(unknown)return store.tradeExecution.finishExecution(executionId,"STOPPED_UNKNOWN","CONFIRMATION_PENDING");
  if(interrupted)return store.tradeExecution.finishExecution(executionId,"FAILED","PREPARATION_INTERRUPTED");
  if(refreshed.wallets.some(w=>w.status==="NOT_ATTEMPTED"))return store.tradeExecution.finishExecution(executionId,"FAILED",execution.status==="STOPPED_UNKNOWN"?"BATCH_STOPPED_AFTER_UNKNOWN":"EXECUTION_INTERRUPTED");
  if(refreshed.wallets.every(w=>["CONFIRMED","FAILED","REJECTED"].includes(w.status)))return store.tradeExecution.finishExecution(executionId,"COMPLETED");
  return refreshed;
 }
 return {executionAvailable:!!executionAdapter,createPreview,execute,reconcile,getPreview:previewId=>store.tradeExecution.getPreview(previewId),getExecution:executionId=>store.tradeExecution.getExecution(executionId)};
}
