import test from "node:test";
import assert from "node:assert/strict";
import {webcrypto,createHash} from "node:crypto";
import {canonicalJson} from "../src/core/canonical-json.mjs";
import {historicalReportDigest,linkedReportMatches,formatDeclaredSupply,parseDeclaredSupply,preserveDraftRegistration} from "../web/project-integrity-view.mjs";
test("browser digest equals existing canonical archive digest and fails closed without crypto",async()=>{
 const input={z:1,a:{y:"2",x:[3,4]}};
 assert.equal(await historicalReportDigest(input,webcrypto.subtle),createHash("sha256").update(canonicalJson(input)).digest("hex"));
 assert.equal(await historicalReportDigest(input,null),null);
});
test("scope alone is insufficient and duplicate or conflicting archive rows are blocked",()=>{
 const digest="a".repeat(64),scope={projectId:"p",openingCutoff:"a",closingCutoff:"b"};
 const row={report_digest:digest,opening_cutoff:"a",closing_cutoff:"b",status:"INCOMPLETE"};
 const v={project_id:"p",project_revision:1,execution_enabled:false,runtime:{project_id:"p",project_revision:1,asset_intervals:[row]}};
 assert.equal(linkedReportMatches(v,digest,scope),true);
 assert.equal(linkedReportMatches(v,"b".repeat(64),scope),false);
 assert.equal(linkedReportMatches(v,digest,{...scope,projectId:"other"}),false);
 for(const rows of [[row,row],[{...row,status:"REVIEW_REQUIRED"}],[]])assert.equal(linkedReportMatches({...v,runtime:{...v.runtime,asset_intervals:rows}},digest,scope),false);
});
test("draft supply retains every base unit and unknown configuration",()=>{
 for(const [n,d] of [["1",9],["1000000001",9],["18446744073709551615",6],["42",0]])assert.deepEqual(parseDeclaredSupply(formatDeclaredSupply(n,d),String(d)),{supply_base_units:n,decimals:d});
 assert.deepEqual(parseDeclaredSupply("",""),{supply_base_units:null,decimals:null});
 for(const s of ["0","-1","1e3","0.0000000001"])assert.throws(()=>parseDeclaredSupply(s,"9"));
 assert.throws(()=>parseDeclaredSupply("1.01","1"));
});
test("editing unrelated fields preserves existing wallet declarations",()=>{
 const g={group_id:"dev-wallets",members:[{wallet_address:"a",allocation_limit_base_units:"123"}]};
 const p={token:{creator_wallet_address:"a"},wallet_groups:[g]};
 assert.equal(preserveDraftRegistration(p,"a",null),g);
 assert.throws(()=>preserveDraftRegistration(p,"b",null),/REQUIRES_SEPARATE_REVIEW/);
});
