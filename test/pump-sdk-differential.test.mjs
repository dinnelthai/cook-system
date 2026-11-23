import test from "node:test";
import assert from "node:assert/strict";
import BN from "bn.js";
import { PublicKey } from "@solana/web3.js";
import {
  getBuySolAmountFromTokenAmount,
  getSellSolAmountFromTokenAmount,
  getBuyV3QuoteAmountFromTokenAmount,
  getBuyV3TokenAmountFromQuoteAmount,
} from "@pump-fun/pump-sdk";
import {
  quoteExactTokenOutBuy,
  quoteExactTokenInSell,
  quoteV3ExactTokenOutBuy,
  quoteV3ExactQuoteInBuy,
} from "../src/adapters/pump/quote-engine.mjs";

const fees = { protocolFeeBps: 100, creatorFeeBps: 0 };
const bn = (value) => new BN(String(value));
const publicKey = (value) => new PublicKey(value);
const defaultKey = PublicKey.default;
const global = {
  feeBasisPoints: bn(100),
  creatorFeeBasisPoints: bn(0),
  poolMigrationFee: bn(10),
  buybackBasisPoints: bn(0),
};
const feeConfig = {
  flatFees: { lpFeeBps: bn(0), protocolFeeBps: bn(100), creatorFeeBps: bn(0) },
  feeTiers: [{
    marketCapLamportsThreshold: bn(0),
    fees: { lpFeeBps: bn(0), protocolFeeBps: bn(100), creatorFeeBps: bn(0) },
  }],
  stableFeeTiers: [],
  exoticFlatFees: { lpFeeBps: bn(0), protocolFeeBps: bn(100), creatorFeeBps: bn(0) },
};
const bondingCurve = {
  virtualTokenReserves: bn(1000),
  virtualQuoteReserves: bn(1000),
  realTokenReserves: bn(100),
  realQuoteReserves: bn(200),
  tokenTotalSupply: bn(1100),
  complete: false,
  creator: defaultKey,
  isMayhemMode: false,
  isCashbackCoin: false,
  quoteMint: defaultKey,
  creatorFeeBps: bn(0),
  canEditCreatorFee: false,
  isHolderReward: false,
  creatorFee: bn(0),
  protocolFees: bn(0),
  depth: 0,
  initialVirtualQuoteReserves: bn(1000),
  postCompleteBaseOut: bn(0),
  postCompleteQuoteIn: bn(0),
};

test("Pump SDK 4.3.1 is installed and exposes the pinned quote oracle functions", () => {
  for (const fn of [
    getBuySolAmountFromTokenAmount,
    getSellSolAmountFromTokenAmount,
    getBuyV3QuoteAmountFromTokenAmount,
    getBuyV3TokenAmountFromQuoteAmount,
  ]) assert.equal(typeof fn, "function");
});

test("exact token-out buy and exact token-in sell match Pump SDK 4.3.1", () => {
  const sdkBuy = getBuySolAmountFromTokenAmount({
    global,
    feeConfig,
    mintSupply: bn(1100),
    bondingCurve,
    amount: bn(100),
  });
  const localBuy = quoteExactTokenOutBuy({
    tokenAmountOut: "100",
    virtualTokenReserves: "1000",
    virtualQuoteReserves: "1000",
    realTokenReserves: "100",
    ...fees,
  });
  assert.equal(localBuy.input_base_units, sdkBuy.toString());

  const sdkSell = getSellSolAmountFromTokenAmount({
    global,
    feeConfig,
    mintSupply: bn(1100),
    bondingCurve,
    amount: bn(100),
  });
  const localSell = quoteExactTokenInSell({
    tokenAmountIn: "100",
    virtualTokenReserves: "1000",
    virtualQuoteReserves: "1000",
    ...fees,
  });
  assert.equal(localSell.output_base_units, sdkSell.toString());
});

test("V3 synthetic migration exact token-out quote matches Pump SDK 4.3.1", () => {
  const sdkQuote = getBuyV3QuoteAmountFromTokenAmount({
    global,
    feeConfig,
    mintSupply: bn(1100),
    bondingCurve,
    amount: bn(120),
    curveBaseTokenBalance: bn(500),
  });
  const localQuote = quoteV3ExactTokenOutBuy({
    tokenAmountOut: "120",
    bondingCurve: {
      virtualTokenReserves: "1000",
      virtualQuoteReserves: "1000",
      realTokenReserves: "100",
      realQuoteReserves: "200",
    },
    curveBaseTokenBalance: "500",
    poolMigrationFee: "10",
    ...fees,
  });
  assert.equal(localQuote.input_base_units, sdkQuote.toString());
});

test("V3 synthetic migration exact quote-in token output matches Pump SDK 4.3.1", () => {
  const sdkQuote = getBuyV3TokenAmountFromQuoteAmount({
    global,
    feeConfig,
    mintSupply: bn(1100),
    bondingCurve,
    amount: bn(200),
    curveBaseTokenBalance: bn(500),
  });
  const localQuote = quoteV3ExactQuoteInBuy({
    spendableQuoteIn: "200",
    bondingCurve: {
      virtualTokenReserves: "1000",
      virtualQuoteReserves: "1000",
      realTokenReserves: "100",
      realQuoteReserves: "200",
    },
    curveBaseTokenBalance: "500",
    poolMigrationFee: "10",
    ...fees,
  });
  assert.equal(localQuote.output_base_units, sdkQuote.toString());
});
