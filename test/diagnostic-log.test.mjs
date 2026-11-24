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
