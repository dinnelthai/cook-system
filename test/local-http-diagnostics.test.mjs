import test from "node:test";
import assert from "node:assert/strict";
import {EventEmitter} from "node:events";
import {createHttpDiagnostics,classifyDiagnosticRoute} from "../src/inner-market/local-http-diagnostics.mjs";
test("local transport diagnostics retain only bounded sanitized records",()=>{
 const d=createHttpDiagnostics({limit:2,clock:()=>new Date(0),monotonic:()=>10});
 for(const path of ["/api/projects/private-id","/api/local-wallet/private-address","/api/unknown?secret=token"]){
  const r=new EventEmitter();r.statusCode=200;
  d.observe({method:"PRIVATE_METHOD",url:path,headers:{authorization:"private-token"}},r)(classifyDiagnosticRoute(path));
  r.emit("finish");r.emit("close");
 }
 const s=d.snapshot();assert.equal(s.entries.length,2);assert.equal(s.dropped_count,1);
 assert.deepEqual(s.entries.map(x=>x.route_group),["local_wallet","unknown"]);assert.ok(s.entries.every(x=>x.method==="OTHER"));
 assert.ok(!JSON.stringify(s).includes("private"));assert.ok(!JSON.stringify(s).includes("secret"));
 s.entries[0].route_group="changed";assert.equal(d.snapshot().entries[0].route_group,"local_wallet");
});
test("disconnect is distinguished from completed HTTP responses",()=>{
 const d=createHttpDiagnostics(),r=new EventEmitter();r.statusCode=200;
 d.observe({method:"GET"},r)("terminal");r.emit("close");
 assert.equal(d.snapshot().entries[0].outcome,"DISCONNECTED");assert.equal(d.snapshot().entries[0].status_code,null);
});
