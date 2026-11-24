import test from "node:test";
import assert from "node:assert/strict";
import {createLocalFaucet,parseSol} from "../src/inner-market/local-faucet.mjs";
const key="11111111111111111111111111111111",genesis="11111111111111111111111111111112";
test("exact amounts",()=>{assert.equal(parseSol("1.000000001"),1000000001);for(const x of ["0","-1","101","1e-2","0.0000000001"])assert.throws(()=>parseSol(x))});
test("local only, pin genesis, no retries",async()=>{
 const calls=[];const fetchImpl=async(url,init)=>{const b=JSON.parse(init.body);calls.push(b.method);return {ok:true,json:async()=>({id:b.id,result:b.method==="getGenesisHash"?genesis:b.method==="getBalance"?{value:1000000000}:"1".repeat(64)})}};
 const opts={enabled:true,endpoint:"http://127.0.0.1:8899",expectedGenesis:genesis,fetchImpl};
 const f=createLocalFaucet(opts);
 assert.equal((await f.balance(key)).balance_lamports,"1000000000");
 assert.equal((await f.airdrop(key,"1")).status,"SUBMITTED_NOT_CONFIRMED");
 assert.deepEqual(calls,["getGenesisHash","getBalance","getGenesisHash","requestAirdrop"]);
 for(const change of [{enabled:false},{endpoint:"https://api.mainnet-beta.solana.com"},{expectedGenesis:key},{expectedGenesis:"EtWTRABZaYq6iMfeYKouRu166VU2xqa1"}])await assert.rejects(()=>createLocalFaucet({...opts,...change}).airdrop(key,"1"));
 assert.equal(calls.filter(x=>x==="requestAirdrop").length,1);
});
