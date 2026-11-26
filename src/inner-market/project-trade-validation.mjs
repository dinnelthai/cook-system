import {PUMP_AMM_PROGRAM_ID} from "../adapters/pump/pump-decoder.mjs";
// Validates the claimed scope of a proposed Localnet trade. This does not
// quote, sign, or submit transactions.
export function validateProjectTrade(project, request, managedWallets, {genesis} = {}) {
 const fail = code => { throw Error(code); };
 if (!project || !request || request.project_id !== project.project_id || request.revision !== project.revision) fail('PROJECT_REVISION_CONFLICT');
 if (project.network?.cluster !== 'localnet' || !genesis || project.network.genesis_hash !== genesis) fail('PROJECT_NETWORK_MISMATCH');
 if (project.execution_policy?.mode !== 'LOCALNET_AUTHORIZED' || project.execution_policy.enabled !== true || project.execution_policy.authorization?.genesis_hash !== genesis) fail('PROJECT_EXECUTION_NOT_AUTHORIZED');
 if (project.lifecycle?.operational_status !== 'ACTIVE' || !['PUMPSWAP_ACTIVE','EXIT_IN_PROGRESS'].includes(project.lifecycle?.stage)) fail('PROJECT_NOT_ACTIVE');
 const market = project.markets?.find(m => m.market_id === request.market_id);
 if (!market || market.venue !== 'PUMP_SWAP' || market.verification_status !== 'VERIFIED' || market.identity?.token_mint !== project.token?.mint || market.identity?.quote_mint !== project.network.quote_mint || market.identity?.curve_program_id !== PUMP_AMM_PROGRAM_ID) fail('PROJECT_MARKET_MISMATCH');
 if (!['buy','sell'].includes(request.side) || !Array.isArray(request.orders) || request.orders.length < 1 || request.orders.length > 20 || !Array.isArray(managedWallets)) fail('INVALID_TRADE_REQUEST');
 const registered = new Map((project.wallet_groups ?? []).flatMap(g => g.members.filter(m => m.enabled&&['OPERATOR','EXECUTOR'].includes(m.role)).map(m => [m.wallet_address,m])));
 const owned = new Set(managedWallets), seen = new Set(),limits=project.limits??{};
 if([limits.max_project_budget_base_units,limits.max_order_size_base_units,limits.max_wallet_exposure_base_units].some(v=>typeof v!=='string'||!/^[1-9][0-9]*$/.test(v)))fail('EXECUTION_LIMITS_REQUIRED');
 let total=0n;
 const orders = request.orders.map(o => {
  const member=registered.get(o?.wallet);
  if (!o || typeof o.wallet !== 'string' || seen.has(o.wallet) || !member || !owned.has(o.wallet)) fail('PROJECT_WALLET_MISMATCH');
  if (typeof o.amount_base_units !== 'string' || !/^[1-9][0-9]{0,19}$/.test(o.amount_base_units) || BigInt(o.amount_base_units) > 18446744073709551615n) fail('INVALID_TRADE_AMOUNT');
  const amount=BigInt(o.amount_base_units),memberLimit=member.allocation_limit_base_units;
  if(amount>BigInt(limits.max_order_size_base_units)||amount>BigInt(limits.max_wallet_exposure_base_units)||(memberLimit!==null&&amount>BigInt(memberLimit)))fail('PROJECT_TRADE_LIMIT_EXCEEDED');
  total+=amount;seen.add(o.wallet); return {wallet:o.wallet,amount_base_units:o.amount_base_units};
 });
 if(total>BigInt(limits.max_project_budget_base_units))fail('PROJECT_TRADE_LIMIT_EXCEEDED');
 return {project_id:project.project_id,revision:project.revision,market_id:market.market_id,market_account:market.market_account,market_identity_digest:market.identity_digest??null,mint:project.token.mint,side:request.side,orders};
}
