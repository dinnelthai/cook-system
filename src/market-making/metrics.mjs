function finite(value, name) {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new TypeError(`${name} must be a finite number`);
  return value;
}

function positive(value, name) {
  const n = finite(value, name);
  if (n <= 0) throw new RangeError(`${name} must be positive`);
  return n;
}

export function calculateMarketRegime({ prices, highWatermark = null }) {
  if (!Array.isArray(prices) || prices.length < 2) throw new TypeError("prices must contain at least two observations");
  const values = prices.map((price, index) => positive(price, `prices[${index}]`));
  const returns = values.slice(1).map((price, index) => Math.log(price / values[index]));
  const realizedVolatility = Math.sqrt(returns.reduce((sum, value) => sum + value * value, 0) / returns.length);
  const trendReturn = values.at(-1) / values[0] - 1;
  const high = highWatermark === null ? Math.max(...values) : Math.max(positive(highWatermark, "highWatermark"), ...values);
  const drawdown = values.at(-1) / high - 1;
  return {
    observations: values.length,
    last_price: values.at(-1),
    trend_return: trendReturn,
    realized_volatility: realizedVolatility,
    drawdown,
    rolling_high: high,
  };
}

export function calculateInventoryExposure({ baseAmount, basePrice, quoteAmount, targetBaseWeight = 0.5 }) {
  const base = finite(baseAmount, "baseAmount");
  const quote = finite(quoteAmount, "quoteAmount");
  const price = positive(basePrice, "basePrice");
  const target = finite(targetBaseWeight, "targetBaseWeight");
  if (base < 0 || quote < 0) throw new RangeError("inventory amounts cannot be negative");
  if (target < 0 || target > 1) throw new RangeError("targetBaseWeight must be between 0 and 1");
  const baseValue = base * price;
  const totalValue = baseValue + quote;
  if (totalValue === 0) return { base_value: 0, quote_value: 0, total_value: 0, base_weight: null, inventory_skew: null };
  const baseWeight = baseValue / totalValue;
  return { base_value: baseValue, quote_value: quote, total_value: totalValue, base_weight: baseWeight, inventory_skew: baseWeight - target };
}

export function calculateConstantProductImpermanentLoss({ initialPrice, currentPrice }) {
  const p0 = positive(initialPrice, "initialPrice");
  const p1 = positive(currentPrice, "currentPrice");
  const ratio = p1 / p0;
  const lpVsHodl = (2 * Math.sqrt(ratio)) / (1 + ratio) - 1;
  return { price_ratio: ratio, lp_vs_hodl_ratio: lpVsHodl, lp_vs_hodl_percent: lpVsHodl * 100 };
}

export function calculateLpNetEconomics({
  initialCapital, currentPositionValue, accruedFees = 0, claimedFees = 0, transactionCosts = 0,
}) {
  const initial = positive(initialCapital, "initialCapital");
  const position = finite(currentPositionValue, "currentPositionValue");
  const accrued = finite(accruedFees, "accruedFees");
  const claimed = finite(claimedFees, "claimedFees");
  const costs = finite(transactionCosts, "transactionCosts");
  if ([position, accrued, claimed, costs].some((value) => value < 0)) throw new RangeError("values cannot be negative");
  const totalValue = position + accrued + claimed - costs;
  return {
    ending_value_net: totalValue,
    absolute_pnl: totalValue - initial,
    absolute_return: (totalValue - initial) / initial,
    fee_income: accrued + claimed,
    transaction_costs: costs,
  };
}