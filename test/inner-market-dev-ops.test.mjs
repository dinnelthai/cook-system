import test from "node:test";
import assert from "node:assert/strict";
import { calculateCurveValuation, impliedPriceForMarketCap } from "../src/inner-market/curve-valuation.mjs";
import { calculateLaunchBudget, allocateTokenSupply } from "../src/inner-market/launch-budget.mjs";
import { replayTreasuryTradePnl, replayTreasuryPortfolioPnl } from "../src/inner-market/treasury-pnl.mjs";
import { reconcileExecutionBatch } from "../src/inner-market/batch-reconciliation.mjs";
import { evaluateInnerMarketPolicy } from "../src/inner-market/policy-guard.mjs";
import { buildTreasuryPositionMonitor, quoteNextTreasuryBuyScenario } from "../src/inner-market/treasury-position-monitor.mjs";

function syntheticTrade(eventId, sequence, eventKind, tokenAmount, quoteAmount, fee = "0", status = "CONFIRMED") {
  return {
    event_id: eventId,
    provenance: "synthetic",
    event_time_ms: sequence * 1000,
    ordering: { ordering_confidence: "synthetic", event_sequence: sequence },
    status,
    event_kind: eventKind,
    token_amount_base_units: tokenAmount,
    quote_amount_base_units: quoteAmount,
    fee_quote_base_units: fee,
  };
}

test("curve valuation keeps virtual pricing reserves separate from real balances", () => {
  const result = calculateCurveValuation({
    virtualTokenReservesBaseUnits: "1000000000", virtualQuoteReservesBaseUnits: "100000000",
    realTokenReservesBaseUnits: "700000000", realQuoteReservesBaseUnits: "12000000",
    tokenDecimals: 0, quoteDecimals: 0, circulatingSupplyBaseUnits: "200000000",
    totalSupplyBaseUnits: "1000000000", treasuryTokenBalanceBaseUnits: "100000000",
  });
  assert.equal(result.price_quote_per_token, "0.1");
  assert.equal(result.market_cap_quote, "20000000");
  assert.equal(result.fdv_quote, "100000000");
  assert.equal(result.reserves.real_quote_base_units, "12000000");
});

test("target market cap helper returns implied price, not required buy capital", () => {
  const result = impliedPriceForMarketCap({ targetMarketCapQuote: "2000000", circulatingSupplyBaseUnits: "200000000", tokenDecimals: 0 });
  assert.equal(result.implied_price_quote_per_token, "0.01");
  assert.match(result.note, /not a capital requirement/);
});

test("launch budget uses integer base units and rounds contingency up", () => {
  const result = calculateLaunchBudget({ creationAndNetworkCostsBaseUnits: "100", treasuryReserveBaseUnits: "200", operatingReserveBaseUnits: "50", contingencyBps: "500" });
  assert.equal(result.subtotal_base_units, "350");
  assert.equal(result.contingency_base_units, "18");
  assert.equal(result.total_budget_base_units, "368");
});

test("token allocations reconcile exactly", () => {
  const result = allocateTokenSupply("1001", [
    { name: "public", bps: "5000" }, { name: "treasury", bps: "3000" }, { name: "ecosystem", bps: "2000" },
  ]);
  assert.deepEqual(result.map((item) => item.token_amount_base_units), ["500", "300", "201"]);
  assert.equal(result.reduce((sum, item) => sum + BigInt(item.token_amount_base_units), 0n), 1001n);
});

test("treasury PnL uses confirmed trades only and weighted-average cost", () => {
  const result = replayTreasuryTradePnl({
    events: [
      syntheticTrade("1", 1, "CURVE_BUY_EXECUTED", "100", "1000", "10"),
      syntheticTrade("2", 2, "CURVE_BUY_EXECUTED", "100", "1200", "10"),
      syntheticTrade("3", 3, "CURVE_SELL_EXECUTED", "100", "1500", "10"),
      syntheticTrade("4", 4, "CURVE_SELL_EXECUTED", "100", "2000", "10", "PENDING"),
    ],
  });
  assert.equal(result.ending_token_balance_base_units, "100");
  assert.equal(result.remaining_cost_basis_quote_base_units, "1110");
  assert.equal(result.realized_pnl_quote_base_units, "380");
  assert.equal(result.position.average_cost_quote_per_token, "11.1");
  assert.equal(result.position.total_bought_token_amount_base_units, "200");
  assert.equal(result.position.total_sold_token_amount_base_units, "100");
  assert.equal(result.cash_flow.net_cash_deployed_quote_base_units, "730");
  assert.equal(result.position_journal.length, 3);
  assert.equal(result.position_journal[1].average_cost_quote_per_token_after, "11.1");
  assert.equal(result.ignored_unconfirmed_count, 1);
});

test("treasury ledger rejects sells larger than verified inventory", () => {
  assert.throws(() => replayTreasuryTradePnl({
    events: [syntheticTrade("x", 1, "CURVE_SELL_EXECUTED", "1", "1")],
  }), /exceeds treasury token inventory/);
});

test("batch reconciliation deduplicates signatures and separates receipt states", () => {
  const result = reconcileExecutionBatch([
    { batch_id: "b1", signature: "sig1", status: "CONFIRMED", side: "BUY", quote_amount_base_units: "100", token_amount_base_units: "20", fee_quote_base_units: "2" },
    { batch_id: "b1", signature: "sig2", status: "FAILED", side: "SELL" },
  ]);
  assert.equal(result[0].confirmed_count, 1);
  assert.equal(result[0].failed_count, 1);
  assert.equal(result[0].confirmed_buy_quote_spent_base_units, "102");
  assert.throws(() => reconcileExecutionBatch([
    { batch_id: "b1", signature: "same", status: "PENDING" },
    { batch_id: "b2", signature: "same", status: "PENDING" },
  ]), /duplicate transaction signature/);
});

test("policy guard pauses on stale or unreconciled market state", () => {
  const result = evaluateInnerMarketPolicy({
    market: { reconciled: false, dataComplete: true, complete: false, lifecycle: "bonding_curve", observedAtMs: 0 },
    treasury: { quoteSpentBaseUnits: "50", tokenBalanceBaseUnits: "10" },
    limits: { maxDataAgeMs: 1000, maxQuoteBudgetBaseUnits: "100", maxTokenInventoryBaseUnits: "100" },
    nowMs: 2000,
  });
  assert.equal(result.status, "PAUSE_AND_RECONCILE");
  assert.ok(result.reasons.includes("CURVE_STATE_NOT_RECONCILED"));
  assert.ok(result.reasons.includes("STALE_OR_FUTURE_MARKET_DATA"));
});
test("policy guard permits only a fresh, reconciled, complete-data active curve within configured limits", () => {
  const result = evaluateInnerMarketPolicy({
    market: { reconciled: true, dataComplete: true, complete: false, lifecycle: "bonding_curve", observedAtMs: 1500 },
    treasury: { quoteSpentBaseUnits: "50", tokenBalanceBaseUnits: "10" },
    limits: { maxDataAgeMs: 1000, maxQuoteBudgetBaseUnits: "100", maxTokenInventoryBaseUnits: "100" },
    nowMs: 2000,
  });
  assert.equal(result.status, "WITHIN_CONFIGURED_LIMITS");
  assert.deepEqual(result.reasons, []);
  assert.equal(result.execution_enabled, false);
});

test("policy guard pauses when the curve has completed even if data is fresh", () => {
  const result = evaluateInnerMarketPolicy({
    market: { reconciled: true, dataComplete: true, complete: true, lifecycle: "complete_pending_migration", observedAtMs: 1900 },
    treasury: { quoteSpentBaseUnits: "50", tokenBalanceBaseUnits: "10" },
    limits: { maxDataAgeMs: 1000, maxQuoteBudgetBaseUnits: "100", maxTokenInventoryBaseUnits: "100" },
    nowMs: 2000,
  });
  assert.equal(result.status, "PAUSE_AND_RECONCILE");
  assert.ok(result.reasons.includes("NOT_IN_BONDING_CURVE_PHASE"));
});
test("policy guard checks each proposed add-on against cumulative remaining budgets", () => {
  const base = {
    market: { reconciled: true, dataComplete: true, complete: false, lifecycle: "bonding_curve", observedAtMs: 1900 },
    treasury: { quoteSpentBaseUnits: "80", tokenBalanceBaseUnits: "90" },
    limits: { maxDataAgeMs: 1000, maxQuoteBudgetBaseUnits: "100", maxTokenInventoryBaseUnits: "100" },
    nowMs: 2000,
  };
  const accepted = evaluateInnerMarketPolicy({ ...base, proposed: { quoteSpendBaseUnits: "20", tokenAcquisitionBaseUnits: "10" } });
  assert.equal(accepted.status, "WITHIN_CONFIGURED_LIMITS");
  assert.equal(accepted.remaining_quote_budget_base_units, "20");
  const rejected = evaluateInnerMarketPolicy({ ...base, proposed: { quoteSpendBaseUnits: "21", tokenAcquisitionBaseUnits: "11" } });
  assert.equal(rejected.status, "MANUAL_REVIEW_REQUIRED");
  assert.ok(rejected.reasons.includes("PROPOSED_ADD_ON_EXCEEDS_REMAINING_QUOTE_BUDGET"));
  assert.ok(rejected.reasons.includes("PROPOSED_ADD_ON_EXCEEDS_REMAINING_TOKEN_CAP"));
  assert.equal(rejected.execution_enabled, false);
});
test("a later add-on buy recomputes average cost on the remaining position", () => {
  const result = replayTreasuryTradePnl({
    events: [
      syntheticTrade("a1", 1, "CURVE_BUY_EXECUTED", "100", "1000", "10"),
      syntheticTrade("a2", 2, "CURVE_BUY_EXECUTED", "100", "1200", "10"),
      syntheticTrade("a3", 3, "CURVE_SELL_EXECUTED", "100", "1500", "10"),
      syntheticTrade("a4", 4, "CURVE_BUY_EXECUTED", "50", "750", "10"),
    ],
  });
  assert.equal(result.position.ending_token_balance_base_units, "150");
  assert.equal(result.position.remaining_cost_basis_quote_base_units, "1870");
  assert.equal(result.position.average_cost_quote_per_token, "12.466666666666");
  assert.equal(result.cash_flow.total_buy_cost_including_fees_quote_base_units, "2980");
  assert.equal(result.cash_flow.net_cash_deployed_quote_base_units, "1490");
  assert.equal(result.realized_pnl_quote_base_units, "380");
  assert.equal(result.position_journal.length, 4);
});

const activeCurveForTreasury = (realToken = "700000") => ({
  market: { chain_id: "solana", network: "mainnet-beta", token_mint: "fixture-mint", quote_mint: "sol", curve_program_id: "pump" },
  lifecycle: "bonding_curve",
  complete: false,
  as_of_event_id: "curve-snapshot",
  virtual_token_reserves_base_units: "1000000",
  virtual_quote_reserves_base_units: "100000",
  real_token_reserves_base_units: realToken,
  real_quote_reserves_base_units: "0",
  token_total_supply_base_units: "1000000",
  protocol_fees_base_units: "0",
  creator_fees_base_units: "0",
});

test("Treasury monitor values the whole position with an exact curve sell quote", () => {
  const ledger = replayTreasuryTradePnl({
    events: [syntheticTrade("monitor-buy", 1, "CURVE_BUY_EXECUTED", "1000", "100")],
    endingTokenBalanceSnapshotBaseUnits: "1000",
  });
  const report = buildTreasuryPositionMonitor({
    ledger,
    curveState: activeCurveForTreasury(),
    protocolFeeBps: "0",
    creatorFeeBps: "0",
    tokenDecimals: 0,
    quoteDecimals: 0,
    initialRealTokenReservesBaseUnits: "700000",
    marketReconciliationStatus: "PASS",
  });
  assert.equal(report.scope, "PUMP_BONDING_CURVE_ONLY");
  assert.equal(report.position.token_balance_base_units, "1000");
  assert.ok(BigInt(report.pnl.estimated_full_position_liquidation_quote_base_units) > 0n);
  assert.ok(BigInt(report.curve_risk.estimated_liquidation_quote_base_units) < BigInt(report.curve_risk.marginal_mark_value_quote_base_units));
  assert.equal(report.risk_level, "HIGH");
  assert.ok(report.risk_flags.some((flag) => flag.code === "POSITION_BELOW_COST_ON_CURVE_EXIT"));
});

test("next-buy scenario reports post-buy average cost and incremental liquidation PnL", () => {
  const scenario = quoteNextTreasuryBuyScenario({
    curveState: activeCurveForTreasury(),
    currentTokenBalanceBaseUnits: "1000",
    currentCostBasisQuoteBaseUnits: "100",
    currentRealizedPnlQuoteBaseUnits: "0",
    protocolFeeBps: "0",
    creatorFeeBps: "0",
    tokenDecimals: 0,
    quoteDecimals: 0,
    quoteBudgetBaseUnits: "10",
    estimatedNetworkFeeBaseUnits: "1",
  });
  assert.equal(scenario.status, "QUOTED");
  assert.ok(BigInt(scenario.token_out_base_units) > 0n);
  assert.equal(scenario.post_buy_token_balance_base_units, (1000n + BigInt(scenario.token_out_base_units)).toString());
  assert.equal(scenario.post_buy_remaining_cost_basis_quote_base_units, (111n).toString());
  assert.ok(scenario.post_buy_average_cost_quote_per_token);
  assert.ok(scenario.post_buy_estimated_full_position_liquidation_quote_base_units);
  assert.ok(scenario.incremental_estimated_pnl_quote_base_units !== undefined);
  assert.equal(scenario.execution_enabled, false);
});

test("next-buy scenario stops at the inner-market graduation boundary", () => {
  const scenario = quoteNextTreasuryBuyScenario({
    curveState: activeCurveForTreasury("50"),
    currentTokenBalanceBaseUnits: "1000",
    currentCostBasisQuoteBaseUnits: "100",
    protocolFeeBps: "0",
    creatorFeeBps: "0",
    tokenDecimals: 0,
    quoteDecimals: 0,
    quoteBudgetBaseUnits: "10",
  });
  assert.equal(scenario.status, "WOULD_COMPLETE_CURVE");
  assert.equal(scenario.curve_completion, true);
  assert.equal(scenario.post_buy_unrealized_pnl_quote_base_units, null);
  assert.equal(scenario.execution_enabled, false);
});

test("Treasury monitor pauses when wallet inventory does not reconcile", () => {
  const ledger = replayTreasuryTradePnl({
    events: [syntheticTrade("monitor-buy", 1, "CURVE_BUY_EXECUTED", "1000", "100")],
    endingTokenBalanceSnapshotBaseUnits: "999",
  });
  const report = buildTreasuryPositionMonitor({
    ledger,
    curveState: activeCurveForTreasury(),
    protocolFeeBps: "0",
    creatorFeeBps: "0",
    tokenDecimals: 0,
    quoteDecimals: 0,
    marketReconciliationStatus: "PASS",
  });
  assert.equal(report.risk_level, "PAUSE_AND_RECONCILE");
  assert.ok(report.risk_flags.some((flag) => flag.code === "TREASURY_INVENTORY_MISMATCH"));
});

test("unknown opening inventory basis is never reported as zero-cost profit", () => {
  const result = replayTreasuryTradePnl({
    openingTokenBalanceBaseUnits: "100",
    events: [],
    currentLiquidationQuoteBaseUnits: "150",
  });
  assert.equal(result.cost_basis_complete, false);
  assert.equal(result.position.average_cost_quote_per_token, null);
  assert.equal(result.unrealized_pnl_on_liquidation_quote_base_units, null);
  assert.equal(result.total_pnl_on_liquidation_quote_base_units, null);
});

test("Treasury ledger excludes confirmed trades from wallets outside the configured Treasury set", () => {
  const event = {
    ...syntheticTrade("external-wallet-buy", 1, "CURVE_BUY_EXECUTED", "100", "1000"),
    actor_address: "not-treasury-wallet",
  };
  const result = replayTreasuryTradePnl({
    events: [event],
    treasuryWalletAddresses: ["treasury-wallet"],
  });
  assert.equal(result.confirmed_buy_count, 0);
  assert.equal(result.ignored_non_treasury_event_count, 1);
  assert.equal(result.ending_token_balance_base_units, "0");
});

test("Treasury portfolio accounts each wallet separately before aggregation", () => {
  const walletA = "treasury-wallet-a";
  const walletB = "treasury-wallet-b";
  const events = [
    { ...syntheticTrade("a-buy", 1, "CURVE_BUY_EXECUTED", "100", "1000"), actor_address: walletA },
    { ...syntheticTrade("b-buy", 2, "CURVE_BUY_EXECUTED", "50", "600"), actor_address: walletB },
    { ...syntheticTrade("a-sell", 3, "CURVE_SELL_EXECUTED", "20", "300"), actor_address: walletA },
  ];
  const result = replayTreasuryPortfolioPnl({
    treasuryWalletAddresses: [walletA, walletB],
    events,
    endingBalancesByWallet: { [walletA]: "80", [walletB]: "50" },
  });
  assert.equal(result.wallet_count, 2);
  assert.equal(result.position.ending_token_balance_base_units, "130");
  assert.equal(result.position.total_bought_token_amount_base_units, "150");
  assert.equal(result.position.total_sold_token_amount_base_units, "20");
  assert.equal(result.position.remaining_cost_basis_quote_base_units, "1400");
  assert.equal(result.position.average_cost_quote_per_token, "10.76923076923");
  assert.equal(result.realized_pnl_quote_base_units, "100");
  assert.equal(result.inventory_reconciliation, "MATCH");
  assert.equal(result.wallets[0].ledger.position.ending_token_balance_base_units, "80");
  assert.equal(result.wallets[1].ledger.position.ending_token_balance_base_units, "50");
});

test("Treasury portfolio rejects a wallet selling another wallet's inventory", () => {
  const walletA = "treasury-wallet-a";
  const walletB = "treasury-wallet-b";
  const events = [
    { ...syntheticTrade("a-buy", 1, "CURVE_BUY_EXECUTED", "100", "1000"), actor_address: walletA },
    { ...syntheticTrade("b-buy", 2, "CURVE_BUY_EXECUTED", "100", "1000"), actor_address: walletB },
    { ...syntheticTrade("a-over-sell", 3, "CURVE_SELL_EXECUTED", "150", "1500"), actor_address: walletA },
  ];
  assert.throws(() => replayTreasuryPortfolioPnl({
    treasuryWalletAddresses: [walletA, walletB],
    events,
  }), /exceeds treasury token inventory/);
});
