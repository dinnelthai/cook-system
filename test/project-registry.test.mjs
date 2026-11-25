import test from "node:test";
import assert from "node:assert/strict";
import {createProjectRegistry} from "../web/project-registry.mjs";
class MemoryStorage{value=null;getItem(){return this.value}setItem(_key,value){this.value=value}}
const base={name:"Test Token",symbol:"test",description:"local QA",supply:"1000000000",decimals:6,quote_asset:"SOL",network:"LOCALNET",creator_wallet:"11111111111111111111111111111111",website:"https://example.com",telegram:"",twitter:""};
test("project draft persists configuration and never implies issuance",()=>{
 const storage=new MemoryStorage(),registry=createProjectRegistry({storage,idFactory:()=>"p1",now:()=>"2026-11-25T00:00:00.000Z"});
 const row=registry.saveDraft(base);assert.equal(row.id,"p1");assert.equal(row.symbol,"TEST");assert.equal(row.status,"CONFIGURED_NOT_ISSUED");assert.equal(row.issuance_records.length,0);
 const restored=createProjectRegistry({storage});assert.equal(restored.get("p1").name,"Test Token");
 const bundle=restored.exportBundle();assert.equal(bundle.execution_enabled,false);assert.equal(bundle.source_attestation,"UNKNOWN");
});
test("issuance evidence is deduplicated and remains explicitly unverified",()=>{
 const registry=createProjectRegistry({storage:new MemoryStorage(),idFactory:()=>"p1"}),row=registry.saveDraft(base),signature="1".repeat(64),mint="11111111111111111111111111111112";
 const saved=registry.recordIssuanceEvidence(row.id,{mint,signature});assert.equal(saved.status,"RECORDED_UNVERIFIED");assert.equal(saved.record.status,"ISSUANCE_EVIDENCE_UNVERIFIED");assert.equal(saved.record.issuance_records[0].status,"UNVERIFIED");assert.equal(saved.record.issuance_records[0].verification,"NOT_PERFORMED");
 assert.equal(registry.recordIssuanceEvidence(row.id,{mint,signature}).status,"ALREADY_PRESENT");
 assert.throws(()=>registry.recordIssuanceEvidence(row.id,{mint:"11111111111111111111111111111113",signature}),/ISSUANCE_SIGNATURE_CONFLICT/);
 assert.equal(registry.get(row.id).status,"ISSUANCE_EVIDENCE_UNVERIFIED");
});
test("invalid supply, symbol, mint, signature, URL and unsafe supply precision are rejected",()=>{
 const registry=createProjectRegistry({storage:new MemoryStorage(),idFactory:()=>"p1"});
 for(const patch of [{supply:"0"},{supply:"1e9"},{symbol:"BAD SYMBOL"},{decimals:10},{supply:"18446744073709551615",decimals:1},{website:"javascript:alert(1)"}])assert.throws(()=>registry.saveDraft({...base,...patch}));
 const row=registry.saveDraft(base);assert.throws(()=>registry.recordIssuanceEvidence(row.id,{mint:"bad",signature:"1".repeat(64)}));assert.throws(()=>registry.recordIssuanceEvidence(row.id,{mint:base.creator_wallet,signature:"1".repeat(63)}));
});
test("corrupt local registry is not silently treated as empty",()=>{
 const storage=new MemoryStorage();storage.value="{broken";const registry=createProjectRegistry({storage});assert.throws(()=>registry.list(),/PROJECT_REGISTRY_CORRUPT/);
});
