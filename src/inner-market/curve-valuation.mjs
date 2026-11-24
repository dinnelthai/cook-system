import { parseBaseUnits } from "../core/integer.mjs";

const DISPLAY_SCALE_DIGITS = 12;
const DISPLAY_SCALE = 10n ** BigInt(DISPLAY_SCALE_DIGITS);

function decimals(value, name) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 18) {
    throw new RangeError(name + " must be an integer from 0 to 18");
  }
  return 10n ** BigInt(value);
}

function formatScaled(value, scale = DISPLAY_SCALE) {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const whole = absolute / scale;
  const fraction = (absolute % scale).toString().padStart(DISPLAY_SCALE_DIGITS, "0").replace(/0+$/, "");
  return (negative ? "-" : "") + whole.toString() + (fraction ? "." + fraction : "");
}

function parseDecimalScaled(value, name) {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]*)(\.[0-9]{1,12})?$/.test(value)) {
    throw new TypeError(name + " must be a non-negative decimal string with at most 12 fractional digits");
  }
  const parts = value.split(".");
  const whole = BigInt(parts[0]);
  const fraction = BigInt(((parts[1] || "") + "0".repeat(DISPLAY_SCALE_DIGITS)).slice(0, DISPLAY_SCALE_DIGITS));
  return whole * DISPLAY_SCALE + fraction;
}

/**
 * Read-only valuation from a confirmed Pump curve state.
 * Virtual reserves determine marginal curve price; real reserves are reported separately.
 * All supply and reserve inputs are canonical integer base-unit strings.
 */
export function calculateCurveValuation({
  virtualTokenReservesBaseUnits,
  virtualQuoteReservesBaseUnits,
  realTokenReservesBaseUnits,
  realQuoteReservesBaseUnits,
  tokenDecimals,
  quoteDecimals,
  circulatingSupplyBaseUnits,
  totalSupplyBaseUnits,
  treasuryTokenBalanceBaseUnits = "0",
  quoteUsdPrice = null,
}) {
  const virtualToken = parseBaseUnits(virtualTokenReservesBaseUnits, { name: "virtualTokenReservesBaseUnits" });
  const virtualQuote = parseBaseUnits(virtualQuoteReservesBaseUnits, { name: "virtualQuoteReservesBaseUnits" });
  const realToken = parseBaseUnits(realTokenReservesBaseUnits, { name: "realTokenReservesBaseUnits" });
  const realQuote = parseBaseUnits(realQuoteReservesBaseUnits, { name: "realQuoteReservesBaseUnits" });
  const circulating = parseBaseUnits(circulatingSupplyBaseUnits, { name: "circulatingSupplyBaseUnits" });
  const total = parseBaseUnits(totalSupplyBaseUnits, { name: "totalSupplyBaseUnits" });
  const treasury = parseBaseUnits(treasuryTokenBalanceBaseUnits, { name: "treasuryTokenBalanceBaseUnits" });
  const tokenScale = decimals(tokenDecimals, "tokenDecimals");
  const quoteScale = decimals(quoteDecimals, "quoteDecimals");
  if (virtualToken === 0n || virtualQuote === 0n) throw new RangeError("virtual reserves must be positive");
  if (circulating > total || treasury > total) throw new RangeError("circulating and treasury supply cannot exceed total supply");

  const priceQuoteScaled = (virtualQuote * tokenScale * DISPLAY_SCALE) / (virtualToken * quoteScale);
  const marketCapQuoteScaled = (priceQuoteScaled * circulating) / tokenScale;
  const fdvQuoteScaled = (priceQuoteScaled * total) / tokenScale;
  const treasuryValueQuoteScaled = (priceQuoteScaled * treasury) / tokenScale;

  const result = {
    valuation_basis: "pump_bonding_curve_virtual_reserves_marginal_price",
    price_quote_per_token: formatScaled(priceQuoteScaled),
    market_cap_quote: formatScaled(marketCapQuoteScaled),
    fdv_quote: formatScaled(fdvQuoteScaled),
    treasury_mark_to_market_quote: formatScaled(treasuryValueQuoteScaled),
    reserves: {
      virtual_token_base_units: virtualToken.toString(),
      virtual_quote_base_units: virtualQuote.toString(),
      real_token_base_units: realToken.toString(),
      real_quote_base_units: realQuote.toString(),
    },
    supply: {
      circulating_base_units: circulating.toString(),
      total_base_units: total.toString(),
      treasury_base_units: treasury.toString(),
    },
    warning: "Treasury mark-to-market is not realizable proceeds. Virtual reserves are pricing state, not withdrawable balances.",
  };

  if (quoteUsdPrice !== null) {
    const quoteUsdPriceScaled = parseDecimalScaled(quoteUsdPrice, "quoteUsdPrice");
    if (quoteUsdPriceScaled === 0n) throw new RangeError("quoteUsdPrice must be positive");
    const priceUsdScaled = (priceQuoteScaled * quoteUsdPriceScaled) / DISPLAY_SCALE;
    result.price_usd_per_token = formatScaled(priceUsdScaled);
    result.market_cap_usd = formatScaled((priceUsdScaled * circulating) / tokenScale);
    result.fdv_usd = formatScaled((priceUsdScaled * total) / tokenScale);
    result.treasury_mark_to_market_usd = formatScaled((priceUsdScaled * treasury) / tokenScale);
  }
  return result;
}

/** Implied valuation price only; deliberately does not estimate a buy budget or trade sequence. */
export function impliedPriceForMarketCap({ targetMarketCapQuote, circulatingSupplyBaseUnits, tokenDecimals }) {
  const target = parseDecimalScaled(targetMarketCapQuote, "targetMarketCapQuote");
  const circulating = parseBaseUnits(circulatingSupplyBaseUnits, { name: "circulatingSupplyBaseUnits" });
  const tokenScale = decimals(tokenDecimals, "tokenDecimals");
  if (target === 0n || circulating === 0n) throw new RangeError("target market cap and circulating supply must be positive");
  return { implied_price_quote_per_token: formatScaled((target * tokenScale) / circulating), note: "Valuation arithmetic only; not a capital requirement or execution target." };
}