import test from "node:test";
import assert from "node:assert/strict";
import {createDiagnosticLog} from "../web/diagnostic-log.mjs";
import {collectDiagnosticBundle,sanitizeDiagnosticBundle} from "../web/diagnostic-bundle.mjs";
const browser=()=>{const log=createDiagnosticLog();log.record("app.start");return log.snapshot();};
const server={schema_version:"cook-http-diagnostics.1",mode:"LOCAL_ONLY",execution_enabled:false,dropped_count:0,entries:[{sequence:1,time:"2026-01-01T00:00:00.000Z",route_group:"projects",method:"GET",status_code:200,outcome:"FINISHED",duration_ms:1,url:"private-url"}]};
test("combined export strips sensitive server fields and preserves independent logs",async()=>{
 const result=await collectDiagnosticBundle(browser(),{fetchImpl:async()=>new Response(JSON.stringify(server))});
 assert.equal(result.server_status,"AVAILABLE");assert.equal(result.browser.entries.length,1);assert.equal(result.server.entries.length,1);
 assert.ok(!JSON.stringify(result).includes("private-url"));assert.deepEqual(sanitizeDiagnosticBundle(result),result);
});
test("unavailable or malformed HTTP diagnostics retain browser-only export",async()=>{
 for(const fetchImpl of [async()=>{throw Error("private");},async()=>new Response(JSON.stringify({...server,entries:[{...server.entries[0],route_group:"private"}]}))]){
  const r=await collectDiagnosticBundle(browser(),{fetchImpl});assert.equal(r.server_status,"UNAVAILABLE");assert.equal(r.server,null);assert.equal(r.browser.entries.length,1);
 }
});
