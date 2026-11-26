import test from "node:test";
import assert from "node:assert/strict";
import {filterDiagnosticEntries} from "../web/settings-view.mjs";
const rows=[{event:"app.start",level:"INFO",time:"2026-01-01",detail:{}},{event:"report.failed",level:"ERROR",time:"2026-01-02",detail:{error_kind:"TypeError"}}];
test("diagnostics filter by level and sanitized detail without modifying input",()=>{assert.deepEqual(filterDiagnosticEntries(rows,{level:"ERROR",query:"typeerror"}),[rows[1]]);assert.deepEqual(filterDiagnosticEntries(rows),[rows[1],rows[0]]);assert.equal(rows[0].event,"app.start");assert.throws(()=>filterDiagnosticEntries(rows,{level:"OTHER"}));});
