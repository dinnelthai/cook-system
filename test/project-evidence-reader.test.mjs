import test from "node:test";
import assert from "node:assert/strict";
import { createProjectAggregate } from "../src/inner-market/project-aggregate.mjs";
import { createProjectEvidenceReader } from "../src/inner-market/project-evidence-reader.mjs";
import { SPL_TOKEN_PROGRAM_ID } from "../src/adapters/pump/pump-account-codec.mjs";
const pin = "11111111111111111111111111111111";
const mint = "11111111111111111111111111111112";
const signature = "1".repeat(64);
const project = createProjectAggregate({ project_id:"evidence", profile:{name:"Evidence",symbol:"EVID"}, network:{cluster:"localnet",genesis_hash:pin}, token:{mint,issuance_signature:signature,creator_wallet_address:pin,supply_base_units:"100",decimals:6} });
function reader({genesis=pin, failed=false, create=true, decimals=6, receipt=true}={}) {
 const calls=[];
 const bytes=Buffer.alloc(82); bytes.writeBigUInt64LE(90n,36); bytes[44]=decimals; bytes[45]=1;
 const inspect=createProjectEvidenceReader({endpoint:"http://127.0.0.1:8899",expectedGenesis:pin,
 fetchImpl:async (_url,init)=>{
  assert.equal(init.redirect,"error");
  const q=JSON.parse(init.body);calls.push(q.method);
  const results={getGenesisHash:genesis,getTransaction:receipt?{slot:10,transaction:{signatures:[signature]},meta:{err:failed?{code:1}:null}}:null,getAccountInfo:{context:{slot:11},value:{owner:SPL_TOKEN_PROGRAM_ID,executable:false,data:[bytes.toString("base64"),"base64"]}}};
  if(q.method!=="getGenesisHash")assert.equal(q.params[1].commitment,"finalized");
  return {ok:true,json:async()=>({jsonrpc:"2.0",id:q.id,result:results[q.method]})};
 },
 decodeTransaction:()=>({events:create?[{event_kind:"MARKET_CREATED",market:{token_mint:mint,quote_mint:project.network.quote_mint},payload:{creator_address:pin,token_total_supply_base_units:"100",token_program_id:SPL_TOKEN_PROGRAM_ID}}]:[]})});
 return {inspect,calls};
}
test("read-only observation matches receipt and mint without changing lifecycle",async()=>{
 const {inspect,calls}=reader();const result=await inspect(project);
 assert.equal(result.status,"OBSERVATIONS_MATCH");assert.equal(result.current_supply_base_units,"90");assert.equal(result.issued_supply_base_units,"100");
 assert.equal(result.source_attestation,"UNKNOWN");assert.equal(result.lifecycle_mutated,false);assert.equal(project.token.issuance_status,"EVIDENCE_UNVERIFIED");
 assert.deepEqual(calls,["getGenesisHash","getTransaction","getAccountInfo","getGenesisHash"]);
});
test("reader fails closed on conflicting genesis, failed transaction, missing creation or decimals",async()=>{
 for(const settings of [{genesis:mint},{failed:true},{create:false},{decimals:9}]){
  const {inspect}=reader(settings);assert.equal((await inspect(project)).status,"REVIEW_REQUIRED");
 }
 assert.equal((await reader({receipt:false}).inspect(project)).status,"UNKNOWN");
});
test("unconfigured or non-loopback endpoint never requests data",async()=>{
 const inspect=createProjectEvidenceReader({endpoint:"https://example.invalid",expectedGenesis:pin,fetchImpl:()=>assert.fail("network access")});
 assert.equal((await inspect(project)).status,"UNKNOWN");
});
