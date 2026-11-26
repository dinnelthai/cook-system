import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
test("reference panel retains disabled execution and read-only receipt log",async()=>{const s=await readFile(new URL("../web/trade-panel-preview.mjs",import.meta.url),"utf8");for(const label of ["多钱包买卖","交易笔数","交易延迟（区块）","退出持仓","成交记录","仅当前代币"])assert.ok(s.includes(label));assert.ok(s.includes('data-preview-action disabled'));assert.ok(s.includes('reference-dump" disabled'));assert.ok(!s.includes("fetch("));assert.ok(!s.includes("setWallets"));});

import {receiptTradeRows} from "../web/trade-panel-preview.mjs";
const wallet="1".repeat(32),mint="2".repeat(32),pool="3".repeat(32),signature="4".repeat(64),row={signature,wallet,mint,pool,side:"BUY",quote_lamports:"500000000",slot:7,block_time:1700000000,evidence:"FINALIZED_RECEIPT_BALANCE_MATCH"};const hist=(trades,status="CONFIRMED")=>[{address:wallet,recent_transactions:[{signature,status,trades}]}];
test("log only displays scoped and reconciled finalized swaps, dedupes and withholds conflicting observations",()=>{assert.equal(receiptTradeRows(hist([row,row]),mint).length,1);assert.equal(receiptTradeRows(hist([row]),null).length,0);assert.equal(receiptTradeRows(hist([row]),"other").length,0);assert.equal(receiptTradeRows(hist([row]),null,{currentOnly:false}).length,1);assert.equal(receiptTradeRows(hist([row],"FAILED"),mint).length,0);assert.equal(receiptTradeRows(hist([{...row,evidence:"UNKNOWN"}]),mint).length,0);assert.equal(receiptTradeRows(hist([row,{...row,quote_lamports:"1"}]),mint).length,0);});
