import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createProjectTradePreview} from '../src/inner-market/project-trade-preview.mjs';
const project={project_id:'p',revision:3,network:{cluster:'localnet',genesis_hash:'g',quote_mint:'sol'},token:{mint:'mint'},lifecycle:{stage:'PUMPSWAP_ACTIVE',operational_status:'ACTIVE'},execution_policy:{mode:'LOCALNET_AUTHORIZED',enabled:true,authorization:{genesis_hash:'g'}},markets:[{market_id:'m',venue:'PUMP_SWAP',market_account:'pool',verification_status:'VERIFIED',identity:{token_mint:'mint',quote_mint:'sol',curve_program_id:'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA'}}],limits:{max_project_budget_base_units:'1000',max_order_size_base_units:'500',max_wallet_exposure_base_units:'500'},wallet_groups:[{members:[{wallet_address:'w',role:'EXECUTOR',enabled:true,allocation_limit_base_units:'500'}]}]};
const request={project_id:'p',revision:3,market_id:'m',side:'buy',orders:[{wallet:'w',amount_base_units:'100'}]};
const portfolio={genesis_hash:'g',wallets:[{address:'w',balance_status:'AVAILABLE',balance_lamports:'200',token_accounts_status:'AVAILABLE',token_accounts:[]}]};
test('preview binds project, market and available balances without authorizing execution', async()=>{
 const service=createProjectTradePreview({projects:{get:()=>project},wallets:{list:async()=>[{address:'w'}]},portfolio:{snapshot:async()=>portfolio},market:{market:async()=>({mint:'mint',pool:'pool'})},genesis:'g'});
 const result=await service(request);assert.equal(result.total_base_units,'100');assert.equal(result.execution_enabled,false);assert.equal(result.quote_status,'UNAVAILABLE');
});
test('rejects insufficient balances and project market mismatches',async()=>{
 const opts={projects:{get:()=>project},wallets:{list:async()=>[{address:'w'}]},portfolio:{snapshot:async()=>portfolio},genesis:'g'};
 await assert.rejects(createProjectTradePreview({...opts,projects:{get:()=>({...project,markets:[{...project.markets[0],identity:{...project.markets[0].identity,token_mint:'other'}}]})}})(request),/PROJECT_MARKET_MISMATCH/);
 await assert.rejects(createProjectTradePreview(opts)({...request,orders:[{wallet:'w',amount_base_units:'201'}]}),/INSUFFICIENT_BALANCE/);
});
