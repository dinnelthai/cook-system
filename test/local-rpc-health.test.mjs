import test from "node:test";
import assert from "node:assert/strict";
import {checkLocalRpcHealth} from "../src/inner-market/local-rpc-health.mjs";
test("reject remote, credentialed and malformed RPC endpoints without requests",async()=>{
 let requests=0;const fetchImpl=async()=>{requests++;throw Error("must not request")};
 for(const url of [undefined,"https://example.com","http://127.0.0.1.evil.example","http://a:b@localhost:8899","file:///tmp/rpc","http://localhost:8899/?token=x"]){
  const result=await checkLocalRpcHealth(url,{fetchImpl});
  assert.equal(result.network_verified,false);
  assert.ok(["NOT_CONFIGURED","INVALID_CONFIGURATION"].includes(result.status));
 }
 assert.equal(requests,0);
});
test("only fixed health methods are requested and reachable is not proof of network",async()=>{
 const calls=[];
 const results={getHealth:"ok",getVersion:{"solana-core":"test"},getSlot:123,getGenesisHash:"synthetic-genesis"};
 const result=await checkLocalRpcHealth("http://127.0.0.1:8899",{fetchImpl:async(url,init)=>{
  const body=JSON.parse(init.body);calls.push(body.method);assert.equal(init.redirect,"error");
  return {ok:true,json:async()=>({jsonrpc:"2.0",id:body.id,result:results[body.method]})};
 }});
 assert.deepEqual(calls.sort(),Object.keys(results).sort());
 assert.equal(result.status,"RPC_REACHABLE");assert.equal(result.slot,123);assert.equal(result.network_verified,false);
});
test("bad response is unavailable or requires review",async()=>{
 const result=await checkLocalRpcHealth("http://localhost:8899",{fetchImpl:async()=>({ok:true,json:async()=>({result:null})})});
 assert.equal(result.status,"REVIEW_REQUIRED");
});
