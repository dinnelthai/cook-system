import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,rmSync,readFileSync,realpathSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {openHistoricalWorkspaceStore} from "../src/inner-market/historical-workspace-store.mjs";
import {createHistoricalProjectCatalogue} from "../src/inner-market/historical-project-catalogue.mjs";
import {exportHistoricalWorkspace} from "../src/inner-market/historical-project-workspace.mjs";
const read=name=>JSON.parse(readFileSync(new URL("../fixtures/synthetic/"+name,import.meta.url),"utf8"));
function setup(t){const dir=mkdtempSync(join(tmpdir(),"cook-workspace-"));t.after(()=>rmSync(dir,{recursive:true,force:true}));return join(realpathSync(dir),"workspace.sqlite");}
function bundle(second=false){const c=createHistoricalProjectCatalogue();c.add(read("inner-market-mvp.json"));if(second)c.add(read("m07/catalogue-second.json"));return exportHistoricalWorkspace(c);}
test("workspace revisions survive database close and reopen; old revision remains readable",t=>{
 const path=setup(t);let store=openHistoricalWorkspaceStore(path);
 try{assert.equal(store.load().revision,0);assert.equal(store.save(bundle(),{expectedRevision:0}).revision,1);}finally{store.close();}
 store=openHistoricalWorkspaceStore(path);
 try{assert.deepEqual(store.load().workspace,bundle());assert.equal(store.save(bundle(),{expectedRevision:1}).status,"ALREADY_PRESENT");assert.equal(store.save(bundle(true),{expectedRevision:1}).revision,2);assert.deepEqual(store.load(1).workspace,bundle());assert.equal(store.listRevisions().length,2);}finally{store.close();}
});
test("stale revision and invalid input never replace committed snapshots",t=>{
 const path=setup(t),a=openHistoricalWorkspaceStore(path),b=openHistoricalWorkspaceStore(path);
 try{a.save(bundle(),{expectedRevision:0});assert.throws(()=>b.save(bundle(true),{expectedRevision:0}),/WORKSPACE_REVISION_CONFLICT/);
 const invalid=bundle();invalid.execution_enabled=true;assert.throws(()=>b.save(invalid,{expectedRevision:1}),/INVALID_WORKSPACE/);
 assert.equal(b.load().revision,1);assert.deepEqual(b.load().workspace,bundle());assert.equal(b.listRevisions().length,1);
 assert.throws(()=>a.load(2),/WORKSPACE_REVISION_NOT_FOUND/);
 }finally{b.close();a.close();}
});

test("modified stored payload fails integrity verification without rewriting history",t=>{
 const path=setup(t),store=openHistoricalWorkspaceStore(path);
 try{store.save(bundle(),{expectedRevision:0});}finally{store.close();}
 const raw=new DatabaseSync(path);
 try{raw.exec("UPDATE historical_workspace_revision SET digest='invalid' WHERE revision=1");}finally{raw.close();}
 const reopened=openHistoricalWorkspaceStore(path);
 try{assert.throws(()=>reopened.load(),/WORKSPACE_INTEGRITY_FAILURE/);
 assert.throws(()=>reopened.save(bundle(true),{expectedRevision:1}),/WORKSPACE_INTEGRITY_FAILURE/);
 assert.equal(reopened.listRevisions().length,1);
 }finally{reopened.close();}
});
