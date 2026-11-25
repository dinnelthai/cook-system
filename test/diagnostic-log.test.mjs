import {test} from "node:test";
import assert from "node:assert/strict";
import {createDiagnosticLog,errorKind} from "../web/diagnostic-log.mjs";
test("diagnostic log is bounded, ordered and export snapshots are independent",()=>{
 const log=createDiagnosticLog({limit:2,clock:()=>new Date("2026-01-01T00:00:00Z")});
 log.record("app.start");log.record("page.open",{page:"dashboard"});log.record("report.built",{status:"REPORT_READY",buy_count:3});
 const s=log.snapshot();assert.equal(s.dropped_count,1);assert.deepEqual(s.entries.map(x=>x.seq),[2,3]);s.entries[0].detail.page="changed";assert.equal(log.snapshot().entries[0].detail.page,"dashboard");
 log.clear();assert.equal(log.snapshot().entries[0].event,"log.cleared");
});
test("diagnostics export only known fields and strips raw issue identifiers",()=>{
 const log=createDiagnosticLog();log.record("report.built",{source_mode:"SYNTHETIC",issues:["UNVERIFIED_MARKET_TRADE:secret-123","https://rpc.example/secret","MISSING_CURVE_FIELD:private"],privateKey:"secret-123",rpcUrl:"https://rpc.example/secret",message:"secret-123",page:"secret-123",buy_count:-1},"WARN");
 const s=log.snapshot();assert.deepEqual(s.entries[0].detail,{source_mode:"SYNTHETIC",issues:["UNVERIFIED_MARKET_TRADE","OTHER_ISSUE","MISSING_CURVE_FIELD"]});assert.ok(!JSON.stringify(s).includes("secret"));assert.equal(errorKind(new TypeError("secret")),"TypeError");
 assert.throws(()=>log.record("secret"),TypeError);
});

test("diagnostics persist across reload and re-sanitize imported storage",()=>{
 const data=new Map(),storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};
 const first=createDiagnosticLog({storage});first.record("app.start");first.record("page.open",{page:"dashboard"});
 const saved=JSON.parse(data.get("cook-diagnostics.v1"));saved.entries[0].detail={message:"secret",issues:["MISSING_CURVE_FIELD:secret"]};data.set("cook-diagnostics.v1",JSON.stringify(saved));
 const second=createDiagnosticLog({storage});second.record("report.built");
 assert.deepEqual(second.snapshot().entries.map(x=>x.seq),[1,2,3]);assert.ok(!JSON.stringify(second.snapshot()).includes("secret"));
 second.clear();assert.equal(createDiagnosticLog({storage}).snapshot().entries[0].event,"log.cleared");
});
test("invalid or unavailable diagnostics storage does not crash logging",()=>{
 const storage={getItem:()=>"{broken",setItem:()=>{throw Error("quota");}};
 const log=createDiagnosticLog({storage});log.record("app.start");
 assert.equal(log.snapshot().persistence_status,"UNAVAILABLE");assert.equal(log.snapshot().entries.length,1);
});
