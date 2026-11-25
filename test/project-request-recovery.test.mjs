import test from "node:test";
import assert from "node:assert/strict";
import {createProjectRequestRecovery} from "../web/project-request-recovery.mjs";
test("refresh recovery stores only an opaque key and rejects replacement",()=>{
 const map=new Map(),storage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};
 const first=createProjectRequestRecovery(storage);first.remember("qa-1");
 const refreshed=createProjectRequestRecovery(storage);assert.equal(refreshed.read(),"qa-1");
 assert.deepEqual([...map.values()],["qa-1"]);
 assert.throws(()=>refreshed.remember("qa-2"),/UNCONFIRMED/);
 refreshed.clear("qa-2");assert.equal(refreshed.read(),"qa-1");
 refreshed.clear("qa-1");assert.equal(refreshed.read(),null);
});
test("storage failure and corrupt key fail closed",()=>{
 const broken=createProjectRequestRecovery({getItem:()=>null,setItem:()=>{}});
 assert.throws(()=>broken.remember("qa"),/STORAGE_UNAVAILABLE/);
 const corrupt=createProjectRequestRecovery({getItem:()=>"{invalid}"});
 assert.throws(()=>corrupt.read(),/RECORD_INVALID/);
});
