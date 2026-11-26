import test from "node:test";
import assert from "node:assert/strict";
import {createWalletAdapter,WALLET_MODE} from "../web/wallet-adapter.mjs";

test("local adapter keeps existing wallet HTTP contract",async()=>{
 const calls=[];
 const wallet=createWalletAdapter({mode:WALLET_MODE.LOCALNET,fetchImpl:async(url,opts)=>{
  calls.push([url,opts.method,JSON.parse(opts.body),opts.cache,opts.headers["Content-Type"]]);
  return {ok:true,json:async()=>({address:"test",wallets:[]})};
 }});
 await wallet.list();await wallet.create();await wallet.balance({address:"a"});
 await wallet.portfolio({limit:5});await wallet.airdrop({address:"a",amount:"1"});
 await wallet.transfer({from:"a",to:"b",amount:"0.1"});
 assert.deepEqual(calls.map(([url,method,body,cache,type])=>[url,method,body,cache,type]),[
  ["list",{}],["create",{}],["balance",{address:"a"}],["portfolio",{limit:5}],
  ["airdrop",{address:"a",amount:"1"}],["transfer",{from:"a",to:"b",amount:"0.1"}]
 ].map(([path,body])=>["/api/local-wallet/"+path,"POST",body,"no-store","application/json"]));
 assert.equal(wallet.provider,"local-wallet");assert.equal(wallet.capabilities.sign,false);
 assert.equal(wallet.trade,undefined);
});
test("local errors remain explicit",async()=>{
 const wallet=createWalletAdapter({mode:"localnet",fetchImpl:async()=>({ok:false,json:async()=>({code:"GENESIS_MISMATCH"})})});
 await assert.rejects(wallet.balance({address:"a"}),/GENESIS_MISMATCH/);
});
test("reserved Phantom mode fails closed without invoking local transport",async()=>{
 let calls=0;const wallet=createWalletAdapter({mode:"mainnet",fetchImpl:async()=>{calls++;throw Error("unexpected")}});
 assert.equal(wallet.provider,"phantom");assert.equal(wallet.ready,false);
 assert.equal(Object.values(wallet.capabilities).every(v=>!v),true);
 for(const method of ["list","create","balance","portfolio","airdrop","transfer"])await assert.rejects(wallet[method]({}),/PHANTOM_ADAPTER_NOT_IMPLEMENTED/);
 assert.equal(calls,0);
});
test("missing or unknown mode cannot fall back to Localnet",()=>{
 for(const mode of [undefined,"devnet","production","LOCALNET"])assert.throws(()=>createWalletAdapter({mode}),/INVALID_WALLET_MODE/);
});

test("batch creation uses a Localnet-only adapter action",async()=>{let body,url;const local=createWalletAdapter({mode:"localnet",fetchImpl:async(u,o)=>{url=u;body=JSON.parse(o.body);return {ok:true,json:async()=>({status:"CREATED",requested:1,created_count:1,wallets:[{address:"test"}]})}}});await local.createBatch({count:1});assert.equal(url,"/api/local-wallet/create-batch");assert.deepEqual(body,{count:1});const main=createWalletAdapter({mode:"mainnet",fetchImpl:()=>{throw Error("unexpected")}});await assert.rejects(()=>main.createBatch({count:1}),/PHANTOM_ADAPTER_NOT_IMPLEMENTED/);});

test("portfolio optionally carries selected public mint for read-only supply query",async()=>{let body;const wallet=createWalletAdapter({mode:"localnet",fetchImpl:async(url,options)=>{body=JSON.parse(options.body);return {ok:true,json:async()=>({})}}});await wallet.portfolio({limit:5,mint:"mint"});assert.deepEqual(body,{limit:5,mint:"mint"});});
