import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,rm,writeFile,readFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createDiagnosticLog} from "../web/diagnostic-log.mjs";
import {archiveDiagnosticSnapshot} from "../src/core/diagnostic-archive.mjs";
test("diagnostic archive is sanitized and idempotent",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"cook-diag-archive-")),inputPath=join(dir,"input.json"),directory=join(dir,"private");
 try{const log=createDiagnosticLog();log.record("report.built");const s=log.snapshot();s.entries[0].detail={privateKey:"secret",issues:["MISSING_CURVE_FIELD:secret"]};s.privateKey="secret";
  await writeFile(inputPath,JSON.stringify(s));const a=await archiveDiagnosticSnapshot({inputPath,directory}),b=await archiveDiagnosticSnapshot({inputPath,directory});
  assert.equal(a.archive_id,b.archive_id);const archived=await readFile(join(directory,a.archive_id+".json"),"utf8");assert.ok(!archived.includes("secret"));assert.ok(archived.includes("MISSING_CURVE_FIELD"));
  await writeFile(join(directory,a.archive_id+".json"),"damaged");await assert.rejects(()=>archiveDiagnosticSnapshot({inputPath,directory}),/DIAGNOSTIC_ARCHIVE_CONFLICT/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test("invalid exported event or sequence cannot be archived",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"cook-diag-bad-")),inputPath=join(dir,"input.json");
 try{const log=createDiagnosticLog();log.record("app.start");const s=log.snapshot();s.entries[0].event="private-value";await writeFile(inputPath,JSON.stringify(s));
  await assert.rejects(()=>archiveDiagnosticSnapshot({inputPath,directory:join(dir,"private")}),/INVALID_DIAGNOSTIC_ROW/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
