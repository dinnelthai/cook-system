import test from "node:test";
import assert from "node:assert/strict";
import {
  quoteExactQuoteInBuy,
  quoteExactTokenOutBuy,
  quoteExactTokenInSell,
  quoteV3ExactTokenOutBuy,
  quoteV3ExactQuoteInBuy,
  quoteMayhemExactTokenOutBuy,
  quoteMayhemExactQuoteInBuy,
} from "../src/adapters/pump/quote-engine.mjs";

const fees = { protocolFeeBps: 100, creatorFeeBps: 50 };
const curve = {
  virtualTokenReserves: "1000",
  virtualQuoteReserves: "1000",
  realTokenReserves: "100",
  realQuoteReserves: "200",
  tokenTotalSupply: "1100",
  isMayhemMode: false,
};

test("exact quote-in buy uses Pump's budget-minus-one fee stripping", () => {
  const quote = quoteExactQuoteInBuy({
    spendableQuoteIn: "1000000000",
    virtualTokenReserves: "1073000000000000",
    virtualQuoteReserves: "30000000000",
    realTokenReserves: "793100000000000",
    ...fees,
  });
  assert.equal(quote.method, "exact_quote_in");
  assert.equal(quote.curve_input_base_units, "985221674");
  assert.equal(quote.protocol_fee_base_units, "9852217");
  assert.equal(quote.creator_fee_base_units, "4926109");
  assert.equal(quote.output_base_units, "34117646995895");
  assert.equal(quote.unspent_input_base_units, "0");
});

test("exact token-out buy adds ceiling-rounded protocol and creator fees", () => {
  const quote = quoteExactTokenOutBuy({
    tokenAmountOut: "100",
    virtualTokenReserves: "1000",
    virtualQuoteReserves: "1000",
    realTokenReserves: "100",
    ...fees,
  });
  assert.equal(quote.curve_input_base_units, "111");
  assert.equal(quote.protocol_fee_base_units, "2");
  assert.equal(quote.creator_fee_base_units, "1");
  assert.equal(quote.input_base_units, "114");
  assert.equal(quote.output_base_units, "100");
});

test("exact token-in sell subtracts fees from gross constant-product output", () => {
  const quote = quoteExactTokenInSell({
    tokenAmountIn: "100",
    virtualTokenReserves: "1000",
    virtualQuoteReserves: "1000",
    ...fees,
  });
  assert.equal(quote.method, "exact_token_in");
  assert.equal(quote.curve_input_base_units, "100");
  assert.equal(quote.output_base_units, "88");
  assert.equal(quote.protocol_fee_base_units, "1");
  assert.equal(quote.creator_fee_base_units, "1");
});

test("V3 exact token-out quote splits a completing buy into curve and pool legs", () => {
  const quote = quoteV3ExactTokenOutBuy({
    tokenAmountOut: "120",
    bondingCurve: curve,
    curveBaseTokenBalance: "500",
    poolMigrationFee: "10",
    ...fees,
  });
  assert.equal(quote.method, "v3_synthetic_migration_exact_token_out");
  assert.equal(quote.output_base_units, "120");
  assert.equal(quote.legs.length, 2);
  assert.equal(quote.legs[0].venue, "bonding_curve");
  assert.equal(quote.legs[0].token_out, "100");
  assert.equal(quote.legs[1].venue, "synthetic_pumpswap_pool");
  assert.equal(quote.legs[1].token_out, "20");
  assert.equal(quote.legs[1].pool_base_before, "400");
  assert.equal(quote.legs[1].pool_quote_before, "304");
});

test("V3 exact quote-in spends the residual budget against the synthetic pool", () => {
  const quote = quoteV3ExactQuoteInBuy({
    spendableQuoteIn: "200",
    bondingCurve: curve,
    curveBaseTokenBalance: "500",
    poolMigrationFee: "10",
    ...fees,
  });
  assert.equal(quote.method, "v3_synthetic_migration_exact_quote_in");
  assert.equal(quote.legs[0].venue, "bonding_curve");
  assert.equal(quote.legs[0].token_out, "100");
  assert.equal(quote.legs[1].venue, "synthetic_pumpswap_pool");
  assert.equal(quote.legs[1].token_out, "85");
  assert.equal(quote.output_base_units, "185");
  assert.equal(quote.unspent_input_base_units, "0");
});

test("Mayhem never uses synthetic migration and obeys partial_fill", () => {
  assert.throws(
    () => quoteMayhemExactTokenOutBuy({
      tokenAmountOut: "120",
      bondingCurve: { ...curve, isMayhemMode: true },
      ...fees,
    }),
    (error) => error.code === "MAYHEM_PARTIAL_FILL_REQUIRED",
  );
  const partial = quoteMayhemExactTokenOutBuy({
    tokenAmountOut: "120",
    bondingCurve: { ...curve, isMayhemMode: true },
    partialFill: true,
    ...fees,
  });
  assert.equal(partial.status, "PARTIAL_FILL");
  assert.equal(partial.output_base_units, "100");
  assert.equal(partial.legs.length, 1);
});

test("Mayhem exact quote-in leaves unspent budget after partial fill", () => {
  assert.throws(
    () => quoteMayhemExactQuoteInBuy({
      spendableQuoteIn: "200",
      bondingCurve: { ...curve, isMayhemMode: true },
      ...fees,
    }),
    (error) => error.code === "MAYHEM_PARTIAL_FILL_REQUIRED",
  );
  const partial = quoteMayhemExactQuoteInBuy({
    spendableQuoteIn: "200",
    bondingCurve: { ...curve, isMayhemMode: true },
    partialFill: true,
    ...fees,
  });
  assert.equal(partial.status, "PARTIAL_FILL");
  assert.equal(partial.output_base_units, "100");
  assert.equal(partial.unspent_input_base_units, "86");
});

test("synthetic migration rejects missing pool liquidity and pool drain requests", () => {
  assert.throws(
    () => quoteV3ExactTokenOutBuy({
      tokenAmountOut: "120",
      bondingCurve: curve,
      curveBaseTokenBalance: "99",
      poolMigrationFee: "10",
      ...fees,
    }),
    /below remaining real reserves/,
  );
  assert.throws(
    () => quoteV3ExactTokenOutBuy({
      tokenAmountOut: "500",
      bondingCurve: curve,
      curveBaseTokenBalance: "500",
      poolMigrationFee: "10",
      ...fees,
    }),
    /below pool base reserves/,
  );
});
