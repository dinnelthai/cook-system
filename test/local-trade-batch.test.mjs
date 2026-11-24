import test from 'node:test';
import assert from 'node:assert/strict';
import {runTradeBatch} from '../src/inner-market/local-trade-batch.mjs';
test('processes in order and stops when confirmation is uncertain',async()=>{
 const calls=[];const r=await runTradeBatch(['a','b','c'],async w=>{calls.push(w);return {status:w==='b'?'UNKNOWN':'CONFIRMED'}});
 assert.deepEqual(calls,['a','b']);assert.deepEqual(r.map(x=>x.status),['CONFIRMED','UNKNOWN','NOT_ATTEMPTED']);
});
test('pre-submission failure is shown for the individual wallet',async()=>{
 const r=await runTradeBatch(['a','b'],async w=>w==='a'?{status:'REJECTED'}:{status:'CONFIRMED'});
 assert.deepEqual(r.map(x=>x.status),['REJECTED','CONFIRMED']);
});
import {createLocalTrading} from '../src/inner-market/local-trading.mjs';
test('rejects disabled or non-loopback RPC before accessing wallets',async()=>{
 let accessed=0;const wallets={list:async()=>{accessed++;return []}};
 for(const opts of [{enabled:false,endpoint:'http://127.0.0.1:8899'},{enabled:true,endpoint:'http://192.168.1.104:8899'}]){
  const service=createLocalTrading({...opts,expectedGenesis:'11111111111111111111111111111112',labUrl:'http://192.168.1.104:3100',wallets});
  await assert.rejects(()=>service.batch({side:'buy',amount:'0.001',addresses:['11111111111111111111111111111111']}));
 }
 assert.equal(accessed,0);
});
test('market change prevents any wallet signer from loading',async t=>{
 const original=globalThis.fetch;let signerLoaded=0;t.after(()=>{globalThis.fetch=original});
 const key='11111111111111111111111111111111',genesis='11111111111111111111111111111112';
 globalThis.fetch=async(url,opts={})=>{
  const u=String(url);
  if(u.includes('/ui-config'))return Response.json({defaultMint:key,readKey:'test-key'});
  if(u.includes('/v1/tokens/'))return Response.json({mint:key,stage:'pumpswap',pool:genesis});
  const body=JSON.parse(opts.body);return Response.json({jsonrpc:'2.0',id:body.id,result:genesis});
 };
 const service=createLocalTrading({enabled:true,endpoint:'http://127.0.0.1:8899',expectedGenesis:genesis,labUrl:'http://192.168.1.104:3100',wallets:{list:async()=>[{address:key}],loadSigner:async()=>{signerLoaded++;throw Error('unexpected')}}});
 await assert.rejects(()=>service.batch({side:'buy',amount:'0.001',addresses:[key],mint:key,pool:key}),/MARKET_CHANGED/);
 assert.equal(signerLoaded,0);
});
